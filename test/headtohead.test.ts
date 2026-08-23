import { describe, expect, test } from "vitest";
import { Engine } from "@/lib/sim/engine";
import { mulberry32, splitSeed } from "@/lib/core/rng";
import { DEFAULT_CONFIG, mergeConfig, PRESETS } from "@/lib/core/config";
import {
  playRun,
  drawHuman,
  humanConfig,
  decide,
  scoreOf,
  winRate,
  decidedWinRate,
  tieRate,
  evPerGameH2H,
  breakEvenDecided,
  breakEvenH2H,
  tieNet,
  recordVs,
  fieldRecords,
  recordVsField,
  spread,
  zAgainst,
  DEFAULT_FIELD,
  type RunResult,
} from "@/lib/econ/headtohead";

const DT = 1000 / 60;
const res = (p: Partial<RunResult>): RunResult => ({
  banked: 0,
  score: 0,
  crashed: false,
  durS: 0,
  timedOut: false,
  ...p,
});

/*
 * The fair-course property is what makes one run per (player, course) enough to
 * derive every pairwise match outcome. If a player's actions could perturb what
 * spawns, the cached-score comparison in fieldRecords() would be comparing two
 * players against different worlds, and every win rate in the study would be
 * meaningless. So it gets a direct test rather than an assumption.
 */
describe("fair-course property", () => {
  test("the spawn stream is identical no matter how the player drives", () => {
    // no hitbox and no barriers, so neither engine can crash out early and both
    // can be compared frame-for-frame over a long window
    const cfg = mergeConfig(DEFAULT_CONFIG, {
      game: {
        hitHalfWidth: 0.01,
        hitHalfLength: 0.01,
        barrierFreq: 0,
      },
    }).game;

    // cars' lane/depth/speed are player-independent; threatAt and rtLogged are
    // not, and are deliberately excluded
    const sig = (e: Engine) =>
      e.state.cars
        .map((c) => `${c.lane}:${c.z.toFixed(4)}:${c.f.toFixed(4)}:${c.passed ? 1 : 0}`)
        .join(",");

    const mk = () => {
      const e = new Engine(cfg, mulberry32(splitSeed(4242, "world")));
      e.resetRun();
      return e;
    };
    const passive = mk();
    const busy = mk();

    const a: string[] = [];
    const b: string[] = [];
    const busyLanes = new Set<number>();
    for (let f = 0; f < 60 * 90; f++) {
      passive.step(DT);
      busy.step(DT);
      // drive the second engine across every lane, including the cashout lane
      if (f % 37 === 0) busy.laneChange(Math.floor(f / 37) % 6 < 3 ? -1 : 1, busy.now);
      busyLanes.add(busy.state.lane);
      a.push(sig(passive));
      b.push(sig(busy));
    }
    // it really did cover the road, and the passive one really did sit still
    expect(busyLanes.size).toBe(4);
    expect(passive.state.lane).toBe(1);
    expect(b).toEqual(a);
  });

  test("playRun is deterministic and course-seeded", () => {
    const cfg = mergeConfig(DEFAULT_CONFIG, {
      mode: "generative",
      bot: { noise: { model: "organic" }, cashout: { target: 30 } },
      seed: 99,
    });
    const one = playRun(cfg, 12345);
    const two = playRun(cfg, 12345);
    expect(two).toEqual(one);
    // a different course is a different run
    expect(playRun(cfg, 12346)).not.toEqual(one);
  });
});

describe("match comparator", () => {
  test("a forfeited run is worth nothing however far it got", () => {
    expect(scoreOf(res({ score: 900, crashed: true, banked: 0 }))).toBe(0);
    expect(scoreOf(res({ score: 12, banked: 1.2 }))).toBe(12);
  });

  test("banked beats forfeited; two forfeits tie", () => {
    const banked = res({ score: 5, banked: 1.1 });
    const bigCrash = res({ score: 500, crashed: true });
    expect(decide(banked, bigCrash)).toBe("a");
    expect(decide(bigCrash, banked)).toBe("b");
    expect(decide(bigCrash, res({ score: 400, crashed: true }))).toBe("tie");
  });
});

