import { describe, expect, test } from "vitest";
import { Engine } from "@/lib/sim/engine";
import { DEFAULT_CONFIG, mergeConfig } from "@/lib/core/config";
import { mulberry32 } from "@/lib/core/rng";

const DT = 1000 / 60;

function freshEngine(seed = 42) {
  return new Engine(DEFAULT_CONFIG.game, mulberry32(seed));
}

/** resetRun, then step through the READY countdown into the running phase */
function startRun(e: Engine) {
  const evs = e.resetRun();
  for (let i = 0; i < 300 && e.state.phase === "countdown"; i++) e.step(DT);
  return evs;
}

describe("engine basics", () => {
  test("starts idle; resetRun opens the READY countdown, then the run", () => {
    const e = freshEngine();
    expect(e.state.phase).toBe("idle");
    e.resetRun();
    expect(e.state.phase).toBe("countdown");
    expect(e.state.lane).toBe(1);
    expect(e.state.speed).toBe(DEFAULT_CONFIG.game.baseSpeed);
    for (let i = 0; i < 300 && e.state.phase === "countdown"; i++) e.step(DT);
    expect(e.state.phase).toBe("running");
    expect(e.now).toBeGreaterThanOrEqual(DEFAULT_CONFIG.game.introMs);
  });

  test("difficulty ramps with run time and clamps at configured limits", () => {
    const e = freshEngine();
    startRun(e);
    for (let i = 0; i < 60 * 120; i++) {
      e.state.cars = []; // keep the road clear so the run survives the full 2 min
      e.state.barriers = [];
      e.step(DT);
    }
    expect(e.state.speed).toBe(DEFAULT_CONFIG.game.maxSpeed);
    expect(e.state.density).toBeCloseTo(DEFAULT_CONFIG.game.densityMax, 5);
    expect(e.state.waveGap).toBe(DEFAULT_CONFIG.game.waveGapMin);
  });

  test("holding the cashout lane banks entry × payout curve and ends the run", () => {
    const e = freshEngine(7);
    startRun(e);
    // pretend the run already earned a mid-curve score, then go bank it
    e.state.cars = [];
    e.state.barriers = [];
    e.state.score = 5000;
    e.keyLaneChange(1, true, e.now);
    e.keyLaneChange(1, true, e.now);
    let banked = 0;
    for (let i = 0; i < 60 * 6 && e.state.phase === "running"; i++) {
      e.state.cars = []; // keep the road clear so nothing can crash the test
      e.state.barriers = [];
      const evs = e.step(DT);
      for (const ev of evs)
        if (ev.kind === "runEnd" && ev.data?.endKind === "cashout")
          banked = ev.data.banked as number;
    }
    expect(e.state.phase).toBe("cashed");
    expect(banked).toBeGreaterThan(0);
    // the cashout lane earns nothing, so the score froze at 5000
    expect(banked).toBeCloseTo(DEFAULT_CONFIG.game.entryFee * e.multiplier(), 6);
    const cap = DEFAULT_CONFIG.game.payout.at(-1)![1];
    expect(banked).toBeLessThanOrEqual(DEFAULT_CONFIG.game.entryFee * cap);
  });

  test("steering banks toward the target lane and lateral velocity follows heading", () => {
    const e = freshEngine();
    startRun(e);
    e.state.cars = [];
    e.state.barriers = [];
    e.keyLaneChange(-1, true, e.now); // lane 1 -> 0
    e.step(DT);
    expect(e.state.theta).toBeLessThan(0); // banking left
    const xBefore = e.state.x;
    e.step(DT);
    expect(e.state.x).toBeLessThan(xBefore); // moving left because angled
  });

  test("swipe input pipeline commits a lane change at the configured threshold", () => {
    const e = freshEngine();
    startRun(e);
    e.state.cars = [];
    const t0 = e.now;
    e.input.begin(200, 560, true, "pointer", t0);
    e.input.move(200 + DEFAULT_CONFIG.game.swipeThreshold - 1, 560, t0 + 40);
    expect(e.state.lane).toBe(1); // below threshold: no change yet
    e.input.move(200 + DEFAULT_CONFIG.game.swipeThreshold + 4, 560, t0 + 55);
    expect(e.state.lane).toBe(2); // committed
    const evs = e.input.end(t0 + 80);
    expect(evs.some((ev) => ev.kind === "swipe")).toBe(true);
  });

  test("a released sub-threshold gesture is reported as an abort", () => {
    const e = freshEngine();
    startRun(e);
    const t0 = e.now;
    e.input.begin(200, 560, true, "pointer", t0);
    e.input.move(206, 561, t0 + 30);
    e.input.move(210, 562, t0 + 60);
    const evs = e.input.end(t0 + 80);
    expect(evs.some((ev) => ev.kind === "abort")).toBe(true);
    expect(e.state.lane).toBe(1);
  });
});

describe("engine determinism", () => {
  test("same seed and config produce identical worlds", () => {
    const run = () => {
      const e = freshEngine(1234);
      e.resetRun();
      const log: string[] = [];
      for (let i = 0; i < 60 * 30; i++) {
        for (const ev of e.step(DT)) log.push(ev.t.toFixed(3) + ev.kind);
        if (e.state.phase === "dead" || e.state.phase === "cashed") e.resetRun();
      }
      return {
        log: log.join("|"),
        dist: e.state.dist,
        cars: e.state.cars.length,
      };
    };
    const a = run(),
      b = run();
    expect(a.log).toBe(b.log);
    expect(a.dist).toBe(b.dist);
    expect(a.cars).toBe(b.cars);
  });

  test("different seeds diverge", () => {
    const spawnSig = (seed: number) => {
      const e = freshEngine(seed);
      e.resetRun();
      for (let i = 0; i < 60 * 10; i++) e.step(DT);
      return JSON.stringify(e.state.cars.map((c) => [c.lane, +c.z.toFixed(2)]));
    };
    expect(spawnSig(1)).not.toBe(spawnSig(2));
  });
});

describe("lane-count generalization", () => {
  test("a 3-lane config runs and spawns traffic only in valid lanes", () => {
    const cfg = mergeConfig(DEFAULT_CONFIG, { game: { laneMult: [3, 1, 0] } });
    const e = new Engine(cfg.game, mulberry32(5));
    e.resetRun();
    for (let i = 0; i < 60 * 20; i++) {
      e.step(DT);
      if (e.state.phase === "dead" || e.state.phase === "cashed") e.resetRun();
      for (const c of e.state.cars) {
        expect(c.lane).toBeGreaterThanOrEqual(0);
        expect(c.lane).toBeLessThan(3);
      }
    }
  });
});
