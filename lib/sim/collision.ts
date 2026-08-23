/*
 * Rotated-rectangle collision (SAT) in player-plane px space:
 * lateral = lane * lanePx, depth = z * zPx. The player box rotates with its
 * real heading; obstacles are axis-aligned. The player's box SHRINKS while
 * the car is angled (matching the real game: an angling car presents a
 * smaller hitbox, which is what makes threading a lane change possible).
 */

export function hitboxShrink(
  theta: number,
  shrinkMax: number,
  shrinkAngle: number
): number {
  return 1 - shrinkMax * Math.min(1, Math.abs(theta) / shrinkAngle);
}

export function rectHit(
  pcx: number,
  pcz: number,
  theta: number,
  ocx: number,
  ocz: number,
  ohw: number,
  ohl: number,
  hitHalfWidth: number,
  hitHalfLength: number,
  shrinkMax: number,
  shrinkAngle: number
): boolean {
  const shrink = hitboxShrink(theta, shrinkMax, shrinkAngle);
  const hw = hitHalfWidth * shrink,
    hl = hitHalfLength * shrink;
  const c = Math.cos(theta),
    s = Math.sin(theta);
  const P = [
    [pcx + hw * c - hl * s, pcz + hw * s + hl * c],
    [pcx - hw * c - hl * s, pcz - hw * s + hl * c],
    [pcx - hw * c + hl * s, pcz - hw * s - hl * c],
    [pcx + hw * c + hl * s, pcz + hw * s - hl * c],
  ];
  const O = [
    [ocx + ohw, ocz + ohl],
    [ocx - ohw, ocz + ohl],
    [ocx - ohw, ocz - ohl],
    [ocx + ohw, ocz - ohl],
  ];
  const axes = [
    [1, 0],
    [0, 1],
    [c, s],
    [-s, c],
  ];
  for (const ax of axes) {
    let pMin = 1e18,
      pMax = -1e18,
      oMin = 1e18,
      oMax = -1e18;
    for (const q of P) {
      const d = q[0] * ax[0] + q[1] * ax[1];
      pMin = Math.min(pMin, d);
      pMax = Math.max(pMax, d);
    }
    for (const q of O) {
      const d = q[0] * ax[0] + q[1] * ax[1];
      oMin = Math.min(oMin, d);
      oMax = Math.max(oMax, d);
    }
    if (pMax < oMin || oMax < pMin) return false;
  }
  return true;
}