describe("tie rules and break-even", () => {
  const ENTRY = 5,
    RAKE = 0.2;

  test("tie settlement costs what the rule says", () => {
    expect(tieNet(ENTRY, RAKE, "refund")).toBe(0);
    expect(tieNet(ENTRY, RAKE, "split")).toBeCloseTo(-1, 10); // $4 back on a $5 entry
    expect(tieNet(ENTRY, RAKE, "loss")).toBe(-5);
  });

  test("with ties refunded, break-even is the classic 62.5%", () => {
    expect(breakEvenH2H(ENTRY, RAKE)).toBeCloseTo(0.625, 10);
    expect(breakEvenDecided(ENTRY, RAKE, 0, "refund")).toBeCloseTo(0.625, 10);
    expect(breakEvenDecided(ENTRY, RAKE, 0.5, "refund")).toBeCloseTo(0.625, 10);
  });

  test("raking ties raises the decided win share an attacker needs", () => {
    const noTies = breakEvenDecided(ENTRY, RAKE, 0, "split");
    const manyTies = breakEvenDecided(ENTRY, RAKE, 0.5, "split");
    expect(noTies).toBeCloseTo(0.625, 10);
    expect(manyTies).toBeGreaterThan(noTies);
    // half the games tying costs $0.50/game, needing $0.50 more from the rest
    expect(manyTies).toBeCloseTo((0.5 / 0.5 + 5) / 8, 10);
  });

  test("EV agrees with the break-even it implies", () => {
    // build a record that sits exactly at the split-tie break-even
    const ties = 200,
      decided = 800;
    const p = breakEvenDecided(ENTRY, RAKE, ties / (ties + decided), "split");
    const wins = Math.round(decided * p);
    const rec = { wins, losses: decided - wins, ties };
    expect(evPerGameH2H(rec, ENTRY, RAKE, "split")).toBeCloseTo(0, 2);
  });
});

describe("record arithmetic", () => {
  test("win rate counts a tie as half, decided rate ignores it", () => {
    const rec = { wins: 30, losses: 10, ties: 60 };
    expect(winRate(rec)).toBeCloseTo(0.6, 10);
    expect(decidedWinRate(rec)).toBeCloseTo(0.75, 10);
    expect(tieRate(rec)).toBeCloseTo(0.6, 10);
  });

  test("recordVs compares course by course", () => {
    expect(recordVs([5, 0, 3, 7], [1, 0, 9, 7])).toEqual({
      wins: 1,
      losses: 1,
      ties: 2,
    });
  });

  test("a field's records are internally consistent", () => {
    const scores = [
      [5, 1, 0, 2],
      [1, 4, 0, 9],
      [7, 1, 3, 0],
    ];
    const recs = fieldRecords(scores);
    const wins = recs.reduce((a, r) => a + r.wins, 0);
    const losses = recs.reduce((a, r) => a + r.losses, 0);
    // every win is somebody's loss
    expect(wins).toBe(losses);
    // and each player met every other player on every course
    for (const r of recs)
      expect(r.wins + r.losses + r.ties).toBe((scores.length - 1) * 4);
  });

  test("recordVsField matches summing the pairings by hand", () => {
    const field = [
      [1, 2], // course 0: 2>1 win  · course 1: 1<2 loss
      [3, 0], // course 0: 2<3 loss · course 1: 1>0 win
    ];
    expect(recordVsField([2, 1], field)).toEqual({ wins: 2, losses: 2, ties: 0 });
    // ties are counted, not dropped
    expect(recordVsField([1, 2], field)).toEqual({ wins: 1, losses: 1, ties: 2 });
  });

  test("z-score is measured against the field's own spread", () => {
    const s = spread([0.48, 0.5, 0.52]);
    expect(s.mean).toBeCloseTo(0.5, 10);
    expect(zAgainst(0.5 + 2 * s.sd, s)).toBeCloseTo(2, 6);
  });
});

