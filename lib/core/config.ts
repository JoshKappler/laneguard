/*
 * Every meaningful parameter in the system lives here, with the legacy
 * build's values as defaults. The UI edits a copy, encodes the diff-from-
 * default into the URL for shareable permalinks, and presets are named
 * partials over this object.
 */

export interface GameConfig {
  /** per-lane score multiplier; the LAST lane is the cashout lane (mult 0) */
  laneMult: number[];
  lanePx: number;
  zPx: number;
  baseSpeed: number;
  maxSpeed: number;
  /** speed units gained per second of run time */
  speedRamp: number;
  waveGapStart: number;
  waveGapMin: number;
  waveGapRamp: number;
  densityStart: number;
  densityMax: number;
  densityRamp: number;
  /** probability a wave carries a barrier trap */
  barrierFreq: number;
  /** probability a wave is a two-lane pair instead of a single car */
  pairFreq: number;
  /** spawn/cull horizon (z) at base speed; scaled with zoom so spawns stay
      past the frame top as the ground plane zooms out */
  spawnZ: number;
  /** ground-plane zoom-out per speed unit over base (renderer + horizon) */
  zoomK: number;
  /** seconds of time-to-impact at which a blocking car becomes a threat */
  threatWindow: number;
  /** px of horizontal travel that commits a swipe */
  swipeThreshold: number;
  /** peak heading during a lane change, radians (~34°) */
  maxSteer: number;
  steerRate: number;
  hitHalfWidth: number;
  hitHalfLength: number;
  /** fraction of the hitbox shed at full bank */
  hitboxShrinkMax: number;
  /** heading (rad) at which the shrink saturates */
  hitboxShrinkAngle: number;
  /** seconds the cashout lane must be held to bank the run */
  cashHold: number;
  entryFee: number;
  /** score gained per z travelled in a 1x lane (video-fitted) */
  scorePerZ: number;
  /**
   * Payout curve as [score, multiple-of-entry] breakpoints, linearly
   * interpolated. Points up to 5582 are read off the reference session's HUD.
   * 5582-8497 is the observed flat 1.29x tier ($3.88 at both score 6,191 and
   * 7,824). The reference run died at 7,871, so everything above 8497 is an
   * unmeasured prior: it climbs to a 2.5x cap that plateaus at 10,000, per the
   * shipped game's payout behavior. Treat the tail as a prior, not a fit.
   */
  payout: [number, number][];
  /** READY countdown before the road starts moving, ms */
  introMs: number;
  /** chance a barrier wave drops a second block on another legal boundary */
  barrierPairFreq: number;
}

export type RtFamily = "gaussian" | "exgaussian";
export type NoiseModel = "iid" | "organic";

