/*
 * Shared definitions for the parallel evolution run. Both the orchestrator and
 * the workers import this, so a job spec means exactly the same thing on both
 * sides and a shard can be replayed on its own.
 *
 * A "job" is one player playing every course in the course set. Because the
 * wave sequence depends only on the world seed and elapsed time — never on what
 * the player does — every player faces an identical course, so one run per
 * (player, course) is enough to derive ALL pairwise match outcomes afterwards.
 * That is what turns an O(players²) match problem into O(players) simulation.
 */
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type BenchConfig,
  type DeepPartial,
} from "../../lib/core/config.ts";
import {
  drawHuman,
  humanConfig,
  DEFAULT_FIELD,
  type HumanDraw,
  type FieldParams,
} from "../../lib/econ/headtohead.ts";
import { mulberry32 } from "../../lib/core/rng.ts";

/** deterministic course set: every player in a study drives these seeds */
export const COURSE_BASE = 900_000;
export const courseSeed = (c: number) => COURSE_BASE + c * 31;

/** cap on a single run; measured timeout rate is 0% at 180 s */
export const MAX_RUN_S = 180;

export type JobKind = "human" | "policy" | "detect";

export interface Job {
  /** stable identifier, also the key results are merged on */
  id: string;
  /**
   * Identity of the thing being measured, shared by every repetition of it. A
   * single policy played over one course set carries several points of win-rate
   * sampling noise, which is enough to reorder a grid; reps under independent
   * bot seeds are pooled on this key to measure the policy rather than the draw.
   */
  groupId?: string;
  kind: JobKind;
  /** player-identity RNG seed (decorrelated from the course seed) */
  seed: number;
  /** config override applied to DEFAULT_CONFIG; empty for humans */
  over: DeepPartial<BenchConfig>;
  /** for humans: the latent draw, carried so the report can bin by skill */
  draw?: HumanDraw;
  /** for policies: the swept parameters, for the frontier table */
  params?: Record<string, number | string | null>;
}

export interface DetectStats {
  seeds: number;
  durationS: number;
  /** verdict at end of session */
  botRate: number;
  flaggedRate: number;
  /** reached the tier at any point — the enforcement-relevant number */
  everBotRate: number;
  everSuspectRate: number;
  meanOverall: number;
  signalMeans: Record<string, number>;
}

export interface JobResult {
  id: string;
  groupId?: string;
  kind: JobKind;
  /** comparator score per course: run score if banked, 0 if forfeited */
  scores: number[];
  /** raw score per course, counted whether or not the run was banked */
  rawScores: number[];
  /** money banked per course */
  banked: number[];
  crashes: number;
  timeouts: number;
  meanRunS: number;
  params?: Record<string, number | string | null>;
  draw?: HumanDraw;
  detect?: DetectStats;
}

/** how long a detector session runs, and over how many seeds, per policy */
export const DETECT_SEEDS = 8;
export const DETECT_DURATION_S = 180;
/** verdict sampling cadence for the sweep: 10 Hz, see SessionSpec.analyzeEveryN */
export const DETECT_ANALYZE_EVERY_N = 6;

/**
 * Build a modeled field. Same seed + same FieldParams → same population, so a
 * reported attacker win rate is always reproducible against a named field.
 * `tag` namespaces the job ids when several fields are studied in one run.
 */
export function buildPopulation(
  n: number,
  field: FieldParams = DEFAULT_FIELD,
  popSeed = 4242,
  tag = "h"
): Job[] {
  const r = mulberry32(popSeed);
  const jobs: Job[] = [];
  for (let i = 0; i < n; i++) {
    const draw = drawHuman(r, field);
    jobs.push({
      id: `${tag}${i}`,
      kind: "human",
      seed: 700_000 + i * 17,
      over: {},
      draw,
    });
  }
  return jobs;
}

/** Reconstruct a job's full config. Must be identical in parent and worker. */
export function configFor(job: Job): BenchConfig {
  if (job.kind === "human") {
    return humanConfig(DEFAULT_CONFIG, job.draw!, job.seed);
  }
  return mergeConfig(DEFAULT_CONFIG, { ...job.over, seed: job.seed });
}
