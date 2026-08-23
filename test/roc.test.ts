import { describe, expect, test } from "vitest";
import { rocCurve, auc, thresholdAtFpr } from "@/lib/detect/roc";

describe("ROC / AUC", () => {
  test("perfectly separable, higher=positive → AUC 1.0", () => {
    const neg = [1, 2, 3, 4, 5];
    const pos = [6, 7, 8, 9, 10];
    expect(auc(neg, pos, "high")).toBeCloseTo(1.0, 10);
  });

  test("perfectly separable, lower=positive → AUC 1.0", () => {
    const neg = [6, 7, 8, 9, 10];
    const pos = [1, 2, 3, 4, 5];
    expect(auc(neg, pos, "low")).toBeCloseTo(1.0, 10);
  });

  test("identical distributions → AUC 0.5", () => {
    const neg = [1, 2, 3, 4, 5];
    const pos = [1, 2, 3, 4, 5];
    expect(auc(neg, pos, "high")).toBeCloseTo(0.5, 10);
  });

  test("ties are counted as half (Mann-Whitney)", () => {
    // pos all equal to a neg value → each pair is a tie → AUC 0.5
    expect(auc([5, 5], [5, 5], "high")).toBeCloseTo(0.5, 10);
  });

  test("AUC is direction-symmetric", () => {
    const neg = [1, 2, 3, 8];
    const pos = [4, 5, 6, 7];
    expect(auc(neg, pos, "high")).toBeCloseTo(1 - auc(neg, pos, "low"), 10);
  });

  test("rocCurve is monotone in FPR and TPR and spans [0,1]", () => {
    const neg = [1, 2, 3, 4, 5, 6];
    const pos = [4, 5, 6, 7, 8, 9];
    const curve = rocCurve(neg, pos, "high");
    expect(curve[0].fpr).toBeCloseTo(0, 10);
    expect(curve[curve.length - 1].fpr).toBeCloseTo(1, 10);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].fpr).toBeGreaterThanOrEqual(curve[i - 1].fpr - 1e-9);
      expect(curve[i].tpr).toBeGreaterThanOrEqual(curve[i - 1].tpr - 1e-9);
    }
  });
});

describe("thresholdAtFpr", () => {
  test("high direction: chosen threshold holds FPR at/under target with max TPR", () => {
    const neg = Array.from({ length: 1000 }, (_, i) => i / 1000); // U[0,1)
    const pos = Array.from({ length: 1000 }, (_, i) => 0.5 + i / 2000); // U[0.5,1)
    const r = thresholdAtFpr(neg, pos, "high", 0.1);
    const fprAt = neg.filter((v) => v >= r.threshold).length / neg.length;
    expect(fprAt).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(r.fpr).toBeLessThanOrEqual(0.1 + 1e-9);
    // at FPR 0.1 the cut sits near 0.9; ~20% of U[0.5,1) positives clear it
    expect(r.tpr).toBeGreaterThan(0.15);
    expect(r.tpr).toBeLessThan(0.3);
    expect(r.auc).toBeCloseTo(0.75, 1); // P(pos>neg) for these uniforms
  });

  test("low direction: positive if value <= threshold", () => {
    const neg = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const pos = [0.0, 0.1, 0.2, 0.3];
    const r = thresholdAtFpr(neg, pos, "low", 0.0);
    // at FPR 0 the threshold must exclude every negative
    expect(neg.every((v) => v > r.threshold)).toBe(true);
    expect(r.tpr).toBe(1); // all positives are below every negative
  });

  test("reports the achieved FPR, which may be below target when samples are coarse", () => {
    const neg = [1, 2, 3];
    const pos = [4, 5, 6];
    const r = thresholdAtFpr(neg, pos, "high", 0.1);
    expect(r.fpr).toBe(0);
    expect(r.tpr).toBe(1);
  });
});