export interface BotConfig {
  rt: {
    family: RtFamily;
    /** gaussian: mean of the sample; exgaussian: mu of the normal component */
    mean: number;
    sd: number;
    /** exgaussian exponential-tail parameter (adds tau to the mean) */
    tau: number;
    floor: number;
  };
  /**
   * Stealth rung: never fire a swipe sooner than a sampled human RT after the
   * threat that would be credited with the dodge appeared. Without this, a
   * planning bot produces physically impossible sub-100 ms "reactions" when a
   * threat appears between decision and execution — a real detection artifact
   * the legacy build catches.
   */
  gateRtToThreat: boolean;
  /** deliberate contested-space entries per minute (0 = legacy behavior) */
  riskPerMin: number;
  /**
   * Receding-horizon route planning. The bot extrapolates every on-screen
   * car and barrier ~6 s forward and searches lane routes (cashout-lane dips
   * included, with the hold timer budgeted) for one that survives with
   * enough margin that the humanized execution layer cannot turn a planned
   * move into a crash. Replaces the one-step heuristic planner.
   */
  plan: boolean;
  /** fake changed-my-mind gestures per minute (0 = legacy behavior) */
  abortsPerMin: number;
  noise: {
    model: NoiseModel;
    iidAmpX: number;
    iidAmpY: number;
    pinkAmp: number;
    tremorHzMin: number;
    tremorHzVar: number;
    tremorAmpMin: number;
    tremorAmpVar: number;
    driftX: number;
    driftY: number;
  };
  mirror: {
    corpusSize: number;
    perturbPx: number;
    scaleVar: number;
    /** replay the user-recorded swipe corpus instead of the synthesized one */
    useRecorded: boolean;
  };
  /** time-to-impact (s) below which the perfect bot fires immediately */
  perfectUrgency: number;
  /** Greed dial. At `target` the player stops seeking value and steers to the
   *  cashout lane, dodging only if directly threatened. null = never bank on
   *  purpose. `calm` is the time-to-impact the lane must be clear of before a
   *  bank-step, so banking never overrides an owed dodge. */
  cashout: {
    target: number | null;
    /** when set, each run draws its own target uniformly from
     *  [target, targetMax]. A player who banks at the same score every single
     *  run is a texture tell, and the spread also samples more of the payout
     *  curve's steep tier. null = the fixed `target` every run. */
    targetMax: number | null;
    calm: number;
    /** planner only: bank any score at or above this when no route survives
     *  the horizon. Any paying score beats forfeiting the entry fee. */
    duress: number | null;
  };
  /** fraction of runs lost on purpose: the bot picks a score in advance and
   *  stops dodging there. Banking every run is detectable on win rate alone.
   *  Achieved win rate = planner survival x (1 - throwRate). */
  throwRate: number;
  /**
   * Execution quality. Used to model a population of players of differing
   * ability with one planner: `errorRate` is the probability that a decided
   * lane change is fumbled (dropped, or sent the wrong way), which is how a
   * weaker player actually loses runs. 0 = flawless execution, the legacy
   * behavior for every attacker profile.
   */
  skill: {
    errorRate: number;
  };
}

export interface DetectorConfig {
  reaction: {
    minDodges: number;
    floorMs: number;
    floorSus: number;
    cvTight: number;
    cvTightSus: number;
    cvLow: number;
    cvLowSus: number;
    meanLowMs: number;
    meanLowSus: number;
    skewMinN: number;
    skewFlat: number;
    skewFlatSus: number;
  };
  kinematics: {
    minSwipes: number;
    jitterNone: number;
    jitterNoneSus: number;
    jitterLow: number;
    jitterLowSus: number;
    peakSdUniform: number;
    peakSdSus: number;
  };
  noise: {
    minSwipes: number;
    whiteFlag: number;
    whiteWarn: number;
    ampMin: number;
    flagSus: number;
    warnSus: number;
  };
  replay: {
    minSwipes: number;
    window: number;
    shapeDupe: number;
    profileDupe: number;
    fracLo: number;
    fracSpan: number;
    flagFrac: number;
  };
  perfection: {
    minDodges: number;
    minMargins: number;
    marginCvTight: number;
    marginCvSus: number;
    zeroDeathDodges: number;
    zeroDeathSus: number;
    dodgesPerDeathHigh: number;
    dodgesPerDeathSus: number;
  };
  texture: {
    minMoves: number;
    zeroAbortSus: number;
    noContestSus: number;
    contestMinN: number;
    allSurvivedSus: number;
    allSurvivedSusHi: number;
    allSurvivedHiN: number;
    minRunEnds: number;
    neverBanksSus: number;
    fatalWindowMs: number;
  };
  integrity: {
    untrustedSus: number;
    minSwipes: number;
  };
  weights: {
    reaction: number;
    kinematics: number;
    noise: number;
    replay: number;
    perfection: number;
    texture: number;
    integrity: number;
  };
  escalation: {
    /** one signal at/above this floors the verdict at gunFloor */
    gunAt: number;
    gunFloor: number;
    /** a near-certain single signal carries most of the verdict itself */
    gunHardAt: number;
    gunHardMult: number;
    /** signals at/above hotAt count as independently suspicious */
    hotAt: number;
    hot2Floor: number;
    hot3Floor: number;
  };
  cuts: {
    /** overall below this reads HUMAN */
    human: number;
    /** overall at/above this reads BOT; between is SUSPECT */
    bot: number;
  };
  swipeMinPoints: number;
  swipeMinDurMs: number;
  maxSwipes: number;
  maxRts: number;
  maxMargins: number;
  calibration: {
    basis: "prior" | "calibrated";
    corpusSwipes: number;
    fprTarget: number | null;
    note: string;
  };
}

