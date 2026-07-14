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

class BLEManager {
  private isConnected = false;
  private currentDevice: BLEDevice | null = null;
  private listeners: Array<(data: SensorData) => void> = [];
  private simulationInterval: ReturnType<typeof setInterval> | null = null;

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
   * Generate simulated sensor data for demo mode
   */
  private generateSensorData(): SensorData {
    // Simulate realistic vital sign variations
    const baseHeartRate = 72;
    const baseGSR = 15;
    const baseTemp = 36.8;

    return {
      heartRate: Math.max(60, Math.min(120, baseHeartRate + (Math.random() - 0.5) * 8)),
      gsr: Math.max(5, Math.min(50, baseGSR + (Math.random() - 0.5) * 4)),
      temperature: Math.max(35.5, Math.min(38.5, baseTemp + (Math.random() - 0.5) * 0.6)),
      timestamp: Date.now(),
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
