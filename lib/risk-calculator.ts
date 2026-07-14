/**
 * Risk Assessment Algorithm
 *
 * Calculates anaphylaxis risk on a 0-10 scale (0 = safe, 10 = danger) from
 * three tracked vitals: heart rate, transepidermal water loss (TEWL), and
 * temperature.
 *
 * Thresholds and relative weighting are grounded in real anaphylaxis
 * literature, with the evidence strength for each signal honestly reflected
 * in how heavily it's weighted:
 *
 * - Heart rate (tachycardia/bradycardia) is grounded in the NIAID/FAAN
 *   (Sampson 2006) and Brown (2004) severity grading systems, both of which
 *   center on it as a formal anaphylaxis severity criterion. Standard adult
 *   tachycardia threshold: >100 bpm; shock-level: >130 bpm. Severe
 *   bradycardia (<50 bpm) is a recognized sign of impending anaphylactic
 *   shock/arrest. Weighted heaviest as the most established formal
 *   criterion: max 4.5 of 10 points.
 *
 * - Transepidermal water loss (TEWL) is grounded directly in Schuler et al.,
 *   "Transepidermal water loss rises before food anaphylaxis and predicts
 *   food challenge outcomes" (J Clin Invest, 2023;133(16):e168965). In that
 *   study, TEWL rose by a mean of 2.93 g/m2/h during anaphylactic reactions
 *   (3.44 g/m2/h in reactions severe enough to require epinephrine), versus
 *   a mean decline of -1.00 g/m2/h in non-reactions. A rise of >=1 g/m2/h
 *   from baseline had 100% sensitivity for anaphylaxis; combined with any
 *   objective symptom/sign it reached 96% specificity. Critically, the study
 *   is explicit that a TEWL rise ALONE is sensitive but NOT specific for
 *   anaphylaxis - it only becomes highly specific in combination with
 *   another signal. This app has no separate symptom-entry input, so a
 *   simultaneous heart rate elevation is used as that corroborating signal
 *   instead, in the same spirit as the study's design. Because this is the
 *   most directly on-topic, quantitatively validated citation of the three
 *   signals (specifically about predicting anaphylaxis, not general shock),
 *   it's weighted close to heart rate: max 3.5 of 10 points, but capped
 *   below heart rate to reflect the "not specific alone" caveat and that
 *   TEWL is not yet part of any formal diagnostic criteria (NIAID/FAAN, WAO,
 *   or Brown).
 *
 * - Temperature is not part of any standard anaphylaxis diagnostic or
 *   severity criteria (NIAID/FAAN, WAO, or Brown) at all. It's included here
 *   only as a general shock/perfusion marker from broader critical care
 *   practice, not because it's anaphylaxis-specific. Weighted lightest:
 *   max 2 of 10 points.
 *
 * Sources: Sampson HA et al., "Second symposium on the definition and
 * management of anaphylaxis" (NIAID/FAAN, 2006); Brown AF, "Clinical
 * features and severity grading of anaphylaxis" (JACI, 2004); Schuler CF
 * et al., "Transepidermal water loss rises before food anaphylaxis and
 * predicts food challenge outcomes" (J Clin Invest, 2023); World Allergy
 * Organization Anaphylaxis Guidance (2020); Anaphylaxis 2023 practice
 * parameter update (Annals of Allergy, Asthma & Immunology).
 */

export interface RiskThresholds {
  heartRateTachycardia: number; // bpm - adult tachycardia threshold
  heartRateSevere: number; // bpm - shock-level tachycardia
  heartRateBradycardia: number; // bpm - low HR, concerning in severe anaphylaxis
  heartRateSevereBradycardia: number; // bpm - severe bradycardia, pre-arrest sign
  tewlBaseline: number; // g/m2/h - resting forearm TEWL (Schuler et al. cohort mean ~10)
  tewlRiseThreshold: number; // g/m2/h rise from baseline - 100% sensitive cutoff (Schuler et al.)
  tewlReactionMean: number; // g/m2/h rise - mean rise during anaphylactic reactions (Schuler et al.)
  tewlSevereReactionMean: number; // g/m2/h rise - mean rise during epinephrine-requiring reactions (Schuler et al.)
  temperatureFever: number; // °C - mild fever
  temperatureHighFever: number; // °C - high fever
  temperatureMildHypothermia: number; // °C - mild hypothermia
  temperatureSevereHypothermia: number; // °C - severe hypothermia (shock sign)
}

export interface RiskFactors {
  heartRateRisk: number; // contribution out of 4.5
  gsrRisk: number; // TEWL contribution out of 3.5 (field name kept for compatibility)
  temperatureRisk: number; // contribution out of 2
  combinedScore: number; // 0-10, 0 = safe, 10 = danger
  riskLevel: "safe" | "warning" | "critical";
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  heartRateTachycardia: 100,
  heartRateSevere: 130,
  heartRateBradycardia: 60,
  heartRateSevereBradycardia: 50,
  tewlBaseline: 10,
  tewlRiseThreshold: 1,
  tewlReactionMean: 2.93,
  tewlSevereReactionMean: 3.44,
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
 * Heart rate risk contribution, max 4.5 points.
 * Tachycardia >100 bpm ramps 0->3 by 130 bpm (shock-level), then 3->4.5 by 150 bpm.
 * Bradycardia <60 bpm ramps 0->3 by 50 bpm (severe), then 3->4.5 by 40 bpm.
 */
function calculateHeartRateRisk(heartRate: number, t: RiskThresholds): number {
  if (heartRate > t.heartRateTachycardia) {
    if (heartRate <= t.heartRateSevere) {
      return scaleBetween(heartRate, t.heartRateTachycardia, t.heartRateSevere, 3);
    }
    return 3 + scaleBetween(heartRate, t.heartRateSevere, t.heartRateSevere + 20, 1.5);
  }
  if (heartRate < t.heartRateBradycardia) {
    if (heartRate >= t.heartRateSevereBradycardia) {
      return scaleBetween(t.heartRateBradycardia - heartRate, 0, t.heartRateBradycardia - t.heartRateSevereBradycardia, 3);
    }
    return 3 + scaleBetween(t.heartRateSevereBradycardia - heartRate, 0, 10, 1.5);
  }
  return 0;
}

/**
 * TEWL risk contribution, max 3.5 points, based on rise from baseline
 * (Schuler et al. 2023 - the study's predictive power is specifically about
 * the RISE from an individual's own baseline, not an absolute value).
 *
 * A decline in TEWL (as seen in non-reactors in the study) contributes 0 -
 * it is not concerning. Rise >=1 g/m2/h ramps 0->2.5 by the reaction mean
 * (2.93); beyond that ramps 2.5->3.5 by 4.5 (comfortably past the severe
 * reaction mean of 3.44, since some severe reactions exceed the sample mean).
 */
function calculateGSRRisk(currentTewl: number, t: RiskThresholds): number {
  const rise = currentTewl - t.tewlBaseline;
  if (rise <= t.tewlRiseThreshold) return 0;
  if (rise <= t.tewlReactionMean) {
    return scaleBetween(rise, t.tewlRiseThreshold, t.tewlReactionMean, 2.5);
  }
  return 2.5 + scaleBetween(rise, t.tewlReactionMean, 4.5, 1);
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
 * @param gsr current TEWL reading, g/m2/h (field name kept as "gsr" for compatibility)
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
  if (factors.gsrRisk > 1.2) {
    parts.push("rising transepidermal water loss");
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