export interface EconConfig {
  entry: number;
  rake: number;
  nPlayers: number;
  nGames: number;
  /**
   * A HYPOTHETICAL sustained win rate, swept to ask "how much of an outlier
   * would a bot at this rate be". It is an input to the arithmetic, not a
   * measurement of any attacker in this build. The measured ceiling — what the
   * best policy in the head-to-head sweep actually achieved against the
   * strongest modeled field — is `MEASURED_BOT_WR_CEILING` below.
   */
  botWR: number;
  band: number;
  k: number;
}

/**
 * Best win rate any attacker policy reached against the strongest modeled field
 * in the head-to-head sweep (`pnpm evo`: 5 fields x 160 players x 1000 shared
 * courses, 99 policies x 4 seeds, 1.2M runs), under the head-to-head rule where
 * a forfeited run banks nothing. Recorded here so the default `botWR` is never
 * mistaken for something that was observed.
 *
 * The same sweep under a leaderboard rule — where a crashed run's score still
 * counts — reached 71.0%, but only against a field banking early, which is the
 * wrong strategy for that rule. Against opposition playing the leaderboard rule
 * correctly the ceiling falls to 52.0%. See results/evo/evolution.json.
 */
export const MEASURED_BOT_WR_CEILING = 0.565;

export type PlayMode = "human" | "perfect" | "mirror" | "generative";

export interface BenchConfig {
  seed: number;
  mode: PlayMode;
  /** deliver bot events as trusted, the way a phone-farm rig or OS driver would */
  hwInject: boolean;
  /** stop the bench after this many completed runs; 0 = run until stopped */
  runsTarget: number;
  game: GameConfig;
  bot: BotConfig;
  detector: DetectorConfig;
  econ: EconConfig;
}

