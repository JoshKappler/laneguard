/*
 * Evolution-run worker. Reads a shard file written by the orchestrator, runs
 * every job in it, and writes the results back as JSON. Stateless and
 * deterministic: re-running a shard reproduces it exactly, so a crashed shard
 * can be replayed on its own.
 *
 *   tsx scripts/evo/worker.ts <shardFile> <outFile>
 *
 * Two job kinds, because the two questions cost very different amounts:
 *   human / policy — economy. One run per course, no detector. ~2 ms per run.
 *   detect         — forensics. Full session with the ensemble evaluated every
 *                    frame, which is ~100x more expensive per simulated second.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { playRun } from "../../lib/econ/headtohead.ts";
import { runSession } from "../../lib/bench/session.ts";
import { SIGNAL_NAMES } from "../../lib/detect/detector.ts";
import {
  configFor,
  courseSeed,
  MAX_RUN_S,
  DETECT_SEEDS,
  DETECT_DURATION_S,
  DETECT_ANALYZE_EVERY_N,
  type Job,
  type JobResult,
  type DetectStats,
} from "./jobs.ts";

const [shardFile, outFile] = process.argv.slice(2);
if (!shardFile || !outFile) {
  console.error("usage: worker.ts <shardFile> <outFile>");
  process.exit(2);
}

const { jobs, courses } = JSON.parse(readFileSync(shardFile, "utf8")) as {
  jobs: Job[];
  courses: number;
};

const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

function detectStats(job: Job): DetectStats {
  const finals = [];
  let everBot = 0,
    everSus = 0;
  for (let s = 0; s < DETECT_SEEDS; s++) {
    const cfg = configFor({ ...job, seed: 1000 + s * 7 });
    const r = runSession({
      config: cfg,
      durationS: DETECT_DURATION_S,
      analyzeEveryN: DETECT_ANALYZE_EVERY_N,
    });
    finals.push(r);
    if (r.firstBotS !== null) everBot++;
    if (r.firstSuspectS !== null) everSus++;
  }
  const signalMeans: Record<string, number> = {};
  for (const n of SIGNAL_NAMES) {
    signalMeans[n] = mean(
      finals
        .map((r) => r.final.signals[n])
        .filter((s) => s.ready)
        .map((s) => s.sus)
    );
  }
  const n = finals.length;
  return {
    seeds: DETECT_SEEDS,
    durationS: DETECT_DURATION_S,
    botRate: finals.filter((r) => r.final.verdict === "BOT").length / n,
    flaggedRate:
      finals.filter(
        (r) => r.final.verdict === "BOT" || r.final.verdict === "SUSPECT"
      ).length / n,
    everBotRate: everBot / n,
    everSuspectRate: everSus / n,
    meanOverall: mean(finals.map((r) => r.final.overall)),
    signalMeans,
  };
}

const out: JobResult[] = [];
for (const job of jobs) {
  if (job.kind === "detect") {
    out.push({
      id: job.id,
      groupId: job.groupId,
      kind: job.kind,
      scores: [],
      rawScores: [],
      banked: [],
      crashes: 0,
      timeouts: 0,
      meanRunS: 0,
      params: job.params,
      detect: detectStats(job),
    });
    continue;
  }
  const cfg = configFor(job);
  const scores: number[] = [];
  const rawScores: number[] = [];
  const banked: number[] = [];
  let crashes = 0,
    timeouts = 0,
    sumDur = 0;
  for (let c = 0; c < courses; c++) {
    const r = playRun(cfg, courseSeed(c), MAX_RUN_S);
    // comparator: a forfeited run scores nothing regardless of distance covered
    scores.push(r.banked > 0 ? r.score : 0);
    rawScores.push(r.score);
    banked.push(r.banked);
    if (r.crashed) crashes++;
    if (r.timedOut) timeouts++;
    sumDur += r.durS;
  }
  out.push({
    id: job.id,
    groupId: job.groupId,
    kind: job.kind,
    scores,
    rawScores,
    banked,
    crashes,
    timeouts,
    meanRunS: sumDur / courses,
    params: job.params,
    draw: job.draw,
  });
}

writeFileSync(outFile, JSON.stringify(out));