describe("modeled field", () => {
  test("field parameters move the players they generate", () => {
    const draws = Array.from({ length: 400 }, (_, i) =>
      drawHuman(mulberry32(i + 1), DEFAULT_FIELD)
    );
    const mean = (f: (d: (typeof draws)[0]) => number) =>
      draws.reduce((a, d) => a + f(d), 0) / draws.length;
    expect(mean((d) => d.rtMean)).toBeGreaterThan(380);
    expect(mean((d) => d.rtMean)).toBeLessThan(460);
    expect(mean((d) => d.cashTarget)).toBeGreaterThan(40);
    // a sharper field really is faster and less greedy
    const sharp = Array.from({ length: 400 }, (_, i) =>
      drawHuman(mulberry32(i + 1), {
        rtCenter: 340,
        rtPerZ: 45,
        errCenter: 0.07,
        greedCenter: 24,
        greedSd: 10,
      })
    );
    const sharpRt = sharp.reduce((a, d) => a + d.rtMean, 0) / sharp.length;
    expect(sharpRt).toBeLessThan(mean((d) => d.rtMean));
  });

  test("skill is monotone: a better draw plays better", () => {
    const cfgFor = (z: number) =>
      humanConfig(
        DEFAULT_CONFIG,
        {
          z,
          rtMean: 420 - 55 * z,
          rtSd: 95 - 12 * z,
          errorRate: Math.max(0, 0.14 - 0.045 * z),
          cashTarget: 30,
        },
        4242
      );
    const banked = (z: number) => {
      let n = 0;
      for (let c = 0; c < 60; c++) if (playRun(cfgFor(z), 5000 + c).banked > 0) n++;
      return n / 60;
    };
    // averaged over 60 shared courses, the strong draw banks more often
    expect(banked(2)).toBeGreaterThan(banked(-2));
  });
});

describe("cashout policy", () => {
  const run = (target: number | null, courses = 80) => {
    const cfg = mergeConfig(DEFAULT_CONFIG, {
      mode: "generative",
      hwInject: true,
      seed: 31337,
      bot: { noise: { model: "organic" }, cashout: { target } },
    });
    let banked = 0;
    for (let c = 0; c < courses; c++)
      if (playRun(cfg, 900_000 + c * 31).banked > 0) banked++;
    return banked / courses;
  };

  test("a bank target makes the bot actually bank; null is the legacy drift", () => {
    const never = run(null);
    const eager = run(18);
    expect(eager).toBeGreaterThan(never + 0.1);
  });

  test("greed is a real trade-off, not a free win", () => {
    // pushing for a bigger multiplier means banking less often
    expect(run(18)).toBeGreaterThan(run(110));
  });

  test("the default config banks nothing on purpose", () => {
    expect(DEFAULT_CONFIG.bot.cashout.target).toBeNull();
    expect(DEFAULT_CONFIG.bot.skill.errorRate).toBe(0);
  });
});

describe("execution error", () => {
  test("fumbling inputs costs runs", () => {
    const bank = (errorRate: number) => {
      const cfg = mergeConfig(DEFAULT_CONFIG, {
        mode: "generative",
        seed: 777,
        bot: { noise: { model: "organic" }, cashout: { target: 30 }, skill: { errorRate } },
      });
      let n = 0;
      for (let c = 0; c < 80; c++) if (playRun(cfg, 6000 + c).banked > 0) n++;
      return n / 80;
    };
    expect(bank(0)).toBeGreaterThan(bank(0.35));
  });
});

describe("shipped stealth preset", () => {
  test("banks like a human rather than never banking", () => {
    const preset = PRESETS.find((p) => p.id === "stealth-camouflage")!;
    expect(preset.config.bot?.cashout?.target).toBe(30);
    const cfg = mergeConfig(DEFAULT_CONFIG, { ...preset.config, seed: 4242 });
    let banked = 0;
    const courses = 60;
    for (let c = 0; c < courses; c++)
      if (playRun(cfg, 900_000 + c * 31).banked > 0) banked++;
    // the whole point of the change: it cashes out on a real fraction of runs
    expect(banked / courses).toBeGreaterThan(0.3);
  });

  test("it wins more head-to-head than it loses against a modeled field", () => {
    const preset = PRESETS.find((p) => p.id === "stealth-camouflage")!;
    const cfg = mergeConfig(DEFAULT_CONFIG, { ...preset.config, seed: 4242 });
    const courses = 60;
    const bot = Array.from({ length: courses }, (_, c) => {
      const r = playRun(cfg, 900_000 + c * 31);
      return scoreOf(r);
    });
    const rand = mulberry32(4242);
    const field = Array.from({ length: 12 }, (_, i) => {
      const hc = humanConfig(DEFAULT_CONFIG, drawHuman(rand, DEFAULT_FIELD), 700_000 + i * 17);
      return Array.from({ length: courses }, (_, c) =>
        scoreOf(playRun(hc, 900_000 + c * 31))
      );
    });
    const rec = recordVsField(bot, field);
    expect(rec.wins).toBeGreaterThan(rec.losses);
    // and it is a winning-but-not-absurd rate, which is the tuning target
    expect(winRate(rec)).toBeGreaterThan(0.5);
    expect(winRate(rec)).toBeLessThan(0.7);
  });
});