export const DEFAULT_CONFIG: BenchConfig = {
  seed: 1337,
  mode: "human",
  hwInject: false,
  runsTarget: 0,
  game: {
    laneMult: [5, 2, 1, 0],
    lanePx: 62,
    zPx: 14.5,
    // motion constants fitted to a 60 fps capture of the shipped game
    // (references/: dash-line tracking, 2026-08-24 session)
    baseSpeed: 50,
    maxSpeed: 120,
    speedRamp: 0.9,
    waveGapStart: 24,
    waveGapMin: 16,
    waveGapRamp: 0.09,
    densityStart: 0.95,
    densityMax: 1.0,
    densityRamp: 0.002,
    barrierFreq: 0.5,
    pairFreq: 0.12,
    spawnZ: 215,
    zoomK: 0.00564,
    threatWindow: 1.15,
    swipeThreshold: 28,
    maxSteer: 0.475,
    steerRate: 30,
    hitHalfWidth: 25,
    hitHalfLength: 50,
    hitboxShrinkMax: 0.5,
    hitboxShrinkAngle: 0.35,
    cashHold: 1.6,
    entryFee: 3.01,
    scorePerZ: 0.5,
    payout: [
      [0, 0], [1350, 0], [2050, 0.004], [2350, 0.013], [2750, 0.023],
      [3200, 0.043], [3600, 0.08], [3950, 0.136], [4350, 0.243], [4500, 0.3],
      [4800, 0.335], [4976, 0.395], [5059, 0.555], [5360, 0.964],
      [5582, 1.289], [8497, 1.289], [8933, 1.64], [9192, 1.85],
      [9436, 2.05], [9757, 2.31], [10000, 2.5], [12000, 2.5],
    ],
    introMs: 2400,
    barrierPairFreq: 0.4,
  },
  bot: {
    rt: { family: "gaussian", mean: 235, sd: 42, tau: 80, floor: 150 },
    gateRtToThreat: false,
    riskPerMin: 0,
    plan: false,
    abortsPerMin: 0,
    noise: {
      model: "iid",
      iidAmpX: 2.4,
      iidAmpY: 2.2,
      pinkAmp: 2.6,
      tremorHzMin: 8,
      tremorHzVar: 4,
      tremorAmpMin: 0.55,
      tremorAmpVar: 0.5,
      driftX: 2.2,
      driftY: 2.6,
    },
    mirror: { corpusSize: 4, perturbPx: 1.6, scaleVar: 0.08, useRecorded: false },
    perfectUrgency: 0.95,
    cashout: { target: null, targetMax: null, calm: 1.2, duress: null },
    throwRate: 0,
    skill: { errorRate: 0 },
  },
  detector: {
    reaction: {
      minDodges: 6,
      floorMs: 130,
      floorSus: 0.7,
      cvTight: 0.1,
      cvTightSus: 0.5,
      cvLow: 0.17,
      cvLowSus: 0.25,
      meanLowMs: 165,
      meanLowSus: 0.3,
      skewMinN: 20,
      skewFlat: 0.15,
      skewFlatSus: 0.3,
    },
    kinematics: {
      minSwipes: 6,
      jitterNone: 0.3,
      jitterNoneSus: 0.6,
      jitterLow: 0.55,
      jitterLowSus: 0.25,
      peakSdUniform: 0.035,
      peakSdSus: 0.35,
    },
    noise: {
      minSwipes: 8,
      whiteFlag: 2.0,
      whiteWarn: 1.6,
      ampMin: 0.4,
      flagSus: 0.7,
      warnSus: 0.3,
    },
    replay: {
      minSwipes: 8,
      window: 40,
      shapeDupe: 0.015,
      profileDupe: 0.3,
      fracLo: 0.05,
      fracSpan: 0.25,
      flagFrac: 0.25,
    },
    perfection: {
      minDodges: 12,
      minMargins: 8,
      marginCvTight: 0.22,
      marginCvSus: 0.45,
      zeroDeathDodges: 40,
      zeroDeathSus: 0.5,
      dodgesPerDeathHigh: 60,
      dodgesPerDeathSus: 0.3,
    },
    texture: {
      minMoves: 14,
      zeroAbortSus: 0.25,
      noContestSus: 0.3,
      contestMinN: 3,
      allSurvivedSus: 0.45,
      allSurvivedSusHi: 0.6,
      allSurvivedHiN: 5,
      minRunEnds: 6,
      neverBanksSus: 0.15,
      fatalWindowMs: 1400,
    },
    integrity: { untrustedSus: 0.8, minSwipes: 3 },
    weights: {
      reaction: 0.19,
      kinematics: 0.14,
      noise: 0.13,
      replay: 0.19,
      perfection: 0.12,
      texture: 0.13,
      integrity: 0.1,
    },
    escalation: {
      gunAt: 0.68,
      gunFloor: 0.5,
      gunHardAt: 0.85,
      gunHardMult: 0.75,
      hotAt: 0.55,
      hot2Floor: 0.62,
      hot3Floor: 0.72,
    },
    cuts: { human: 0.33, bot: 0.58 },
    swipeMinPoints: 5,
    swipeMinDurMs: 30,
    maxSwipes: 80,
    maxRts: 120,
    maxMargins: 120,
    calibration: {
      basis: "prior",
      corpusSwipes: 0,
      fprTarget: null,
      note: "thresholds are first-principles priors pending a real human swipe corpus",
    },
  },
  econ: {
    entry: 5,
    rake: 0.2,
    nPlayers: 400,
    nGames: 300,
    botWR: 0.7,
    band: 0.06,
    k: 1.15,
  },
};

