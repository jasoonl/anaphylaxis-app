import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * BLE Device Manager
 *
 * Handles Bluetooth Low Energy connectivity with wearable device.
 *
 * IMPORTANT: Real BLE radio scanning/pairing requires a native module
 * (e.g. react-native-ble-plx) compiled into a custom dev client - it cannot
 * run inside Expo Go, which only bundles Expo's own precompiled module set.
 * Since this app is built to run in Expo Go without an Apple Developer
 * account or custom build, this manager provides a fully real device
 * PAIRING/MANAGEMENT layer (persisted paired-device list, add/remove/
 * reconnect, only one device active at a time - all genuinely functional
 * app state) on top of simulated sensor data, since there's no actual
 * hardware to read from in this environment.
 */

const PAIRED_DEVICES_KEY = "pairedDevices";
const ACTIVE_DEVICE_KEY = "activeDeviceId";

export interface BLEDevice {
  id: string;
  name: string;
  isConnected: boolean;
}

export interface PairedDevice {
  id: string;
  name: string;
  pairedAt: number;
  lastConnectedAt: number | null;
}

export interface SensorData {
  heartRate: number;
  gsr: number; // g/m2/h - transepidermal water loss (TEWL); field name kept for compatibility
  temperature: number;
  timestamp: number;
}

type EpisodePhase = "normal" | "rising" | "peak" | "recovering";

class BLEManager {
  private isConnected = false;
  private currentDevice: BLEDevice | null = null;
  private listeners: Array<(data: SensorData) => void> = [];
  private simulationInterval: ReturnType<typeof setInterval> | null = null;

  private pairedDevices: PairedDevice[] = [];
  private activeDeviceId: string | null = null;
  private loaded = false;

  // Smooth random-walk state so values drift realistically instead of jumping every tick
  private simHeartRate = 72;
  private simGsr = 10; // g/m2/h - TEWL baseline (Schuler et al. 2023 cohort mean)
  private simTemperature = 36.8;

  // Episode state machine: occasionally simulates a reaction building and resolving,
  // so heart rate / skin humidity / temperature all sweep through Safe, Warning, and
  // Critical ranges during demo mode instead of staying flat forever.
  private episodePhase: EpisodePhase = "normal";
  private episodeTicksRemaining = 0;
  private episodeTargets = { heartRate: 72, gsr: 15, temperature: 36.8 };

  private readonly BASELINE = { heartRate: 72, gsr: 10, temperature: 36.8 };
  private readonly EPISODE_PEAK = { heartRate: 132, gsr: 13.5, temperature: 38.3 }; // gsr = baseline + severe reaction mean rise (Schuler et al.)


  /**
   * Load persisted paired devices and active device from storage.
   * Safe to call repeatedly - only loads once.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const [devicesJson, activeId] = await Promise.all([
        AsyncStorage.getItem(PAIRED_DEVICES_KEY),
        AsyncStorage.getItem(ACTIVE_DEVICE_KEY),
      ]);
      this.pairedDevices = devicesJson ? JSON.parse(devicesJson) : [];
      this.activeDeviceId = activeId || null;
    } catch (error) {
      console.error("Failed to load paired devices:", error);
      this.pairedDevices = [];
      this.activeDeviceId = null;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(this.pairedDevices));
      if (this.activeDeviceId) {
        await AsyncStorage.setItem(ACTIVE_DEVICE_KEY, this.activeDeviceId);
      } else {
        await AsyncStorage.removeItem(ACTIVE_DEVICE_KEY);
      }
    } catch (error) {
      console.error("Failed to persist device state:", error);
    }
  }

  /**
   * Simulate discovering nearby devices available to pair. Returns devices
   * not already in the paired list. (Real BLE scanning isn't possible in
   * Expo Go - see class-level note.)
   */
  async scanForDevices(): Promise<BLEDevice[]> {
    await this.ensureLoaded();
    const candidates: BLEDevice[] = [
      { id: "xiao-esp32-c3", name: "XIAO ESP32 C3", isConnected: false },
      { id: "wearable-band-01", name: "Wearable Band", isConnected: false },
      { id: "guard-sensor-02", name: "Anaphylaxis Guard Sensor", isConnected: false },
    ];
    const pairedIds = new Set(this.pairedDevices.map((d) => d.id));
    return candidates.filter((c) => !pairedIds.has(c.id));
  }

  /** Returns all paired (known) devices, most recently connected first. */
  async getPairedDevices(): Promise<PairedDevice[]> {
    await this.ensureLoaded();
    return [...this.pairedDevices].sort(
      (a, b) => (b.lastConnectedAt ?? b.pairedAt) - (a.lastConnectedAt ?? a.pairedAt)
    );
  }

  /** ID of the currently active (streaming) device, if any. */
  async getActiveDeviceId(): Promise<string | null> {
    await this.ensureLoaded();
    return this.activeDeviceId;
  }

  /**
   * Pair a newly discovered device: adds it to the paired list and connects
   * to it as the active device (disconnecting any previously active one -
   * only one device streams at a time, matching how a real wearable works).
   */
  async pairDevice(device: BLEDevice): Promise<PairedDevice> {
    await this.ensureLoaded();
    const now = Date.now();
    const paired: PairedDevice = {
      id: device.id,
      name: device.name,
      pairedAt: now,
      lastConnectedAt: now,
    };
    this.pairedDevices = [...this.pairedDevices.filter((d) => d.id !== device.id), paired];
    await this.setActiveDevice(device.id, device.name);
    await this.persist();
    return paired;
  }

