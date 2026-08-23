/*
 * Seeded RNG — identical math to the legacy build (verified by golden tests
 * against sequences generated from legacy/index.html).
 */

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rand: Rand, mean: number, sd: number): number {
  const u = Math.max(rand(), 1e-9),
    v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Derive a stable per-subsystem stream seed from a master seed, so one seed
 * in the UI reproduces the whole run while subsystems stay decorrelated. */
export function splitSeed(master: number, label: string): number {
  let h = master | 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x9e3779b1);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return h | 0;
}
