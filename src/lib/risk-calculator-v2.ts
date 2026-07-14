/**
 * Risk Calculator v2 - Multi-Sensor Anaphylaxis Detection
 *
 * Analyzes 5 sensors to calculate anaphylaxis risk:
 * 1. Pulse Sensor (Heart Rate) - 35% weight
 * 2. Blood Pressure Sensor (Systolic/Diastolic) - 25% weight
 * 3. BME280 TEWL (Skin Humidity/Sweating) - 20% weight
 * 4. Temperature Sensor - 15% weight
 * 5. Trend Analysis - 5% weight
 *
 * Risk Levels:
 * - Safe: 0-39 (Green)
 * - Warning: 40-69 (Yellow)
 * - Critical: 70-100 (Red)
 */

import { VitalSigns } from "./health-context";
import { SensorThresholds, DEFAULT_THRESHOLDS } from "./sensor-config";

export interface RiskFactors {
  heartRateScore: number; // 0-100
  bloodPressureScore: number; // 0-100
  skinHumidityScore: number; // 0-100
  temperatureScore: number; // 0-100
  trendScore: number; // 0-100
  combinedScore: number; // 0-100
  riskLevel: "safe" | "warning" | "critical";
  details: string[];
}

/**
 * Calculate heart rate risk score
 * Anaphylaxis typically causes tachycardia (elevated HR)
 * Also monitors for severe bradycardia (very low HR)
 */
function calculateHeartRateScore(
  heartRate: number,
  thresholds: SensorThresholds
): { score: number; detail: string } {
  let score = 0;
  let detail = "";

  if (heartRate > thresholds.heartRateHigh) {
    // Tachycardia - strong indicator of anaphylaxis
    const excess = heartRate - thresholds.heartRateHigh;
    score = Math.min(100, 40 + (excess / 40) * 60); // 40-100 points
    detail = `Tachycardia: ${Math.round(heartRate)} BPM (threshold: ${thresholds.heartRateHigh})`;
  } else if (heartRate < thresholds.heartRateLow) {
    // Severe bradycardia - can indicate shock
    const deficit = thresholds.heartRateLow - heartRate;
    score = Math.min(100, 30 + (deficit / 30) * 70); // 30-100 points
    detail = `Severe Bradycardia: ${Math.round(heartRate)} BPM (threshold: ${thresholds.heartRateLow})`;
  } else if (heartRate > 100) {
    // Mild elevation - minor concern
    score = 20;
    detail = `Elevated HR: ${Math.round(heartRate)} BPM`;
  } else {
    score = 0;
    detail = `Normal HR: ${Math.round(heartRate)} BPM`;
  }

  return { score, detail };
}

/**
 * Calculate blood pressure risk score
 * Anaphylaxis causes hypotension (low BP) and can cause hypertension initially
 */
function calculateBloodPressureScore(
  systolic: number,
  diastolic: number,
  thresholds: SensorThresholds
): { score: number; detail: string } {
  let score = 0;
  let detail = "";

  // Check for hypotension (low BP) - critical sign of anaphylaxis
  if (systolic < thresholds.systolicLow || diastolic < thresholds.diastolicLow) {
    const systolicDeficit = Math.max(0, thresholds.systolicLow - systolic);
    const diastolicDeficit = Math.max(0, thresholds.diastolicLow - diastolic);
    const avgDeficit = (systolicDeficit + diastolicDeficit) / 2;
    score = Math.min(100, 50 + (avgDeficit / 30) * 50); // 50-100 points
    detail = `Hypotension: ${Math.round(systolic)}/${Math.round(diastolic)} mmHg`;
  }
  // Check for hypertension (high BP) - can occur during anaphylaxis
  else if (systolic > thresholds.systolicHigh || diastolic > thresholds.diastolicHigh) {
    const systolicExcess = Math.max(0, systolic - thresholds.systolicHigh);
    const diastolicExcess = Math.max(0, diastolic - thresholds.diastolicHigh);
    const avgExcess = (systolicExcess + diastolicExcess) / 2;
    score = Math.min(100, 20 + (avgExcess / 40) * 30); // 20-50 points
    detail = `Hypertension: ${Math.round(systolic)}/${Math.round(diastolic)} mmHg`;
  } else {
    score = 0;
    detail = `Normal BP: ${Math.round(systolic)}/${Math.round(diastolic)} mmHg`;
  }

  return { score, detail };
}

/**
 * Calculate skin humidity risk score
 * High humidity indicates excessive sweating - sign of sympathetic activation
 * Low humidity can indicate severe dehydration/shock
 */
function calculateSkinHumidityScore(
  humidity: number,
  thresholds: SensorThresholds
): { score: number; detail: string } {
  let score = 0;
  let detail = "";

  if (humidity > thresholds.skinHumidityHigh) {
    // Excessive sweating - strong indicator of anaphylaxis
    const excess = humidity - thresholds.skinHumidityHigh;
    score = Math.min(100, 40 + (excess / 30) * 60); // 40-100 points
    detail = `Excessive Sweating: ${Math.round(humidity)}% humidity`;
  } else if (humidity < thresholds.skinHumidityLow) {
    // Very dry skin - can indicate severe dehydration/shock
    const deficit = thresholds.skinHumidityLow - humidity;
    score = Math.min(100, 30 + (deficit / 20) * 70); // 30-100 points
    detail = `Severe Dehydration: ${Math.round(humidity)}% humidity`;
  } else if (humidity > 60) {
    // Mild elevation
    score = 15;
    detail = `Elevated Sweating: ${Math.round(humidity)}% humidity`;
  } else {
    score = 0;
    detail = `Normal Skin Humidity: ${Math.round(humidity)}%`;
  }

  return { score, detail };
}

