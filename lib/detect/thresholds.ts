/*
 * The single place the app asks "what thresholds are we actually running?".
 * If a human corpus has been calibrated (`pnpm calibrate` wrote a calibrated
 * generated file), those constants override the priors; otherwise the
 * first-principles priors stand and are labeled as such in the UI.
 */
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type BenchConfig,
} from "@/lib/core/config";
import { CALIBRATION, CALIBRATED_THRESHOLDS } from "./thresholds.generated";

export { CALIBRATION };

/** Detector config with calibrated overrides applied when a corpus exists. */
const calibrationBasis: string = CALIBRATION.basis;

export function activeDetectorConfig(
  base: BenchConfig["detector"] = DEFAULT_CONFIG.detector
): BenchConfig["detector"] {
  if (calibrationBasis !== "calibrated") return base;
  return mergeConfig(DEFAULT_CONFIG, {
    detector: CALIBRATED_THRESHOLDS,
  }).detector;
}

export const isCalibrated = calibrationBasis === "calibrated";
