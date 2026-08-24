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
  /** probability a wave puts traffic in the cashout lane */
  cashTrafficFreq: number;
  spawnZ: number;
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
  multCap: number;
  multRate: number;
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
  /**
   * Cashout strategy — the greed dial. Once the run's score reaches `target`,
   * the player stops seeking value and steers to the cashout lane to bank,
   * dodging only if directly threatened. `target: null` is the legacy behavior
   * (never bank on purpose; a run ends only by crashing or wandering into the
   * cashout lane). This is the lever the evolution run sweeps: a low target
   * banks small-but-sure, a high target risks the run for a bigger multiplier.
   * `calm` is the time-to-impact (s) the current lane must be clear of before a
   * bank-step is taken, so banking never overrides an owed dodge.
   */
  cashout: {
    target: number | null;
    calm: number;
  };
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
    baseSpeed: 15,
    maxSpeed: 34,
    speedRamp: 0.42,
    waveGapStart: 34,
    waveGapMin: 19,
    waveGapRamp: 0.3,
    densityStart: 0.55,
    densityMax: 0.9,
    densityRamp: 0.007,
    barrierFreq: 0.34,
    cashTrafficFreq: 0.25,
    spawnZ: 55,
    threatWindow: 1.15,
    swipeThreshold: 28,
    maxSteer: 0.6,
    steerRate: 22,
    hitHalfWidth: 25,
    hitHalfLength: 50,
    hitboxShrinkMax: 0.5,
    hitboxShrinkAngle: 0.35,
    cashHold: 1.6,
    entryFee: 1.0,
    multCap: 2.5,
    multRate: 0.004,
  },
  bot: {
    rt: { family: "gaussian", mean: 235, sd: 42, tau: 80, floor: 150 },
    gateRtToThreat: false,
    riskPerMin: 0,
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
    cashout: { target: null, calm: 1.2 },
    skill: { errorRate: 0 },
  },
  detector: {
    reaction: {
      minDodges: 6,
      floorMs: 130,
      floorSus: 0.55,
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
      noContestSus: 0.45,
      contestMinN: 3,
      allSurvivedSus: 0.45,
      allSurvivedSusHi: 0.6,
      allSurvivedHiN: 5,
      minRunEnds: 3,
      neverBanksSus: 0.3,
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
      "Replays a corpus of recorded human traces, perturbed per use, delivered through simulated hardware injection the way a phone-farm rig would.",
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
      "The full kit: organic noise, ex-Gaussian reaction times gated to threat onset, deliberate contested-space entries and aborted gestures, and a human banking discipline. Beats the entire client-side detector — at a measurable cost in crashes, which is the point.",
    logLine:
      "PRESET: stealth camouflage — the client-side detector should stay HUMAN; the economy layer is what's left",
    config: {
      mode: "generative",
      hwInject: true,
      bot: {
        noise: { model: "organic" },
        rt: { family: "exgaussian", mean: 210, sd: 40, tau: 90, floor: 170 },
        gateRtToThreat: true,
        riskPerMin: 0.7,
        abortsPerMin: 1.6,
        /*
         * Banking at 30 comes out of the head-to-head sweep (`pnpm evo`,
         * 1.2M runs): it is the greed level whose win rate holds up against
         * every modeled field — 54.4-57.9%, versus bank@12 which scores higher
         * against a weak field but collapses to 49.8% against a strong one.
         * It also makes the attacker QUIETER, not louder: banking retires the
         * "never banks a run" texture flag, so SUSPECT touches drop from 12.5%
         * of seeds to 5% (40 seeds) while BOT stays at 0%. A bot that cashes out like a
         * human is both harder to see and better at winning, which is the
         * uncomfortable part.
         */
        cashout: { target: 30 },
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
