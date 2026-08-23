import { describe, expect, test } from "vitest";
import { breakEven, evPerGame, winNet, loseNet } from "@/lib/econ/economy";
import { simulatePopulation } from "@/lib/econ/population";
import { simulateWeek, cadenceMetrics } from "@/lib/econ/cadence";
import golden from "./golden/econ.json";

describe("economy arithmetic", () => {
  test("break-even win rate for $5 entry, 20% rake is exactly 62.5%", () => {
    expect(breakEven(5, 0.2)).toBeCloseTo(0.625, 10);
    expect(winNet(5, 0.2)).toBeCloseTo(3, 10);
    expect(loseNet(5)).toBeCloseTo(-5, 10);
    expect(evPerGame(0.625, 5, 0.2)).toBeCloseTo(0, 10);
    expect(evPerGame(0.7, 5, 0.2)).toBeCloseTo(0.6, 10);
  });
});

describe("population simulation parity with legacy build", () => {
  for (const sc of golden.econ.scenarios) {
    test(`botWR ${sc.botWR}: z/pctile/mean/sd match legacy exactly`, () => {
      const s = simulatePopulation({
        nPlayers: sc.nPlayers,
        nGames: sc.nGames,
        botWR: sc.botWR,
      });
      expect(s.mean).toBeCloseTo(sc.mean, 5);
      expect(s.sd).toBeCloseTo(sc.sd, 5);
      expect(s.z).toBeCloseTo(sc.z, 5);
      expect(s.pctile).toBeCloseTo(sc.pctile, 5);
      expect(s.noise).toBeCloseTo(sc.noise, 5);
    });
  }

  test("no profitable-and-hidden zone: any win rate above break-even is >3σ", () => {
    for (const wr of [0.625, 0.65, 0.7, 0.8]) {
      const s = simulatePopulation({ nPlayers: 400, nGames: 300, botWR: wr });
      expect(s.z).toBeGreaterThan(3);
    }
  });
});

describe("cadence simulation parity with legacy build", () => {
  const week = simulateWeek();
  for (const key of ["human", "farm", "sched"] as const) {
    test(`${key} weekly metrics match legacy exactly`, () => {
      const m = cadenceMetrics(week[key]);
      const g = golden.cadence[key];
      expect(m.n).toBe(g.n);
      expect(m.cv).toBeCloseTo(g.cv, 5);
      expect(m.activeHours).toBe(g.activeHours);
      expect(m.longestIdle).toBeCloseTo(g.longestIdle, 5);
    });
  }

  test("honest result is preserved: scheduled bot passes cadence checks", () => {
    const m = cadenceMetrics(week.sched);
    expect(m.cv).toBeGreaterThan(0.15); // not metronomic
    expect(m.activeHours).toBeLessThan(23); // has a sleep block
    expect(m.longestIdle).toBeGreaterThan(3);
  });
});
