import { Platform } from "react-native";
import type { SensorData } from "./ble-manager";

/**
 * Real BLE Radio Service (react-native-ble-plx)
 *
 * Talks to the actual XIAO ESP32C3 wearable over Bluetooth Low Energy.
 *
 * This module only works in a native build (dev build / prebuild), NOT in
 * Expo Go - react-native-ble-plx is a native module Expo Go doesn't bundle.
 * It's imported lazily and wrapped in try/catch so that importing it in
 * Expo Go doesn't crash the app; ble-manager falls back to simulated data
 * when isBleAvailable() returns false.
 *
 * === Firmware contract (must match the ESP32 sketch exactly) ===
 * The device advertises ONE service containing ONE characteristic that
 * notifies a JSON string payload:
 *
 *   { "hr": <number>, "tewl": <number>, "temp": <number> }
 *
 *   hr   = heart rate, bpm
 *   tewl = transepidermal water loss, g/m2/h
 *   temp = body/skin temperature, °C
 *
 * If the firmware's data format changes, only parseSensorPayload() below
 * needs to change - it's the single point of contact with the wire format.
 */

// UUIDs - must be identical to the values in the ESP32 firmware.
export const BLE_SERVICE_UUID = "aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f";
export const BLE_DATA_CHARACTERISTIC_UUID = "7973c8f9-eb2e-47b4-9e1f-05a20cb48622";

// The name the device advertises. Scanning also filters by service UUID, so
// this is a secondary/display hint rather than the primary match.
export const BLE_DEVICE_NAME_HINT = "AnaphylaxisGuard";

// Lazy-loaded native module. Kept as `any` because the types only resolve in
// a native build; guarded by isBleAvailable() everywhere it's used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let BlePlx: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let managerInstance: any = null;

function loadBlePlx(): boolean {
  if (BlePlx) return true;
  try {
    // Require lazily so Expo Go (where the native module is absent) doesn't
    // crash on import. In a native build this resolves normally.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BlePlx = require("react-native-ble-plx");
    return true;
  } catch {
    BlePlx = null;
    return false;
  }
}

/** Whether the real BLE native module is present (i.e. running in a native build). */
export function isBleAvailable(): boolean {
  return loadBlePlx();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getManager(): any {
  if (!loadBlePlx()) return null;
  if (!managerInstance) {
    managerInstance = new BlePlx.BleManager();
  }
  return managerInstance;
}

export interface DiscoveredBleDevice {
  id: string; // platform BLE device id (iOS: UUID, Android: MAC)
  name: string;
}

/** Decodes a base64 characteristic value into a UTF-8 string. */
function base64ToString(b64: string): string {
  // atob may not exist in the RN runtime; use Buffer if available, else manual.
  if (typeof atob === "function") {
    return decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  }
  // Fallback for environments with Buffer (Metro polyfills it in dev builds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (global as any).Buffer;
  if (B) return B.from(b64, "base64").toString("utf-8");
  return "";
}

/**
 * Parse the device's JSON payload into SensorData. THE SINGLE POINT that
 * knows the wire format - change here if the firmware format changes.
 * Returns null if the payload can't be parsed, so the caller can ignore
 * malformed packets rather than feeding NaN into the risk engine.
 */
export function parseSensorPayload(raw: string): SensorData | null {
  try {
    const obj = JSON.parse(raw);
    const heartRate = Number(obj.hr);
    const gsr = Number(obj.tewl);
    const temperature = Number(obj.temp);
    if ([heartRate, gsr, temperature].some((n) => !Number.isFinite(n))) {
      return null;
    }
    return { heartRate, gsr, temperature, timestamp: Date.now() };
  } catch {
    return null;
  }
}

/**
 * Ensure Bluetooth is powered on and permissions are granted, then resolve.
 * Rejects if BLE is unavailable or the user denies permission.
 */
export async function ensureBleReady(): Promise<void> {
  const manager = getManager();
  if (!manager) throw new Error("BLE not available in this build");

  // Wait for the adapter to reach PoweredOn (handles the brief startup window).
  await new Promise<void>((resolve, reject) => {
    const sub = manager.onStateChange((state: string) => {
      if (state === "PoweredOn") {
        sub.remove();
        resolve();
      } else if (state === "Unauthorized" || state === "Unsupported") {
        sub.remove();
        reject(new Error(`Bluetooth ${state}`));
      }
    }, true);
  });
}

/**
 * Scan for devices advertising our service UUID for `timeoutMs`, returning
 * the unique devices found. Stops scanning before resolving.
 */
export async function scanForRealDevices(timeoutMs = 6000): Promise<DiscoveredBleDevice[]> {
  const manager = getManager();
  if (!manager) return [];
  await ensureBleReady();

  const found = new Map<string, DiscoveredBleDevice>();

  return new Promise<DiscoveredBleDevice[]>((resolve) => {
    manager.startDeviceScan(
      [BLE_SERVICE_UUID],
      { allowDuplicates: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error: any, device: any) => {
        if (error) {
          manager.stopDeviceScan();
          resolve(Array.from(found.values()));
          return;
        }
        if (device && !found.has(device.id)) {
          found.set(device.id, {
            id: device.id,
            name: device.name || device.localName || "Anaphylaxis Guard Sensor",
          });
        }
      }
    );

    setTimeout(() => {
      manager.stopDeviceScan();
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let monitorSubscription: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connectedDevice: any = null;

/**
 * Connect to a device by its platform BLE id, discover services, and begin
 * streaming parsed SensorData to `onData`. Returns a disconnect function.
 * Calls `onDisconnect` if the device drops unexpectedly.
 */
export async function connectAndStream(
  deviceId: string,
  onData: (data: SensorData) => void,
  onDisconnect?: () => void
): Promise<() => Promise<void>> {
  const manager = getManager();
  if (!manager) throw new Error("BLE not available in this build");

  await ensureBleReady();

  const device = await manager.connectToDevice(deviceId, { autoConnect: false });
  connectedDevice = device;
  await device.discoverAllServicesAndCharacteristics();

  // Fires if the device disconnects for any reason.
  device.onDisconnected(() => {
    monitorSubscription = null;
    connectedDevice = null;
    onDisconnect?.();
  });

  monitorSubscription = device.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_DATA_CHARACTERISTIC_UUID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error: any, characteristic: any) => {
      if (error || !characteristic?.value) return;
      const parsed = parseSensorPayload(base64ToString(characteristic.value));
      if (parsed) onData(parsed);
    }
  );

  return async () => {
    try {
      if (monitorSubscription) {
        monitorSubscription.remove();
        monitorSubscription = null;
      }
      if (connectedDevice) {
        await manager.cancelDeviceConnection(deviceId);
        connectedDevice = null;
      }
    } catch {
      // best-effort teardown
    }
  };
}

/** True on iOS, where scanning returns opaque UUIDs rather than MACs. */
export const isIos = Platform.OS === "ios";