/* ------------------------------ deep utils ------------------------------ */

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, part: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(part)) {
    return (part === undefined ? base : (part as T)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(base)) {
    const b = (base as Record<string, unknown>)[k];
    const p = (part as Record<string, unknown>)[k];
    if (p === undefined) out[k] = structuredCloneish(b);
    else if (Array.isArray(b)) out[k] = (p as unknown[]).slice();
    else if (isPlainObject(b)) out[k] = deepMerge(b, p);
    else out[k] = p;
  }
  return out as T;
}

function structuredCloneish<T>(v: T): T {
  if (Array.isArray(v)) return v.slice() as T;
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = structuredCloneish((v as Record<string, unknown>)[k]);
    return out as T;
  }
  return v;
}

export function mergeConfig(
  base: BenchConfig,
  part: DeepPartial<BenchConfig>
): BenchConfig {
  return deepMerge(base, part);
}

function deepDiff(base: unknown, cfg: unknown): unknown {
  if (Array.isArray(base) || Array.isArray(cfg)) {
    return JSON.stringify(base) === JSON.stringify(cfg) ? undefined : cfg;
  }
  if (isPlainObject(base) && isPlainObject(cfg)) {
    const out: Record<string, unknown> = {};
    let any = false;
    for (const k of Object.keys(base)) {
      const d = deepDiff(base[k], cfg[k]);
      if (d !== undefined) {
        out[k] = d;
        any = true;
      }
    }
    return any ? out : undefined;
  }
  return base === cfg ? undefined : cfg;
}

export function diffConfig(
  base: BenchConfig,
  cfg: BenchConfig
): DeepPartial<BenchConfig> {
  return (deepDiff(base, cfg) as DeepPartial<BenchConfig>) ?? {};
}

/* --------------------------- URL-safe encoding --------------------------- */

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toB64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i],
      b = bytes[i + 1],
      c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += B64[c & 63];
  }
  return out;
}

