/*
 * Swipe feature extraction — a direct port of the legacy detector's
 * featurize() and its distance/statistics helpers. Golden-tested against
 * values produced by executing the legacy build (test/golden/features.json).
 *
 * Everything here is pure: no DOM, no clocks, no globals.
 */

export interface TracePoint {
  x: number;
  y: number;
  t: number;
}

export interface SwipeInput {
  points: TracePoint[];
  trusted: boolean;
  source?: string;
  dur: number;
}

export interface NormPoint {
  x: number;
  y: number;
}

export interface SwipeFeatures {
  /** arc-length-resampled, translation/scale-normalized shape (16 pts) */
  res: NormPoint[];
  /** normalized velocity profile (16 samples) */
  profile: number[];
  /** Δ⁴/Δ² high-frequency energy ratio; NaN when too few points */
  white: number;
  /** implied per-point noise sigma in px */
  wamp: number;
  /** mean midpoint deviation (motor noise magnitude, px) */
  jitter: number;
  /** position of the velocity peak in normalized time [0,1] */
  peakT: number;
  /** raw path length in px */
  len: number;
  pts: TracePoint[];
  dur: number;
  trusted: boolean;
  intFrac: number;
}

export function featurize(s: SwipeInput): SwipeFeatures {
  const pts = s.points;
  const res = resample(pts, 16);
  let jitter = 0,
    jn = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i - 1].x + pts[i + 1].x) / 2,
      my = (pts[i - 1].y + pts[i + 1].y) / 2;
    jitter += Math.hypot(pts[i].x - mx, pts[i].y - my);
    jn++;
  }
  jitter = jn ? jitter / jn : 0;
  let peakV = 0,
    peakT = 0.5;
  const t0 = pts[0].t,
    dur = pts[pts.length - 1].t - t0 || 1;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t || 1;
    const v = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / dt;
    if (v > peakV) {
      peakV = v;
      peakT = (pts[i].t - t0) / dur;
    }
  }
  let ints = 0;
  for (const p of pts) if (p.x === Math.round(p.x) && p.y === Math.round(p.y)) ints++;
  const profile = speedProfile(pts, 16);
  // High-frequency noise energy: the 4th difference annihilates smooth motion
  // (through cubic) but amplifies iid noise by sqrt(70)σ; the 2nd difference
  // carries curvature. Their sd ratio separates injected white noise (~3.4 for
  // pure noise, ~2.2 riding a curve) from band-limited human motion.
  let white = NaN,
    wamp = 0;
  if (pts.length >= 7) {
    const dif = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
    const sdv = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
    };
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    const d2x = dif(dif(xs)),
      d2y = dif(dif(ys));
    const d4x = dif(dif(d2x)),
      d4y = dif(dif(d2y));
    const e4 = sdv(d4x) + sdv(d4y),
      e2 = sdv(d2x) + sdv(d2y);
    white = e4 / (e2 + 1e-9);
    wamp = e4 / (2 * Math.sqrt(70)); // implied per-point noise sigma in px
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return {
    res,
    profile,
    white,
    wamp,
    jitter,
    peakT,
    len,
    pts,
    dur: s.dur,
    trusted: s.trusted,
    intFrac: ints / pts.length,
  };
}

export function speedProfile(pts: TracePoint[], n: number): number[] {
  const t0 = pts[0].t,
    dur = pts[pts.length - 1].t - t0 || 1;
  const v: { t: number; s: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t || 1;
    v.push({
      t: (pts[i].t - t0) / dur,
      s: Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / dt,
    });
  }
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const target = k / (n - 1);
    let i = 0;
    while (i < v.length - 1 && v[i].t < target) i++;
    out.push(v[i].s);
  }
  const mean = out.reduce((a, b) => a + b, 0) / n || 1;
  return out.map((x) => x / mean);
}

export function profileDist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

export function resample(pts: TracePoint[], n: number): NormPoint[] {
  const d = [0];
  for (let i = 1; i < pts.length; i++)
    d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = d[d.length - 1] || 1;
  const out: NormPoint[] = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    let i = 1;
    while (i < d.length - 1 && d[i] < target) i++;
    const span = d[i] - d[i - 1] || 1;
    const u = (target - d[i - 1]) / span;
    out.push({
      x: (pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u - pts[0].x) / total,
      y: (pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u - pts[0].y) / total,
    });
  }
  if (out[n - 1].x < 0) for (const p of out) p.x = -p.x;
  return out;
}

export function shapeDist(a: NormPoint[], b: NormPoint[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++)
    s += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return s / a.length;
}

export interface BasicStats {
  mean: number;
  sd: number;
  min: number;
  cv: number;
}

export function stats(arr: number[]): BasicStats {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  let min = Infinity;
  for (const v of arr) if (v < min) min = v;
  return { mean, sd, min, cv: mean ? sd / mean : 0 };
}

export function skewness(arr: number[]): number {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  let m2 = 0,
    m3 = 0;
  for (const x of arr) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  return m2 > 1e-9 ? m3 / Math.pow(m2, 1.5) : 0;
}
