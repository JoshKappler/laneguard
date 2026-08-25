/*
 * Head-to-head match simulation. population.ts ASSIGNS the bot a win rate;
 * this module derives it from actual play: two players drive the SAME seeded
 * course (spawns never depend on player actions, so `courseSeed` alone fixes
 * the course) and whoever banks more wins the pot. No detector runs here.
 */
import type { BenchConfig } from "@/lib/core/config";
import { mulberry32, splitSeed, gauss, type Rand } from "@/lib/core/rng";
import { Engine } from "@/lib/sim/engine";
import { Bot } from "@/lib/attack/bot";

export const FRAME_MS = 1000 / 60;

export interface RunResult {
  /** money banked; 0 if the run was forfeited by crashing */
  banked: number;
  score: number;
  crashed: boolean;
  durS: number;
  /** hit the maxRunS cap without banking or crashing */
  timedOut: boolean;
}

/** One run to its natural end (crash or cashout) on a given course. */
export function playRun(
  cfg: BenchConfig,
  courseSeed: number,
  maxRunS = 180
): RunResult {
  const engine = new Engine(cfg.game, mulberry32(splitSeed(courseSeed, "world")));
  const bot = new Bot(
    engine,
    cfg.bot,
    cfg.mode === "human" ? "generative" : cfg.mode,
    cfg.hwInject,
    // per-course bot seed: with one seed for every course, each run redrew the
    // identical first sample, which pinned the whole field to one bank target
    splitSeed(cfg.seed + courseSeed, "bot")
  );
  engine.autoRestart = false;
  engine.resetRun();

  const frames = Math.round((maxRunS * 1000) / FRAME_MS);
  for (let f = 0; f < frames; f++) {
    engine.step(FRAME_MS);
    bot.tick(engine.now);
    const ph = engine.state.phase;
    if (ph === "dead" || ph === "cashed") {
      return {
        banked: ph === "cashed" ? engine.state.banked : 0,
        score: engine.state.score,
        crashed: ph === "dead",
        durS: engine.now / 1000,
        timedOut: false,
      };
    }
  }
  return {
    banked: 0,
    score: engine.state.score,
    crashed: false,
    durS: maxRunS,
    timedOut: true,
  };
}

/* ------------------------- surrogate human players ------------------------- */

/** A modeled human, NOT a recorded one: the attacker's planner degraded on
 *  reaction time, execution error and greed. Labeled as a model when reported. */
export interface HumanDraw {
  z: number;
  rtMean: number;
  rtSd: number;
  errorRate: number;
  cashTarget: number;
}

/** Field competence; stated with every profitability claim. greedCenter/Sd are
 *  cashout-score strategy on the payout scale (break-even ~5430, flat tier 5582). */
export interface FieldParams {
  rtCenter: number;
  rtPerZ: number;
  errCenter: number;
  greedCenter: number;
  greedSd: number;
}

export const DEFAULT_FIELD: FieldParams = {
  rtCenter: 420,
  rtPerZ: 55,
  errCenter: 0.14,
  greedCenter: 3000,
  greedSd: 900,
};

export function drawHuman(rand: Rand, f: FieldParams = DEFAULT_FIELD): HumanDraw {
  const z = gauss(rand, 0, 1);
  return {
    z,
    // better players react faster, more consistently, and fumble less
    rtMean: Math.max(180, f.rtCenter - f.rtPerZ * z),
    rtSd: Math.max(25, 95 - 12 * z),
    errorRate: Math.max(0, Math.min(0.5, f.errCenter - 0.045 * z)),
    // greed is a strategy choice, drawn independently of ability
    cashTarget: Math.max(2200, Math.round(gauss(rand, f.greedCenter, f.greedSd))),
  };
}

export function humanConfig(
  base: BenchConfig,
  d: HumanDraw,
  seed: number
): BenchConfig {
  return {
    ...base,
    seed,
    mode: "generative",
    hwInject: false,
    bot: {
      ...base.bot,
      rt: {
        ...base.bot.rt,
        family: "exgaussian",
        mean: d.rtMean,
        sd: d.rtSd,
        tau: 90,
        floor: 170,
      },
      gateRtToThreat: true,
      noise: { ...base.bot.noise, model: "organic" },
      skill: { ...base.bot.skill, errorRate: d.errorRate },
      cashout: { ...base.bot.cashout, target: d.cashTarget },
    },
  };
}

/* ------------------------------- matches ------------------------------- */

export type MatchOutcome = "a" | "b" | "tie";

/** Banked beats forfeited; two banks compare on score (payout saturates and
 *  would manufacture ties); two forfeits tie at nothing. */
