import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/core/config";
import { activeDetectorConfig, CALIBRATION, isCalibrated } from "@/lib/detect/thresholds";

describe("calibration wiring", () => {
  test("generated calibration file is present and well-formed", () => {
    expect(["prior", "calibrated"]).toContain(CALIBRATION.basis);
    expect(typeof CALIBRATION.generatedAt).toBe("string");
    expect(CALIBRATION.fprTarget).toBeGreaterThan(0);
  });

  test("prior basis leaves every detector threshold at its default", () => {
    if (isCalibrated) {
      // when a corpus exists the calibrated config must still be a valid,
      // complete detector config
      const c = activeDetectorConfig();
      expect(c.noise.whiteFlag).toBeGreaterThan(0);
      expect(c.kinematics.jitterNone).toBeGreaterThan(0);
      expect(c.calibration.basis).toBe("calibrated");
    } else {
      expect(activeDetectorConfig()).toEqual(DEFAULT_CONFIG.detector);
      expect(CALIBRATION.humanCorpus.swipes).toBe(0);
    }
  });
});
