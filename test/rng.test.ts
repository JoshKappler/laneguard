import { describe, expect, test } from "vitest";
import { mulberry32, gauss, splitSeed } from "@/lib/core/rng";

// Golden sequences generated from the legacy build's RNG definitions
// (test/oracle/run-oracle.mjs runs the same code from legacy/index.html).
describe("mulberry32", () => {
  test("reproduces the legacy sequence for seed 1337", () => {
    const r = mulberry32(1337);
    const got = [r(), r(), r(), r(), r()];
    const want = [
      0.184411832597, 0.189989251317, 0.810471992241, 0.643748822156,
      0.430774615612,
    ];
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 12));
  });

  test("reproduces the legacy sequence for seed 0", () => {
    const r = mulberry32(0);
    expect(r()).toBeCloseTo(0.266429208685, 12);
    expect(r()).toBeCloseTo(0.000329745701, 12);
  });
});

describe("gauss", () => {
  test("reproduces the legacy Box-Muller draw for seed 7", () => {
    const r = mulberry32(7);
    expect(gauss(r, 0, 1)).toBeCloseTo(2.759372987029, 12);
    expect(gauss(r, 0, 1)).toBeCloseTo(-0.068051356507, 12);
    expect(gauss(r, 0, 1)).toBeCloseTo(-0.945948960445, 12);
  });

  test("applies mean and sd linearly", () => {
    const a = gauss(mulberry32(7), 0, 1);
    const b = gauss(mulberry32(7), 100, 10);
    expect(b).toBeCloseTo(100 + 10 * a, 9);
  });
});

describe("splitSeed", () => {
  test("derives stable, distinct stream seeds from a master seed", () => {
    expect(splitSeed(1337, "world")).toBe(splitSeed(1337, "world"));
    expect(splitSeed(1337, "world")).not.toBe(splitSeed(1337, "bot"));
    expect(splitSeed(1337, "world")).not.toBe(splitSeed(1338, "world"));
    // must be a valid int32-ish seed
    expect(Number.isInteger(splitSeed(1, "x"))).toBe(true);
  });
});