function fromB64url(s: string): string {
  const idx = (ch: string) => {
    const i = B64.indexOf(ch);
    if (i < 0) throw new Error("bad b64url");
    return i;
  };
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = idx(s[i]),
      b = idx(s[i + 1]);
    bytes.push((a << 2) | (b >> 4));
    if (i + 2 < s.length) {
      const c = idx(s[i + 2]);
      bytes.push(((b & 15) << 4) | (c >> 2));
      if (i + 3 < s.length) bytes.push(((c & 3) << 6) | idx(s[i + 3]));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Encode a config as its diff from the defaults; "" means default config. */
export function encodeConfig(cfg: BenchConfig): string {
  const d = diffConfig(DEFAULT_CONFIG, cfg);
  if (Object.keys(d).length === 0) return "";
  return toB64url(JSON.stringify(d));
}

/** Decode never throws: anything unparseable yields the default config. */
export function decodeConfig(s: string): BenchConfig {
  if (!s) return mergeConfig(DEFAULT_CONFIG, {});
  try {
    const d = JSON.parse(fromB64url(s));
    return mergeConfig(DEFAULT_CONFIG, d);
  } catch {
    return mergeConfig(DEFAULT_CONFIG, {});
  }
}

/* -------------------------------- presets -------------------------------- */

export interface Preset {
  id: string;
  label: string;
  description: string;
  /** shown in the event log when the preset loads */
  logLine: string;
  config: DeepPartial<BenchConfig>;
}

export const PRESETS: Preset[] = [
  {
    id: "route-planner",
    label: "Route planner (wins)",
    description:
      "The strongest attacker: it reads the whole on-screen field, extrapolates every car and barrier ~6 s forward, and only commits moves that survive even if the humanized reaction-time tail lands late. It budgets the cashout hold timer to use the empty cashout lane as an escape valve, then banks at a score drawn per run between 8,900 and 10,000, where the payout curve climbs to its 2.5x cap. The injected human error is cosmetic: no amount of it turns a planned move into a crash. Raise the throw rate to make it lose on purpose and hold its win rate wherever a reviewer would find it unremarkable.",
    logLine:
      "PRESET: route planner: full-field lookahead, banks at 8,900-10,000; the error layer is for the detector, not the road",
    config: {
      mode: "generative",
      hwInject: true,
      bot: {
        noise: { model: "organic" },
        rt: { family: "exgaussian", mean: 150, sd: 32, tau: 60, floor: 120 },
        gateRtToThreat: true,
        plan: true,
        abortsPerMin: 1.6,
        cashout: { target: 8900, targetMax: 10000, duress: 5582 },
      },
    },
  },
  {
    id: "human-baseline",
    label: "Human baseline",
    description:
      "You drive. Every signal should stay green — this is the negative class every threshold is ultimately calibrated against.",
    logLine: "PRESET: human baseline — play normally; the detector should read HUMAN",
    config: { mode: "human", hwInject: false },
  },
  {
    id: "naive-scripted",
    label: "Naive scripted bot",
    description:
      "Instant reactions, machine-clean synthetic swipes, browser-injected events. The attack most cheaters actually ship.",
    logLine:
      "PRESET: naive scripted bot — expect kinematics + integrity smoking guns within seconds",
    config: { mode: "perfect", hwInject: false },
  },
  {
    id: "replay-farm",
    label: "Replay farm",
    description:
      "Replays a small trace corpus, perturbed per use, delivered through simulated hardware injection the way a phone-farm rig would. Synthesized traces by default; switch to your own recorded swipes with mirror.useRecorded.",
    logLine:
      "PRESET: replay farm — provenance is blind; replay similarity has to carry the verdict",
    config: { mode: "mirror", hwInject: true },
  },
  {
    id: "evasive-generative",
    label: "Evasive generative bot",
    description:
      "Synthesizes a fresh trace per swipe with organic motor noise (pink 1/f + tremor + drift). Beats every swipe-level signal permanently; session texture catches it in minutes.",
    logLine:
      "PRESET: evasive generative bot — watch motor forensics stay green while session texture accumulates",
    config: {
      mode: "generative",
      hwInject: true,
      bot: { noise: { model: "organic" } },
    },
  },
  {
    id: "stealth-camouflage",
    label: "Stealth camouflage bot",
    description:
      "The full kit: organic noise, ex-Gaussian reaction times gated to threat onset, deliberate contested-space entries and aborted gestures, and a human banking discipline. Beats the entire client-side detector, at a measurable cost in crashes.",
    logLine:
      "PRESET: stealth camouflage — the client-side detector should stay HUMAN; the economy layer is what's left",
    config: {
      mode: "generative",
      hwInject: true,
      bot: {
        noise: { model: "organic" },
        rt: { family: "exgaussian", mean: 185, sd: 32, tau: 60, floor: 170 },
        gateRtToThreat: true,
        riskPerMin: 0.7,
        abortsPerMin: 1.6,
        /*
         * Head-to-head, any banked run beats a forfeit, but the reference's
         * car-free cashout lane and capped traffic let the modeled field
         * survive to bank past the ~2050 payout cliff routinely, so the
         * profit-optimal target sits mid-curve: a 2200-8000 sweep against the
         * field peaks at 4000 (win rate 0.59). Banking at all also retires
         * the "never banks a run" texture flag.
         */
        cashout: { target: 4000 },
      },
    },
  },
  {
    id: "phone-farm-scale",
    label: "Phone farm at scale",
    description:
      "One account of a replay farm, plus the server-side view that actually kills farms: win-rate z-score against a skill-matched population and 7-day cadence.",
    logLine:
      "PRESET: phone farm at scale — the interesting panels are the server-side ones below",
    config: {
      mode: "mirror",
      hwInject: true,
      econ: { botWR: 0.7 },
    },
  },
];
