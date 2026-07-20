/**
 * Risk Assessment Algorithm
 *
 * Calculates anaphylaxis risk on a 0-10 scale (0 = safe, 10 = danger) from
 * three tracked vitals: heart rate, transepidermal water loss (TEWL), and
 * temperature.
 *
 * === TEWL: the actual validated rule ===
 * Schuler CF et al., "Transepidermal water loss rises before food
 * anaphylaxis and predicts food challenge outcomes" (J Clin Invest,
 * 2023;133(16):e168965).
 *
 * The validated finding is a single combined rule, not a magnitude-scaled
 * dial:
 *
 *   TEWL rise >= 1 g/m2/h from a person's own baseline, PLUS at least one
 *   objective symptom/sign, together gave 100% sensitivity and 96%
 *   specificity, with a ~38 minute median warning window. BOTH halves are
 *   required - the study is explicit that neither channel alone met that
 *   bar.
 *
 * The study also reports descriptive group means (reactors +2.93 g/m2/h,
 * non-reactors -1.00 g/m2/h [a decline], epinephrine-requiring reactions
 * +3.44 g/m2/h) and notes that Grade 2 vs Grade 1 reactions rose more but
 * the difference was NOT statistically significant. Per the study's own
 * framing, that means these are reference/descriptive figures, not a basis
 * for a severity ladder - so this app does not scale the TEWL score by how
 * far above 1 g/m2/h the rise is. It's a threshold that's either crossed or
 * not, and it only matters combined with a corroborating sign.
 *
 * This app has no separate symptom-entry input, so heart rate abnormality
 * (any deviation outside 60-100 bpm) is used as that corroborating "objective
 * sign" - in the same spirit as the study's design, though not identical to
 * it (the study's symptoms were things like hives, throat tightness, etc.,
 * observed by a clinician).
 *
 * === Heart rate ===
 * Grounded in the NIAID/FAAN (Sampson 2006) and Brown (2004) severity
 * grading systems, both of which use it as a formal anaphylaxis severity
 * criterion, independent of TEWL. Standard adult tachycardia threshold:
 * >100 bpm; shock-level: >130 bpm. Severe bradycardia (<50 bpm) is a
 * recognized sign of impending anaphylactic shock/arrest.
 *
 * === Temperature ===
 * Not part of any standard anaphylaxis diagnostic or severity criteria
 * (NIAID/FAAN, WAO, or Brown) at all, and not a valid stand-in for the
 * TEWL study's "objective symptom" requirement. Included only as a general
 * shock/perfusion marker, weighted lightest of the three.
 *
 * === Scoring budget (out of 10) ===
 * - Heart rate (independent, formal criteria): max 4
 * - TEWL rise >= 1 g/m2/h alone, no corroboration: flat 1 (sensitive, not
 *   specific alone - matches the study's own caveat)
 * - TEWL rise >= 1 g/m2/h WITH heart rate corroboration (the actual
 *   validated 100%/96% combination): flat 4, replacing the "alone" score
 * - Temperature (weakest evidence, general marker only): max 2
 *
 * At minimum validated combination (exactly 1 g/m2/h rise + any heart rate
 * abnormality), this lands in the "Cautious" zone rather than "Danger" -
 * an intentional choice reflecting that the study's own framing is an EARLY
 * WARNING system (median 38 min before things get worse), not a
 * call-911-now signal by itself.
 *
 * Sources: Sampson HA et al. (NIAID/FAAN, 2006); Brown AF, JACI (2004);
 * Schuler CF et al., J Clin Invest (2023); World Allergy Organization
 * Anaphylaxis Guidance (2020).
 */

export interface RiskThresholds {
  heartRateTachycardia: number; // bpm - adult tachycardia threshold
  heartRateSevere: number; // bpm - shock-level tachycardia
  heartRateBradycardia: number; // bpm - low HR, concerning in severe anaphylaxis
  heartRateSevereBradycardia: number; // bpm - severe bradycardia, pre-arrest sign
  tewlBaseline: number; // g/m2/h - resting forearm TEWL (Schuler et al. cohort mean ~10)
  tewlRiseThreshold: number; // g/m2/h rise from baseline - the ONLY validated TEWL threshold (Schuler et al.)
  // Reference-only descriptive stats from Schuler et al. - NOT used in scoring.
  // The study found no statistically significant severity gradient beyond the
  // single threshold above, so these are not additional cutoffs.
  tewlReactionMeanReference: number; // g/m2/h - mean rise in reactors (descriptive)
  tewlSevereReactionMeanReference: number; // g/m2/h - mean rise in epinephrine-requiring reactions (descriptive)
  temperatureFever: number; // °C - mild fever
  temperatureHighFever: number; // °C - high fever
  temperatureMildHypothermia: number; // °C - mild hypothermia
  temperatureSevereHypothermia: number; // °C - severe hypothermia (shock sign)
}