  /**
   * Reconnect to a previously paired device that isn't currently active.
   */
  async reconnectDevice(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const device = this.pairedDevices.find((d) => d.id === id);
    if (!device) return false;
    await this.setActiveDevice(device.id, device.name);
    device.lastConnectedAt = Date.now();
    await this.persist();
    return true;
  }

  /**
   * Remove (unpair) a device. If it was the active device, disconnects and
   * stops the data stream first.
   */
  async removeDevice(id: string): Promise<void> {
    await this.ensureLoaded();
    if (this.activeDeviceId === id) {
      await this.disconnect();
    }
    this.pairedDevices = this.pairedDevices.filter((d) => d.id !== id);
    await this.persist();
  }

  /** Disconnects the active device without unpairing it - it stays in the paired list. */
  async disconnectActive(): Promise<void> {
    await this.disconnect();
    await this.persist();
  }

  private async setActiveDevice(id: string, name: string): Promise<void> {
    this.isConnected = true;
    this.currentDevice = { id, name, isConnected: true };
    this.activeDeviceId = id;
    this.startDataStream();
  }

  /**
   * Connect to a specific BLE device by ID. Kept for backward compatibility
   * with existing demo-mode wiring; prefer pairDevice/reconnectDevice for
   * the device management screen.
   */
  async connectToDevice(deviceId: string): Promise<boolean> {
    try {
      this.isConnected = true;
      this.currentDevice = {
        id: deviceId,
        name: "Demo Sensor",
        isConnected: true,
      };
      this.startDataStream();
      return true;
    } catch (error) {
      console.error("Connection failed:", error);
      return false;
    }
  }

  /**
   * Disconnect from current device
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.currentDevice = null;
    this.activeDeviceId = null;
    this.stopDataStream();
  }

  /**
   * Subscribe to sensor data updates
   */
  onSensorData(callback: (data: SensorData) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Start streaming data from device or demo mode
   */
  private startDataStream(): void {
    if (this.simulationInterval) clearInterval(this.simulationInterval);

    this.simulationInterval = setInterval(() => {
      const data = this.generateSensorData();
      this.listeners.forEach((listener) => listener(data));
    }, 1000);
  }

  /**
   * Stop data stream
   */
  private stopDataStream(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  /**
   * Generate simulated sensor data for demo mode.
   *
   * Uses a smooth random walk toward a moving target, rather than independent
   * random noise each tick, so values drift realistically. An episode state
   * machine occasionally (roughly every 30-90s) ramps vitals up into Warning
   * and Critical territory over ~15s, holds briefly, then recovers over ~20s -
   * simulating a reaction building and resolving so every risk level and all
   * three metrics are actually exercised during testing, not just the safe range.
   */
  private generateSensorData(): SensorData {
    this.advanceEpisode();

    const target =
      this.episodePhase === "normal" ? this.BASELINE : this.episodeTargets;

    // Random walk: step a fraction of the way toward the current target, plus jitter
    this.simHeartRate = this.step(this.simHeartRate, target.heartRate, 6, 1.2);
    this.simGsr = this.step(this.simGsr, target.gsr, 1, 0.3);
    this.simTemperature = this.step(this.simTemperature, target.temperature, 0.15, 0.05);

    return {
      heartRate: Math.max(45, Math.min(160, this.simHeartRate)),
      gsr: Math.max(5, Math.min(20, this.simGsr)),
      temperature: Math.max(34.5, Math.min(39.5, this.simTemperature)),
      timestamp: Date.now(),
    };
  }

  /** Moves `current` a step toward `target`, with a bit of random jitter added. */
  private step(current: number, target: number, maxStep: number, jitter: number): number {
    const direction = target - current;
    const move = Math.sign(direction) * Math.min(Math.abs(direction) * 0.25, maxStep);
    const noise = (Math.random() - 0.5) * jitter;
    return current + move + noise;
  }

  /** Advances the episode state machine by one tick (called once per generated sample). */
  private advanceEpisode(): void {
    if (this.episodePhase === "normal") {
      // ~3% chance per second to start a new episode (roughly every ~30-90s in practice)
      if (Math.random() < 0.03) {
        this.episodePhase = "rising";
        this.episodeTicksRemaining = 12 + Math.floor(Math.random() * 8); // ~12-20s ramp up
        this.episodeTargets = { ...this.EPISODE_PEAK };
      }
      return;
    }

    this.episodeTicksRemaining -= 1;
    if (this.episodeTicksRemaining > 0) return;

    if (this.episodePhase === "rising") {
      this.episodePhase = "peak";
      this.episodeTicksRemaining = 5 + Math.floor(Math.random() * 6); // hold ~5-10s
    } else if (this.episodePhase === "peak") {
      this.episodePhase = "recovering";
      this.episodeTicksRemaining = 18 + Math.floor(Math.random() * 10); // ~18-27s recovery
      this.episodeTargets = { ...this.BASELINE };
    } else if (this.episodePhase === "recovering") {
      this.episodePhase = "normal";
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): { isConnected: boolean; device: BLEDevice | null } {
    return {
      isConnected: this.isConnected,
      device: this.currentDevice,
    };
  }
}

// Export singleton instance
export const bleManager = new BLEManager();
