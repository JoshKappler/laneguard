/*
 * ROC / AUC utilities for calibrating a single scalar feature into a threshold
 * at a stated false-positive rate. Pure and deterministic.
 *
 * `direction` says which tail the attacker occupies:
 *   "high" — positives (bots) have LARGER values; flag value >= threshold
 *   "low"  — positives (bots) have SMALLER values; flag value <= threshold
 *
 * A false positive is a human (negative) that gets flagged. FPR matters more
 * than anything here: a false ban withholds a real player's money, so we pick
 * thresholds at a strict FPR ceiling, not at max accuracy.
 */

export type Direction = "high" | "low";

export interface RocPoint {
  threshold: number;
  tpr: number;
  fpr: number;
}

/** Area under the ROC curve via the Mann-Whitney U statistic (ties = 0.5). */
export function auc(neg: number[], pos: number[], direction: Direction): number {
  if (!neg.length || !pos.length) return NaN;
  let wins = 0;
  for (const p of pos)
    for (const n of neg) {
      const higher = direction === "high" ? p - n : n - p;
      if (higher > 0) wins += 1;
      else if (higher === 0) wins += 0.5;
    }
  return wins / (pos.length * neg.length);
}

/**
 * ROC curve over candidate thresholds (each distinct value, plus the extremes),
 * returned sorted by increasing FPR. A positive prediction is
 * value >= threshold ("high") or value <= threshold ("low").
 */
export function rocCurve(
  neg: number[],
  pos: number[],
  direction: Direction
): RocPoint[] {
  const all = [...neg, ...pos];
  const eps = 1e-9;
  const uniq = Array.from(new Set(all)).sort((a, b) => a - b);
  // candidate thresholds bracket every value so FPR spans [0,1]
  const cands =
    direction === "high"
      ? [Infinity, ...uniq.map((v) => v), -Infinity]
      : [-Infinity, ...uniq.map((v) => v), Infinity];
  const predict = (v: number, thr: number) =>
    direction === "high" ? v >= thr - eps : v <= thr + eps;
  const pts = cands.map((thr) => {
    const tp = pos.filter((v) => predict(v, thr)).length;
    const fp = neg.filter((v) => predict(v, thr)).length;
    return { threshold: thr, tpr: tp / pos.length, fpr: fp / neg.length };
  });
  pts.sort((a, b) => a.fpr - b.fpr || a.tpr - b.tpr);
  return pts;
}

export interface ThresholdChoice {
  threshold: number;
  tpr: number;
  fpr: number;
  auc: number;
  /** the FPR ceiling this was chosen under */
  fprTarget: number;
  nNeg: number;
  nPos: number;
}

/**
 * Pick the threshold with the highest TPR whose FPR does not exceed the target.
 * The reported FPR is the ACHIEVED one, which can be below the target when the
 * negative sample is small (few distinct values to place a cut between).
 */
export function thresholdAtFpr(
  neg: number[],
  pos: number[],
  direction: Direction,
  fprTarget: number
): ThresholdChoice {
  const curve = rocCurve(neg, pos, direction);
  let best = curve[0];
  for (const p of curve) {
    if (p.fpr <= fprTarget + 1e-9) {
      if (p.tpr > best.tpr || (p.tpr === best.tpr && p.fpr < best.fpr)) best = p;
    }
  }
  // if even the strictest cut exceeds the target (target ~0 impossible), take
  // the lowest-FPR point available
  if (best.fpr > fprTarget + 1e-9) {
    best = curve.reduce((a, b) => (b.fpr < a.fpr ? b : a), curve[0]);
  }
  return {
    threshold: best.threshold,
    tpr: best.tpr,
    fpr: best.fpr,
    auc: auc(neg, pos, direction),
    fprTarget,
    nNeg: neg.length,
    nPos: pos.length,
  };
}