export function scoreOf(r: RunResult): number {
  return r.banked > 0 ? r.score : 0;
}

export function decide(a: RunResult, b: RunResult): MatchOutcome {
  const sa = scoreOf(a),
    sb = scoreOf(b);
  if (sa > sb) return "a";
  if (sb > sa) return "b";
  return "tie";
}

export interface Record_ {
  wins: number;
  losses: number;
  ties: number;
}

/** No-bank match resolution; the rule moves break-even, so every reported
 *  number states its rule. split = raked pot split (default), refund, loss. */
export type TieRule = "split" | "refund" | "loss";

export function winNetH2H(entry: number, rake: number): number {
  return 2 * entry * (1 - rake) - entry;
}

export function tieNet(entry: number, rake: number, rule: TieRule): number {
  if (rule === "refund") return 0;
  if (rule === "loss") return -entry;
  return entry * (1 - rake) - entry; // split the raked pot
}

/** Leaderboard-style win rate: a tie counts as half a win. */
export function winRate(r: Record_): number {
  const n = r.wins + r.losses + r.ties;
  return n ? (r.wins + 0.5 * r.ties) / n : NaN;
}

/** Win share among matches that actually resolved. */
export function decidedWinRate(r: Record_): number {
  const d = r.wins + r.losses;
  return d ? r.wins / d : NaN;
}

export function tieRate(r: Record_): number {
  const n = r.wins + r.losses + r.ties;
  return n ? r.ties / n : NaN;
}

export function evPerGameH2H(
  r: Record_,
  entry: number,
  rake: number,
  rule: TieRule = "split"
): number {
  const n = r.wins + r.losses + r.ties;
  if (!n) return NaN;
  return (
    (r.wins * winNetH2H(entry, rake) +
      r.losses * -entry +
      r.ties * tieNet(entry, rake, rule)) /
    n
  );
}

/** Decided-game win share needed to break even at a given tie rate. */
export function breakEvenDecided(
  entry: number,
  rake: number,
  tieFrac: number,
  rule: TieRule = "split"
): number {
  const win = winNetH2H(entry, rake);
  const t = tieNet(entry, rake, rule);
  const decided = 1 - tieFrac;
  if (decided <= 0) return NaN;
  // decided·(p·win + (1−p)·(−entry)) + tieFrac·t = 0
  const need = (-tieFrac * t) / decided + entry;
  return need / (win + entry);
}

/** Legacy no-tie break-even, kept for the arithmetic panel. */
export function breakEvenH2H(entry: number, rake: number): number {
  return entry / (winNetH2H(entry, rake) + entry);
}

/* --------------------- pairwise records from cached play --------------------- */

/** Match two players' cached per-course scores; valid only on a shared course
 *  set in the same order (the fair-course property above). */
export function recordVs(a: number[], b: number[]): Record_ {
  let wins = 0,
    losses = 0,
    ties = 0;
  const n = Math.min(a.length, b.length);
  for (let c = 0; c < n; c++) {
    if (a[c] > b[c]) wins++;
    else if (b[c] > a[c]) losses++;
    else ties++;
  }
  return { wins, losses, ties };
}

export function addRecord(x: Record_, y: Record_): Record_ {
  return {
    wins: x.wins + y.wins,
    losses: x.losses + y.losses,
    ties: x.ties + y.ties,
  };
}

const EMPTY: Record_ = { wins: 0, losses: 0, ties: 0 };

/** All-play-all on shared courses, deliberately NOT skill-banded: banding
 *  compresses the field's spread and would inflate the bot's z-score. */
export function fieldRecords(scores: number[][]): Record_[] {
  const n = scores.length;
  const out: Record_[] = Array.from({ length: n }, () => ({ ...EMPTY }));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = recordVs(scores[i], scores[j]);
      out[i] = addRecord(out[i], r);
      out[j] = addRecord(out[j], {
        wins: r.losses,
        losses: r.wins,
        ties: r.ties,
      });
    }
  }
  return out;
}

/** One challenger's record against every member of a field. */
export function recordVsField(
  challenger: number[],
  field: number[][]
): Record_ {
  return field.reduce(
    (acc, f) => addRecord(acc, recordVs(challenger, f)),
    { ...EMPTY }
  );
}

export interface Spread {
  mean: number;
  sd: number;
  n: number;
}

export function spread(xs: number[]): Spread {
  const v = xs.filter((x) => Number.isFinite(x));
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(
    v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length
  );
  return { mean, sd, n: v.length };
}

/** z-score of a win rate against the population's own win-rate distribution. */
export function zAgainst(wr: number, pop: Spread): number {
  return pop.sd > 0 ? (wr - pop.mean) / pop.sd : NaN;
}
