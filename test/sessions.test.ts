import { describe, expect, test } from "vitest";
import { runSession, type SessionResult } from "@/lib/bench/session";
import { DEFAULT_CONFIG, mergeConfig, type DeepPartial, type BenchConfig } from "@/lib/core/config";

/*
 * Behavioral regression suite. The expectations encode the attacker ladder as
 * measured by the oracle harness against the legacy build (test/golden/
 * sessions.json), plus the new stealth rung this version adds:
 *
 *   naive scripted  -> BOT (kinematics smoking gun)
 *   replay farm     -> BOT (replay similarity)
 *   generative iid  -> caught (noise character: injected noise is white)
 *   generative organic -> beats every swipe-level signal forever, but session
 *                      texture + the RT-floor artifact catch it in minutes
 *   stealth camouflage -> beats the ENTIRE client-side detector indefinitely
 *                      (this is the honest thesis: it must stay HUMAN)
 */

const mk = (over: DeepPartial<BenchConfig>, seed = 1337) =>
  mergeConfig(DEFAULT_CONFIG, { ...over, seed });

const run = (over: DeepPartial<BenchConfig>, durationS: number, seed = 1337) =>
  runSession({ config: mk(over, seed), durationS });

const sig = (r: SessionResult, name: string) => r.final.signals[name];

describe("naive scripted bot", () => {
  test("is called BOT with the kinematics smoking gun", () => {
    const r = run({ mode: "perfect" }, 180);
    expect(r.final.verdict).toBe("BOT");
    expect(r.final.overall).toBeGreaterThanOrEqual(0.68);
    expect(sig(r, "swipe kinematics").sus).toBeGreaterThanOrEqual(0.9);
    expect(r.final.featureStats.meanJitter).toBeLessThan(0.05);
  });
});

describe("replay farm (mirror bot, hardware injection)", () => {
  test("is called BOT via replay similarity even with trusted events", () => {
    const r = run({ mode: "mirror", hwInject: true }, 180);
    expect(r.final.verdict).toBe("BOT");
    expect(sig(r, "replay similarity").sus).toBeGreaterThanOrEqual(0.5);
    expect(sig(r, "event integrity").sus).toBe(0); // injection blinds provenance
    // perturbed replays still carry human-scale jitter (legacy measured ~1.8px)
    expect(r.final.featureStats.meanJitter).toBeGreaterThan(1.2);
  });
});

describe("generative bot, iid noise", () => {
  test("noise character reads the injected randomness as white", () => {
    const r = run(
      { mode: "generative", hwInject: true, bot: { noise: { model: "iid" } } },
      180
    );
    expect(r.final.featureStats.meanWhite).toBeGreaterThan(2.0);
    expect(sig(r, "noise character").sus).toBeGreaterThanOrEqual(0.55);
    expect(["SUSPECT", "BOT"]).toContain(r.final.verdict);
  });
});

describe("generative bot, organic noise (the evasion)", () => {
  const over = {
    mode: "generative" as const,
    hwInject: true,
    bot: { noise: { model: "organic" as const } },
  };

  test("permanently defeats every swipe-level signal (all seeds)", () => {
    for (const seed of [1337, 7, 99]) {
      const r = runSession({
        config: mk(over, seed),
        durationS: 180,
        snapshotAtS: [60, 120],
      });
      for (const snap of [r.snapshots["60"], r.snapshots["120"], r.final]) {
        expect(snap.signals["swipe kinematics"].sus).toBe(0);
        expect(snap.signals["noise character"].sus).toBeLessThanOrEqual(0.35);
        expect(snap.signals["replay similarity"].sus).toBeLessThanOrEqual(0.25);
      }
      expect(r.final.featureStats.meanWhite).toBeGreaterThan(1.4);
      expect(r.final.featureStats.meanWhite).toBeLessThan(2.05);
    }
  });

  test("reads HUMAN early, then session-level signals catch it (seed 1337)", () => {
    const r = runSession({
      config: mk(over, 1337),
      durationS: 180,
      snapshotAtS: [60],
    });
    // early window: the evasion holds (this is the legacy build's headline
    // HUMAN 0.21 measurement, reproduced by the oracle at 60s as 0.19)
    expect(r.snapshots["60"].verdict).toBe("HUMAN");
    // sustained play: behavior texture / RT-floor artifact escalate
    expect(r.final.verdict).not.toBe("HUMAN");
    expect(r.final.overall).toBeGreaterThanOrEqual(0.5);
    expect(r.firstFlagS).not.toBeNull();
  });
});

describe("stealth camouflage bot (the new rung)", () => {
  const over = {
    mode: "generative" as const,
    hwInject: true,
    bot: {
      noise: { model: "organic" as const },
      rt: { family: "exgaussian" as const, mean: 210, sd: 40, tau: 90, floor: 170 },
      gateRtToThreat: true,
      riskPerMin: 0.7,
      abortsPerMin: 1.6,
    },
  };

  test("beats the entire client-side detector for 10 sustained minutes (3 seeds)", { timeout: 180000 }, () => {
    for (const seed of [1337, 7, 99]) {
      const r = run(over, 600, seed);
      expect(r.final.ready).toBe(true);
      expect(r.final.verdict).toBe("HUMAN");
      expect(r.final.overall).toBeLessThan(0.33);
      expect(r.firstBotS).toBeNull();
    }
  });

  test("camouflage behaviors actually happen and cost something (seed 1337)", { timeout: 90000 }, () => {
    const r = run(over, 600);
    const c = r.final.counters;
    expect(c.aborts).toBeGreaterThan(0); // fakes changed-my-mind gestures
    expect(c.risks).toBeGreaterThan(0); // enters contested space
    expect(c.deaths).toBeGreaterThan(0); // and genuinely pays for it
    // RT gating holds the measured reaction floor above the human threshold
    expect(r.final.featureStats.rtMin).toBeGreaterThanOrEqual(150);
    // still organic noise underneath
    expect(r.final.featureStats.meanWhite).toBeLessThan(2.05);
  });
});

describe("session mechanics", () => {
  test("human mode with no input stays WARMING UP", () => {
    const r = run({ mode: "human" }, 60);
    expect(r.final.verdict).toBe("WARMING UP");
    expect(r.final.counters.swipes).toBe(0);
  });

  test("same seed reproduces the identical session; different seed diverges", () => {
    const spec = {
      config: mk({ mode: "generative", hwInject: true }, 555),
      durationS: 90,
    };
    const a = runSession(spec);
    const b = runSession(spec);
    expect(a.final.overall).toBe(b.final.overall);
    expect(a.events.length).toBe(b.events.length);
    expect(JSON.stringify(a.trail)).toBe(JSON.stringify(b.trail));
    const c = runSession({ ...spec, config: mk({ mode: "generative", hwInject: true }, 556) });
    expect(JSON.stringify(c.trail)).not.toBe(JSON.stringify(a.trail));
  });

  test("session reports per-run outcomes for economy analysis", () => {
    const r = run({ mode: "generative", hwInject: true }, 180);
    expect(r.runs.length).toBeGreaterThan(2);
    for (const runInfo of r.runs) {
      expect(["crash", "cashout"]).toContain(runInfo.endKind);
      expect(runInfo.score).toBeGreaterThanOrEqual(0);
    }
  });
});