export interface RiskFactors {
  heartRateRisk: number; // contribution out of 4
  gsrRisk: number; // TEWL contribution out of 4 (field name kept for compatibility)
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
  tewlReactionMeanReference: 2.93,
  tewlSevereReactionMeanReference: 3.44,
  temperatureFever: 37.5,
  temperatureHighFever: 38.0,
  temperatureMildHypothermia: 36.1,
  temperatureSevereHypothermia: 35.5,
};

/**
 * Whether a heart-rate reading is a real measurement. Hardware sends a
 * negative sentinel (-1) when no pulse sensor is wired or the read failed;
 * anything outside plausible human range is also treated as unavailable.
 */
export function isHeartRateAvailable(heartRate: number): boolean {
  return Number.isFinite(heartRate) && heartRate >= 20 && heartRate <= 250;
}

/** Linearly interpolates `value` between [from, to] onto [0, max], clamped. */
function scaleBetween(value: number, from: number, to: number, max: number): number {
  if (to === from) return 0;
  const t = (value - from) / (to - from);
  return Math.max(0, Math.min(max, t * max));
}

/**
 * Heart rate risk contribution, max 4 points. Independent of TEWL.
 * Tachycardia >100 bpm ramps 0->2.5 by 130 bpm (shock-level), then 2.5->4 by 150 bpm.
 * Bradycardia <60 bpm ramps 0->2.5 by 50 bpm (severe), then 2.5->4 by 40 bpm.
 */
function calculateHeartRateRisk(heartRate: number, t: RiskThresholds): number {
  // Hardware sends a negative sentinel when no pulse sensor is present/reading.
  // Treat any implausible value as "unavailable" -> contributes no risk AND no
  // corroborating sign. Without this, -1 bpm would fall through the bradycardia
  // branch and score maximum heart-rate risk, falsely escalating the alert.
  if (!isHeartRateAvailable(heartRate)) return 0;

  if (heartRate > t.heartRateTachycardia) {
    if (heartRate <= t.heartRateSevere) {
      return scaleBetween(heartRate, t.heartRateTachycardia, t.heartRateSevere, 2.5);
    }
    return 2.5 + scaleBetween(heartRate, t.heartRateSevere, t.heartRateSevere + 20, 1.5);
  }
  if (heartRate < t.heartRateBradycardia) {
    if (heartRate >= t.heartRateSevereBradycardia) {
      return scaleBetween(t.heartRateBradycardia - heartRate, 0, t.heartRateBradycardia - t.heartRateSevereBradycardia, 2.5);
    }
    return 2.5 + scaleBetween(t.heartRateSevereBradycardia - heartRate, 0, 10, 1.5);
  }
  return 0;
}

/**
 * TEWL risk contribution, max 4 points - implements the actual validated
 * AND-gate rule (rise >=1 g/m2/h AND a corroborating sign), not a magnitude
 * ramp. Heart rate abnormality stands in for the study's "objective
 * symptom/sign" requirement, since there's no separate symptom input.
 *
 * - Rise < 1 g/m2/h: 0 (below the only validated threshold)
 * - Rise >= 1 g/m2/h, no corroborating heart rate abnormality: flat 1
 *   (sensitive but not specific alone, per the study's explicit caveat)
 * - Rise >= 1 g/m2/h WITH corroborating heart rate abnormality: flat 4
 *   (the actual 100% sensitive / 96% specific validated combination)
 */
function calculateGSRRisk(currentTewl: number, heartRateRisk: number, t: RiskThresholds): number {
  const rise = currentTewl - t.tewlBaseline;
  if (rise < t.tewlRiseThreshold) return 0;
  const hasCorroboratingSign = heartRateRisk > 0;
  return hasCorroboratingSign ? 4 : 1;
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
  const gsrRisk = calculateGSRRisk(gsr, heartRateRisk, thresholds);
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
  if (factors.gsrRisk >= 4) {
    parts.push("rising skin water loss with a corroborating vital sign (validated early-warning pattern)");
  } else if (factors.gsrRisk > 0) {
    parts.push("rising skin water loss (not yet corroborated)");
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
