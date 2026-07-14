/**
 * BLE Device Manager
 *
 * Handles Bluetooth Low Energy connectivity with wearable device
 * Provides fallback to demo mode with simulated sensor data
 */

export interface BLEDevice {
  id: string;
  name: string;
  isConnected: boolean;
}

export interface SensorData {
  heartRate: number;
  gsr: number;
  temperature: number;
  timestamp: number;
}

type EpisodePhase = "normal" | "rising" | "peak" | "recovering";

class BLEManager {
  private isConnected = false;
  private currentDevice: BLEDevice | null = null;
  private listeners: Array<(data: SensorData) => void> = [];
  private simulationInterval: ReturnType<typeof setInterval> | null = null;

  // Smooth random-walk state so values drift realistically instead of jumping every tick
  private simHeartRate = 72;
  private simGsr = 15;
  private simTemperature = 36.8;

  // Episode state machine: occasionally simulates a reaction building and resolving,
  // so heart rate / skin humidity / temperature all sweep through Safe, Warning, and
  // Critical ranges during demo mode instead of staying flat forever.
  private episodePhase: EpisodePhase = "normal";
  private episodeTicksRemaining = 0;
  private episodeTargets = { heartRate: 72, gsr: 15, temperature: 36.8 };

  private readonly BASELINE = { heartRate: 72, gsr: 15, temperature: 36.8 };
  private readonly EPISODE_PEAK = { heartRate: 132, gsr: 38, temperature: 38.3 };


  /**
   * Initialize BLE and scan for devices
   * Falls back to demo mode if BLE is unavailable
   */
  async scanForDevices(): Promise<BLEDevice[]> {
    try {
      // TODO: Implement actual BLE scanning using expo-ble or react-native-ble-plx
      // For now, return mock devices
      return [
        { id: "device_1", name: "XIAO ESP32 C3", isConnected: false },
        { id: "device_2", name: "Wearable Band", isConnected: false },
      ];
    } catch (error) {
      console.error("BLE scan failed:", error);
      return [];
    }
  }

  /**
   * Connect to a specific BLE device
   */
  async connectToDevice(deviceId: string): Promise<boolean> {
    try {
      // TODO: Implement actual BLE connection
      this.isConnected = true;
      this.currentDevice = {
        id: deviceId,
        name: "XIAO ESP32 C3",
        isConnected: true,
      };

      // Start receiving data
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
    this.simGsr = this.step(this.simGsr, target.gsr, 3, 0.8);
    this.simTemperature = this.step(this.simTemperature, target.temperature, 0.15, 0.05);

    return {
      heartRate: Math.max(45, Math.min(160, this.simHeartRate)),
      gsr: Math.max(3, Math.min(55, this.simGsr)),
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

  /**
   * Forget/unpair device
   */
  async forgetDevice(): Promise<void> {
    await this.disconnect();
    this.currentDevice = null;
  }
}

// Export singleton instance
export const bleManager = new BLEManager();
