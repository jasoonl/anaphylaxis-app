import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isBleAvailable,
  scanForRealDevices,
  connectAndStream,
  BLE_DEVICE_NAME_HINT,
} from "./ble-real";

/**
 * BLE Device Manager
 *
 * Handles connectivity to the wearable sensor and streams SensorData to
 * subscribers.
 *
 * REAL SENSOR DATA ONLY. There is no simulated/demo mode: the app scans for,
 * connects to, and streams live data from the XIAO ESP32C3 over Bluetooth.
 * If no device is connected, no data flows and the UI shows "No device
 * connected". See lib/ble-real.ts for the radio layer and the firmware
 * contract (UUIDs + JSON payload format).
 *
 * Requires a native build (react-native-ble-plx); BLE is unavailable in
 * Expo Go, where scanning simply returns no devices.
 *
 * Also owns the pairing layer: persisted paired-device list, add/remove/
 * reconnect, one active device at a time.
 */

const PAIRED_DEVICES_KEY = "pairedDevices";
const ACTIVE_DEVICE_KEY = "activeDeviceId";

export interface BLEDevice {
  id: string;
  name: string;
  isConnected: boolean;
  rssi?: number | null; // signal strength from a real scan (absent for simulated)
  isRecognized?: boolean; // advertises our service UUID (real scans only)
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

class BLEManager {
  private isConnected = false;
  private currentDevice: BLEDevice | null = null;
  private listeners: Array<(data: SensorData) => void> = [];

  private pairedDevices: PairedDevice[] = [];
  private activeDeviceId: string | null = null;
  private loaded = false;

  // Real-BLE streaming teardown function, set when connected to real hardware.
  private realDisconnect: (() => Promise<void>) | null = null;
  // True while a real BLE device is actively streaming (vs. simulation).
  private streamingReal = false;



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
      const loaded: PairedDevice[] = devicesJson ? JSON.parse(devicesJson) : [];

      // Purge leftover simulated/demo devices that may have been persisted by
      // earlier builds (e.g. a fake "xiao-esp32-c3"). Only real platform BLE
      // device ids should remain. Simulated ids are our own fixed slugs.
      const SIMULATED_IDS = new Set(["xiao-esp32-c3", "wearable-band-01", "guard-sensor-02", "demo"]);
      const cleaned = loaded.filter((d) => !SIMULATED_IDS.has(d.id));

      this.pairedDevices = cleaned;
      this.activeDeviceId = activeId && !SIMULATED_IDS.has(activeId) ? activeId : null;

      // If we removed anything, write the cleaned list back so it stays gone.
      if (cleaned.length !== loaded.length || (activeId && SIMULATED_IDS.has(activeId))) {
        await AsyncStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(cleaned));
        if (!this.activeDeviceId) await AsyncStorage.removeItem(ACTIVE_DEVICE_KEY);
      }
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
   * Discover nearby devices available to pair. Uses the real BLE radio when
   * running in a native build (filtered to our service UUID); falls back to
   * simulated candidate devices in Expo Go. Excludes already-paired devices.
   */
  async scanForDevices(): Promise<BLEDevice[]> {
    await this.ensureLoaded();
    const pairedIds = new Set(this.pairedDevices.map((d) => d.id));

    if (isBleAvailable()) {
      // Real BLE build: the add-a-device list comes PURELY from live Bluetooth.
      // Return whatever the radio actually found (possibly empty) - never show
      // simulated placeholders here, since real hardware is present.
      const real = await scanForRealDevices();
      return real
        .filter((d) => !pairedIds.has(d.id))
        .map((d) => ({
          id: d.id,
          name: d.name,
          isConnected: false,
          rssi: d.rssi,
          isRecognized: d.isRecognized,
        }));
    }

    // No BLE radio available (e.g. Expo Go): nothing to show. This app streams
    // real sensor data only - it never lists fake devices.
    return [];
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
   * Pair a newly discovered device: connects to it and, if it has a readable
   * Anaphylaxis Guard sensor, adds it to the paired list as the active device.
   * Returns the connection status so the UI can explain a no-sensor device.
   */
  async pairDevice(device: BLEDevice): Promise<"real" | "no-sensor" | "failed"> {
    await this.ensureLoaded();
    const status = await this.setActiveDevice(device.id, device.name);

    // Don't add a device with no readable sensor to "My Devices" - the user
    // connected to some other Bluetooth device that we can't read from.
    if (status === "no-sensor") {
      return status;
    }

    const now = Date.now();
    const paired: PairedDevice = {
      id: device.id,
      name: device.name,
      pairedAt: now,
      lastConnectedAt: now,
    };
    this.pairedDevices = [...this.pairedDevices.filter((d) => d.id !== device.id), paired];
    await this.persist();
    return status;
  }

  /**
   * Reconnect to a previously paired device that isn't currently active.
   * Returns the connection status.
   */
  async reconnectDevice(id: string): Promise<"real" | "no-sensor" | "failed" | "not-found"> {
    await this.ensureLoaded();
    const device = this.pairedDevices.find((d) => d.id === id);
    if (!device) return "not-found";
    const status = await this.setActiveDevice(device.id, device.name);
    if (status !== "no-sensor") {
      device.lastConnectedAt = Date.now();
      await this.persist();
    }
    return status;
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

  private async setActiveDevice(id: string, name: string): Promise<"real" | "no-sensor" | "failed"> {
    // Tear down any existing stream (real or simulated) first.
    await this.teardownStream();

    this.isConnected = true;
    this.currentDevice = { id, name, isConnected: true };
    this.activeDeviceId = id;

    // Try real hardware first when the native module is present and the id
    // looks like a real platform BLE id (simulated ids are our own slugs).
    const isSimulatedId = ["xiao-esp32-c3", "wearable-band-01", "guard-sensor-02", "demo"].includes(id);
    if (isBleAvailable() && !isSimulatedId) {
      try {
        this.realDisconnect = await connectAndStream(
          id,
          (data) => this.listeners.forEach((l) => l(data)),
          () => {
            // Unexpected disconnect: mark disconnected but keep it paired.
            this.streamingReal = false;
            this.isConnected = false;
          }
        );
        this.streamingReal = true;
        return "real";
      } catch (error) {
        // A device with no Anaphylaxis Guard sensor service is a user error
        // (they connected to some other Bluetooth device), not a fallback
        // case - report it so the UI can explain rather than silently
        // streaming simulated data from a real device the user picked.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("NO_SENSOR_SERVICE")) {
          this.isConnected = false;
          this.activeDeviceId = null;
          this.currentDevice = null;
          return "no-sensor";
        }
        console.error("Real BLE connect failed:", error);
      }
    }

    // No simulated fallback: this app streams real sensor data only. If the
    // connection failed, report it rather than inventing numbers.
    this.streamingReal = false;
    this.isConnected = false;
    this.activeDeviceId = null;
    this.currentDevice = null;
    return "failed";
  }

  /** Tears down the active real-BLE stream, if any. */
  private async teardownStream(): Promise<void> {
    if (this.realDisconnect) {
      const fn = this.realDisconnect;
      this.realDisconnect = null;
      this.streamingReal = false;
      try {
        await fn();
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Disconnect from current device (real or simulated).
   */
  async disconnect(): Promise<void> {
    await this.teardownStream();
    this.isConnected = false;
    this.currentDevice = null;
    this.activeDeviceId = null;
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
