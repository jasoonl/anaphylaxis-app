/**
 * Risk Assessment Algorithm
 *
 * Calculates anaphylaxis risk based on physiological indicators
 * Combines multiple sensor readings for multi-modal detection
 */

export interface RiskThresholds {
  heartRateHigh: number;
  heartRateLow: number;
  gsrHigh: number;
  temperatureHigh: number;
  temperatureLow: number;
}

export interface RiskFactors {
  heartRateRisk: number;
  gsrRisk: number;
  temperatureRisk: number;
  combinedScore: number;
  riskLevel: "safe" | "warning" | "critical";
}

// Default thresholds based on medical research
const DEFAULT_THRESHOLDS: RiskThresholds = {
  heartRateHigh: 120, // BPM - elevated heart rate
  heartRateLow: 50, // BPM - dangerously low heart rate
  gsrHigh: 30, // µS - elevated skin conductance (stress/reaction)
  temperatureHigh: 38, // °C - elevated temperature
  temperatureLow: 35, // °C - hypothermia indicator
};

/**
 * Calculate individual risk factor for heart rate
 * Anaphylaxis typically causes elevated heart rate (tachycardia)
 * but can also cause severe hypotension leading to low heart rate
 */
function calculateHeartRateRisk(
  heartRate: number,
  thresholds: RiskThresholds
): number {
  let risk = 0;

  // Elevated heart rate (tachycardia) - common in anaphylaxis
  if (heartRate > thresholds.heartRateHigh) {
    risk += Math.min(50, (heartRate - thresholds.heartRateHigh) * 2);
  }

  // Dangerously low heart rate (bradycardia) - severe anaphylaxis
  if (heartRate < thresholds.heartRateLow) {
    risk += Math.min(60, (thresholds.heartRateLow - heartRate) * 1.5);
  }

  // Moderate elevation is less concerning
  if (heartRate > 100 && heartRate <= thresholds.heartRateHigh) {
    risk += (heartRate - 100) * 0.3;
  }

  return Math.min(100, risk);
}

/**
 * Calculate individual risk factor for galvanic skin response (GSR)
 * Elevated GSR indicates increased sympathetic nervous system activity
 * Common in allergic reactions and anaphylaxis
 */
function calculateGSRRisk(gsr: number, thresholds: RiskThresholds): number {
  let risk = 0;

  // Normal GSR: 5-20 µS
  // Elevated GSR indicates stress/reaction
  if (gsr > thresholds.gsrHigh) {
    risk += Math.min(50, (gsr - thresholds.gsrHigh) * 2);
  } else if (gsr > 25) {
    risk += (gsr - 25) * 1.5;
  } else if (gsr > 20) {
    risk += (gsr - 20) * 0.5;
  }

  return Math.min(100, risk);
}

/**
 * Calculate individual risk factor for temperature
 * Anaphylaxis can cause fever or hypothermia
 */
function calculateTemperatureRisk(
  temperature: number,
  thresholds: RiskThresholds
): number {
  let risk = 0;

  // Elevated temperature
  if (temperature > thresholds.temperatureHigh) {
    risk += Math.min(40, (temperature - thresholds.temperatureHigh) * 5);
  } else if (temperature > 37.8) {
    risk += (temperature - 37.8) * 3;
  }

  // Hypothermia (severe anaphylaxis)
  if (temperature < thresholds.temperatureLow) {
    risk += Math.min(60, (thresholds.temperatureLow - temperature) * 5);
  } else if (temperature < 36.0) {
    risk += (36.0 - temperature) * 2;
  }

  return Math.min(100, risk);
}

/**
 * Calculate combined risk score from multiple factors
 * Uses weighted average to combine individual risk factors
 */
function calculateCombinedRisk(factors: {
  heartRateRisk: number;
  gsrRisk: number;
  temperatureRisk: number;
}): number {
  // Weights based on medical research importance
  const weights = {
    heartRate: 0.35, // Heart rate is a strong indicator
    gsr: 0.40, // GSR is the most sensitive indicator of allergic response
    temperature: 0.25, // Temperature is secondary indicator
  };

  const weighted =
    factors.heartRateRisk * weights.heartRate +
    factors.gsrRisk * weights.gsr +
    factors.temperatureRisk * weights.temperature;

  return Math.min(100, Math.max(0, weighted));
}

/**
 * Determine risk level from combined score
 */
function getRiskLevel(score: number): "safe" | "warning" | "critical" {
  if (score >= 70) return "critical";
  if (score >= 40) return "warning";
  return "safe";
}

/**
 * Main risk calculation function
 */
export function calculateRisk(
  heartRate: number,
  gsr: number,
  temperature: number,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS
): RiskFactors {
  const heartRateRisk = calculateHeartRateRisk(heartRate, thresholds);
  const gsrRisk = calculateGSRRisk(gsr, thresholds);
  const temperatureRisk = calculateTemperatureRisk(temperature, thresholds);

  const combinedScore = calculateCombinedRisk({
    heartRateRisk,
    gsrRisk,
    temperatureRisk,
  });

  return {
    heartRateRisk,
    gsrRisk,
    temperatureRisk,
    combinedScore: Math.round(combinedScore),
    riskLevel: getRiskLevel(combinedScore),
  };
}

/**
 * Get risk assessment explanation
 */
export function getRiskExplanation(factors: RiskFactors): string {
  const parts: string[] = [];

  if (factors.heartRateRisk > 30) {
    parts.push("elevated heart rate");
  }
  if (factors.gsrRisk > 30) {
    parts.push("increased skin conductance");
  }
  if (factors.temperatureRisk > 30) {
    parts.push("abnormal temperature");
  }

  if (parts.length === 0) {
    return "All vital signs are within normal range";
  }

  return `Detected: ${parts.join(", ")}`;
}

/**
 * Get recommended action based on risk level
 */
export function getRecommendedAction(riskLevel: "safe" | "warning" | "critical"): string {
  switch (riskLevel) {
    case "critical":
      return "🚨 EMERGENCY: Call 911 immediately and administer epinephrine if available";
    case "warning":
      return "⚠️ CAUTION: Monitor closely and prepare emergency contacts";
    case "safe":
      return "✓ SAFE: Continue monitoring";
  }
}