/**
 * Calculate temperature risk score
 * Fever can occur in anaphylaxis, also monitors for hypothermia (shock)
 */
function calculateTemperatureScore(
  temperature: number,
  thresholds: SensorThresholds
): { score: number; detail: string } {
  let score = 0;
  let detail = "";

  if (temperature > thresholds.temperatureHigh) {
    // Fever
    const excess = temperature - thresholds.temperatureHigh;
    score = Math.min(100, 20 + (excess / 2) * 80); // 20-100 points
    detail = `Fever: ${Math.round(temperature * 10) / 10}°C`;
  } else if (temperature < thresholds.temperatureLow) {
    // Hypothermia - sign of shock
    const deficit = thresholds.temperatureLow - temperature;
    score = Math.min(100, 30 + (deficit / 3) * 70); // 30-100 points
    detail = `Hypothermia: ${Math.round(temperature * 10) / 10}°C`;
  } else if (temperature > 37.5) {
    // Mild elevation
    score = 10;
    detail = `Elevated Temperature: ${Math.round(temperature * 10) / 10}°C`;
  } else {
    score = 0;
    detail = `Normal Temperature: ${Math.round(temperature * 10) / 10}°C`;
  }

  return { score, detail };
}

/**
 * Calculate trend risk score based on previous readings
 * Rising trend increases risk
 */
function calculateTrendScore(
  currentScore: number,
  previousScore: number
): { score: number; trend: "stable" | "rising" | "falling"; detail: string } {
  let score = 0;
  let trend: "stable" | "rising" | "falling" = "stable";
  let detail = "";

  const diff = currentScore - previousScore;

  if (diff > 10) {
    score = 20; // Rapidly rising
    trend = "rising";
    detail = `Rapidly Rising (+${Math.round(diff)} points)`;
  } else if (diff > 0) {
    score = 10; // Slowly rising
    trend = "rising";
    detail = `Rising (+${Math.round(diff)} points)`;
  } else if (diff < -10) {
    score = 0; // Rapidly falling
    trend = "falling";
    detail = `Rapidly Falling (${Math.round(diff)} points)`;
  } else if (diff < 0) {
    score = 0; // Slowly falling
    trend = "falling";
    detail = `Falling (${Math.round(diff)} points)`;
  } else {
    score = 5; // Stable
    trend = "stable";
    detail = "Stable";
  }

  return { score, trend, detail };
}

/**
 * Calculate overall anaphylaxis risk from all 5 sensors
 */
export function calculateRisk(
  vitalSigns: VitalSigns,
  previousScore: number = 0,
  thresholds: SensorThresholds = DEFAULT_THRESHOLDS
): RiskFactors {
  // Calculate individual sensor scores
  const { score: heartRateScore, detail: hrDetail } = calculateHeartRateScore(
    vitalSigns.heartRate,
    thresholds
  );

  const { score: bpScore, detail: bpDetail } = calculateBloodPressureScore(
    vitalSigns.bloodPressureSystolic,
    vitalSigns.bloodPressureDiastolic,
    thresholds
  );

  const { score: humidityScore, detail: humidityDetail } = calculateSkinHumidityScore(
    vitalSigns.skinHumidity,
    thresholds
  );

  const { score: tempScore, detail: tempDetail } = calculateTemperatureScore(
    vitalSigns.temperature,
    thresholds
  );

  // Calculate trend (will be updated with actual previous score)
  const { score: trendScore, trend, detail: trendDetail } = calculateTrendScore(
    heartRateScore + bpScore + humidityScore + tempScore,
    previousScore
  );

  // Weighted combination
  const combinedScore = Math.round(
    heartRateScore * 0.35 + // Heart rate: 35%
      bpScore * 0.25 + // Blood pressure: 25%
      humidityScore * 0.2 + // Skin humidity: 20%
      tempScore * 0.15 + // Temperature: 15%
      trendScore * 0.05 // Trend: 5%
  );

  // Determine risk level
  let riskLevel: "safe" | "warning" | "critical" = "safe";
  if (combinedScore >= 70) {
    riskLevel = "critical";
  } else if (combinedScore >= 40) {
    riskLevel = "warning";
  }

  // Collect all details
  const details = [hrDetail, bpDetail, humidityDetail, tempDetail, trendDetail];

  return {
    heartRateScore: Math.round(heartRateScore),
    bloodPressureScore: Math.round(bpScore),
    skinHumidityScore: Math.round(humidityScore),
    temperatureScore: Math.round(tempScore),
    trendScore: Math.round(trendScore),
    combinedScore,
    riskLevel,
    details,
  };
}
