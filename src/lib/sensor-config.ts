/**
 * Sensor Configuration
 *
 * Defines all sensor types, data formats, and thresholds for anaphylaxis detection
 * Sensors: Pulse Sensor, Blood Pressure Sensor, BME280 (TEWL/Humidity), Temperature Sensor
 * Microcontrollers: Arduino Uno + XIAO ESP32 C3
 */

export interface SensorReading {
  timestamp: number;
  value: number;
  unit: string;
}

export interface VitalSigns {
  heartRate: number; // BPM (Pulse Sensor)
  bloodPressureSystolic: number; // mmHg (Blood Pressure Sensor)
  bloodPressureDiastolic: number; // mmHg (Blood Pressure Sensor)
  skinHumidity: number; // % (BME280 TEWL)
  temperature: number; // °C (Temperature Sensor)
  timestamp: number;
}

export interface SensorThresholds {
  // Pulse Sensor (BPM)
  heartRateHigh: number; // 120 BPM - tachycardia
  heartRateLow: number; // 50 BPM - bradycardia

  // Blood Pressure Sensor (mmHg)
  systolicHigh: number; // 160 mmHg - hypertension
  systolicLow: number; // 90 mmHg - hypotension
  diastolicHigh: number; // 100 mmHg
  diastolicLow: number; // 60 mmHg

  // BME280 TEWL/Humidity (%)
  skinHumidityHigh: number; // 70% - excessive sweating
  skinHumidityLow: number; // 20% - dry skin

  // Temperature Sensor (°C)
  temperatureHigh: number; // 38°C - fever
  temperatureLow: number; // 35°C - hypothermia
}

export const DEFAULT_THRESHOLDS: SensorThresholds = {
  // Pulse Sensor
  heartRateHigh: 120,
  heartRateLow: 50,

  // Blood Pressure Sensor
  systolicHigh: 160,
  systolicLow: 90,
  diastolicHigh: 100,
  diastolicLow: 60,

  // BME280 TEWL
  skinHumidityHigh: 70,
  skinHumidityLow: 20,

  // Temperature Sensor
  temperatureHigh: 38,
  temperatureLow: 35,
};

/**
 * Sensor Data Format from XIAO ESP32 C3
 *
 * The ESP32 will send BLE characteristic data in the following format:
 * - Bytes 0-1: Heart Rate (uint16, BPM)
 * - Bytes 2-3: Systolic BP (uint16, mmHg)
 * - Bytes 4-5: Diastolic BP (uint16, mmHg)
 * - Bytes 6-7: Skin Humidity (uint16, 0-100%)
 * - Bytes 8-9: Temperature (int16, in 0.01°C increments, e.g., 3680 = 36.80°C)
 *
 * Example: [72, 0, 120, 0, 80, 0, 65, 0, 232, 14]
 * = HR: 72 BPM, Sys: 120 mmHg, Dia: 80 mmHg, Humidity: 65%, Temp: 36.80°C
 */

export interface SensorDataPacket {
  heartRate: number;
  systolicBP: number;
  diastolicBP: number;
  skinHumidity: number;
  temperature: number;
}

/**
 * Parse BLE characteristic data from XIAO ESP32 C3
 */
export function parseSensorData(buffer: Uint8Array): SensorDataPacket {
  if (buffer.length < 10) {
    throw new Error("Invalid sensor data packet: insufficient bytes");
  }

  // Helper function to read uint16 little-endian
  const readUint16LE = (offset: number): number => {
    return buffer[offset] | (buffer[offset + 1] << 8);
  };

  // Helper function to read int16 little-endian
  const readInt16LE = (offset: number): number => {
    const value = buffer[offset] | (buffer[offset + 1] << 8);
    return value > 32767 ? value - 65536 : value;
  };

  return {
    heartRate: readUint16LE(0),
    systolicBP: readUint16LE(2),
    diastolicBP: readUint16LE(4),
    skinHumidity: readUint16LE(6),
    temperature: readInt16LE(8) / 100, // Convert from 0.01°C increments to °C
  };
}

/**
 * Create BLE characteristic data packet for testing
 */
export function createTestSensorData(
  heartRate: number,
  systolicBP: number,
  diastolicBP: number,
  skinHumidity: number,
  temperature: number
): Uint8Array {
  const buffer = new Uint8Array(10);

  // Helper function to write uint16 little-endian
  const writeUint16LE = (offset: number, value: number) => {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
  };

  // Helper function to write int16 little-endian
  const writeInt16LE = (offset: number, value: number) => {
    const intValue = Math.round(value * 100); // Convert to 0.01°C increments
    buffer[offset] = intValue & 0xff;
    buffer[offset + 1] = (intValue >> 8) & 0xff;
  };

  writeUint16LE(0, heartRate);
  writeUint16LE(2, systolicBP);
  writeUint16LE(4, diastolicBP);
  writeUint16LE(6, skinHumidity);
  writeInt16LE(8, temperature);

  return buffer;
}

/**
 * Sensor Calibration Values
 * Used to adjust raw sensor readings to accurate values
 */
export interface SensorCalibration {
  pulseOffset: number; // BPM offset
  bpSystolicOffset: number; // mmHg offset
  bpDiastolicOffset: number; // mmHg offset
  humidityOffset: number; // % offset
  temperatureOffset: number; // °C offset
}

export const DEFAULT_CALIBRATION: SensorCalibration = {
  pulseOffset: 0,
  bpSystolicOffset: 0,
  bpDiastolicOffset: 0,
  humidityOffset: 0,
  temperatureOffset: 0,
};

/**
 * Apply calibration to sensor readings
 */
export function applySensorCalibration(
  data: SensorDataPacket,
  calibration: SensorCalibration
): SensorDataPacket {
  return {
    heartRate: Math.max(0, data.heartRate + calibration.pulseOffset),
    systolicBP: Math.max(0, data.systolicBP + calibration.bpSystolicOffset),
    diastolicBP: Math.max(0, data.diastolicBP + calibration.bpDiastolicOffset),
    skinHumidity: Math.max(0, Math.min(100, data.skinHumidity + calibration.humidityOffset)),
    temperature: data.temperature + calibration.temperatureOffset,
  };
}
