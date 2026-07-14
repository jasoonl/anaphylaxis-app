/**
 * Risk Assessment Algorithm
 *
 * Calculates anaphylaxis risk on a 0-10 scale (0 = safe, 10 = danger) from
 * three tracked vitals: heart rate, skin conductance (diaphoresis proxy),
 * and temperature.
 *
 * Thresholds and relative weighting are grounded in real anaphylaxis severity
 * literature, with the evidence strength for each signal honestly reflected
 * in how heavily it's weighted:
 *
 * - Heart rate (tachycardia) is the most clinically validated marker this app
 *   tracks. The NIAID/FAAN (Sampson 2006) and Brown (2004) severity grading
 *   systems both center on it, and tachycardia has been shown to have strong
 *   diagnostic value for anaphylaxis in emergency department validation
 *   studies (positive likelihood ratio 3.26). Standard adult tachycardia
 *   threshold: >100 bpm; shock-level tachycardia: >120-130 bpm. Severe
 *   bradycardia (<50 bpm) is also a recognized sign of impending
 *   anaphylactic shock/arrest. Weighted heaviest: max 5 of 10 points.
 *
 * - Skin conductance is used here as a proxy for diaphoresis (sweating),
 *   which Brown's criteria do list as a real moderate-severity symptom.
 *   However there is no formal clinical threshold for skin conductance
 *   specifically in the anaphylaxis literature - it's a wearable-research
 *   signal, not a diagnostic criterion. Weighted moderately to reflect that
 *   lower confidence: max 3 of 10 points.
 *
 * - Temperature is not part of any standard anaphylaxis diagnostic or
 *   severity criteria (NIAID/FAAN, WAO, or Brown) at all. It's included here
 *   only as a general shock/perfusion marker from broader critical care
 *   practice, not because it's anaphylaxis-specific. Weighted lightest:
 *   max 2 of 10 points.
 *
 * Sources: Sampson HA et al., "Second symposium on the definition and
 * management of anaphylaxis" (NIAID/FAAN, 2006); Brown AF, "Clinical
 * features and severity grading of anaphylaxis" (JACI, 2004); World Allergy
 * Organization Anaphylaxis Guidance (2020); Anaphylaxis 2023 practice
 * parameter update (Annals of Allergy, Asthma & Immunology).
 */

export interface RiskThresholds {
  heartRateTachycardia: number; // bpm - adult tachycardia threshold
  heartRateSevere: number; // bpm - shock-level tachycardia
  heartRateBradycardia: number; // bpm - low HR, concerning in severe anaphylaxis
  heartRateSevereBradycardia: number; // bpm - severe bradycardia, pre-arrest sign
  conductanceElevated: number; // relative units - elevated diaphoresis proxy
  conductanceHigh: number; // relative units - high diaphoresis proxy
  temperatureFever: number; // °C - mild fever
  temperatureHighFever: number; // °C - high fever
  temperatureMildHypothermia: number; // °C - mild hypothermia
  temperatureSevereHypothermia: number; // °C - severe hypothermia (shock sign)
}

export interface RiskFactors {
  heartRateRisk: number; // contribution out of 5
  gsrRisk: number; // contribution out of 3
  temperatureRisk: number; // contribution out of 2
  combinedScore: number; // 0-10, 0 = safe, 10 = danger
  riskLevel: "safe" | "warning" | "critical";
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  heartRateTachycardia: 100,
  heartRateSevere: 130,
  heartRateBradycardia: 60,
  heartRateSevereBradycardia: 50,
  conductanceElevated: 20,
  conductanceHigh: 30,
  temperatureFever: 37.5,
  temperatureHighFever: 38.0,
  temperatureMildHypothermia: 36.1,
  temperatureSevereHypothermia: 35.5,
};

/** Linearly interpolates `value` between [from, to] onto [0, max], clamped. */
function scaleBetween(value: number, from: number, to: number, max: number): number {
  if (to === from) return 0;
  const t = (value - from) / (to - from);
  return Math.max(0, Math.min(max, t * max));
}

/**
 * Heart rate risk contribution, max 5 points.
 * Tachycardia >100 bpm ramps 0->3.5 by 130 bpm (shock-level), then 3.5->5 by 150 bpm.
 * Bradycardia <60 bpm ramps 0->3.5 by 50 bpm (severe), then 3.5->5 by 40 bpm.
 */
function calculateHeartRateRisk(heartRate: number, t: RiskThresholds): number {
  if (heartRate > t.heartRateTachycardia) {
    if (heartRate <= t.heartRateSevere) {
      return scaleBetween(heartRate, t.heartRateTachycardia, t.heartRateSevere, 3.5);
    }
    return 3.5 + scaleBetween(heartRate, t.heartRateSevere, t.heartRateSevere + 20, 1.5);
  }
  if (heartRate < t.heartRateBradycardia) {
    if (heartRate >= t.heartRateSevereBradycardia) {
      return scaleBetween(t.heartRateBradycardia - heartRate, 0, t.heartRateBradycardia - t.heartRateSevereBradycardia, 3.5);
    }
    return 3.5 + scaleBetween(t.heartRateSevereBradycardia - heartRate, 0, 10, 1.5);
  }
  return 0;
}

/**
 * Skin conductance (diaphoresis proxy) risk contribution, max 3 points.
 * Elevated >20 ramps 0->2 by 30 (high), then 2->3 by 40.
 */
function calculateGSRRisk(conductance: number, t: RiskThresholds): number {
  if (conductance <= t.conductanceElevated) return 0;
  if (conductance <= t.conductanceHigh) {
    return scaleBetween(conductance, t.conductanceElevated, t.conductanceHigh, 2);
  }
  return 2 + scaleBetween(conductance, t.conductanceHigh, t.conductanceHigh + 10, 1);
}

/**
 * Temperature risk contribution, max 2 points.
 * Fever >37.5 ramps 0->1.3 by 38 (high fever), then 1.3->2 by 38.7.
 * Mild hypothermia <36.1 ramps 0->1.3 by 35.5 (severe), then 1.3->2 by 34.8.
 */
function calculateTemperatureRisk(temperature: number, t: RiskThresholds): number {
  if (temperature > t.temperatureFever) {
    if (temperature <= t.temperatureHighFever) {
      return scaleBetween(temperature, t.temperatureFever, t.temperatureHighFever, 1.3);
    }
    return 1.3 + scaleBetween(temperature, t.temperatureHighFever, t.temperatureHighFever + 0.7, 0.7);
  }
  if (temperature < t.temperatureMildHypothermia) {
    if (temperature >= t.temperatureSevereHypothermia) {
      return scaleBetween(t.temperatureMildHypothermia - temperature, 0, t.temperatureMildHypothermia - t.temperatureSevereHypothermia, 1.3);
    }
    return 1.3 + scaleBetween(t.temperatureSevereHypothermia - temperature, 0, 0.7, 0.7);
  }
  return 0;
}

/** Sums the three weighted contributions into a single 0-10 score. */
function calculateCombinedRisk(factors: {
  heartRateRisk: number;
  gsrRisk: number;
  temperatureRisk: number;
}): number {
  const total = factors.heartRateRisk + factors.gsrRisk + factors.temperatureRisk;
  return Math.min(10, Math.max(0, total));
}

/**
 * Determine risk zone from the 0-10 combined score.
 * Safe: 0-3.9, Cautious ("warning"): 4-6.9, Danger ("critical"): 7-10.
 */
function getRiskLevel(score: number): "safe" | "warning" | "critical" {
  if (score >= 7) return "critical";
  if (score >= 4) return "warning";
  return "safe";
}

/**
 * Main risk calculation function.
 * @param heartRate bpm
 * @param gsr skin conductance / diaphoresis proxy (relative units, ~5-50 typical range)
 * @param temperature °C
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
    heartRateRisk: Math.round(heartRateRisk * 10) / 10,
    gsrRisk: Math.round(gsrRisk * 10) / 10,
    temperatureRisk: Math.round(temperatureRisk * 10) / 10,
    combinedScore: Math.round(combinedScore * 10) / 10,
    riskLevel: getRiskLevel(combinedScore),
  };
}

/**
 * Get risk assessment explanation
 */
export function getRiskExplanation(factors: RiskFactors): string {
  const parts: string[] = [];

  if (factors.heartRateRisk > 1.5) {
    parts.push("elevated or low heart rate");
  }
  if (factors.gsrRisk > 1) {
    parts.push("increased skin conductance");
  }
  if (factors.temperatureRisk > 0.5) {
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
