/*
 * Headless batch runner. Runs every attacker profile across many seeds without
 * rendering, aggregates detection outcomes, and regenerates the numbers the
 * README and writeup quote — so those numbers can be re-derived rather than
 * rot. Deterministic: same seeds in, same table out.
 *
 *   pnpm batch            # print tables, write results/summary.json
 *   pnpm batch --seeds 40 # more seeds per profile
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  PRESETS,
  type BenchConfig,
  type DeepPartial,
} from "../lib/core/config.ts";
import { runSession } from "../lib/bench/session.ts";
import { simulatePopulation } from "../lib/econ/population.ts";
import { breakEven, evPerGame } from "../lib/econ/economy.ts";
import { simulateWeek, cadenceMetrics } from "../lib/econ/cadence.ts";

const argSeeds = (() => {
  const i = process.argv.indexOf("--seeds");
  return i >= 0 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 12) : 12;
})();
const DURATION_S = 180;

interface ProfileAgg {
  id: string;
  label: string;
  seeds: number;
  durationS: number;
  botRate: number;
  flaggedRate: number; // SUSPECT or BOT
  meanOverall: number;
  medianFirstFlagS: number | null;
  medianFirstBotS: number | null;
  meanJitter: number | null;
  meanWhite: number | null;
  meanRtMin: number | null;
  signalMeans: Record<string, number>;
  cashoutRate: number;
  deathsPerMin: number;
}

const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = (a: (number | null)[]) => {
  const v = a.filter((x): x is number => x !== null).sort((p, q) => p - q);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function runProfile(
  id: string,
  label: string,
  over: DeepPartial<BenchConfig>,
  durationS: number
): ProfileAgg {
  const finals = [];
  const firstFlags: (number | null)[] = [];
  const firstBots: (number | null)[] = [];
  for (let s = 0; s < argSeeds; s++) {
    const seed = 1000 + s * 7;
    const cfg = mergeConfig(DEFAULT_CONFIG, { ...over, seed });
    const r = runSession({ config: cfg, durationS });
    finals.push(r);
    firstFlags.push(r.firstFlagS);
    firstBots.push(r.firstBotS);
  }
  const sigNames = Object.keys(finals[0].final.signals);
  const signalMeans: Record<string, number> = {};
  for (const n of sigNames)
    signalMeans[n] = mean(
      finals.map((r) => r.final.signals[n]).filter((s) => s.ready).map((s) => s.sus)
    );
  const botCount = finals.filter((r) => r.final.verdict === "BOT").length;
  const flagCount = finals.filter(
    (r) => r.final.verdict === "BOT" || r.final.verdict === "SUSPECT"
  ).length;
  return {
    id,
    label,
    seeds: argSeeds,
    durationS,
    botRate: botCount / finals.length,
    flaggedRate: flagCount / finals.length,
    meanOverall: mean(finals.map((r) => r.final.overall)),
    medianFirstFlagS: median(firstFlags),
    medianFirstBotS: median(firstBots),
    meanJitter: mean(
      finals.map((r) => r.final.featureStats.meanJitter).filter((x): x is number => x !== null)
    ),
    meanWhite: mean(
      finals.map((r) => r.final.featureStats.meanWhite).filter((x): x is number => x !== null)
    ),
    meanRtMin: mean(
      finals.map((r) => r.final.featureStats.rtMin).filter((x): x is number => x !== null)
    ),
    signalMeans,
    cashoutRate: mean(
      finals.map((r) => (r.runs.length ? r.runs.filter((x) => x.endKind === "cashout").length / r.runs.length : 0))
    ),
    deathsPerMin: mean(finals.map((r) => (r.final.counters.deaths / durationS) * 60)),
  };
}

const fmt = (x: number | null, d = 2) =>
  x === null || Number.isNaN(x) ? "—" : x.toFixed(d);

// ---- attacker profiles ----
const profiles = PRESETS.filter((p) => p.id !== "phone-farm-scale").map((p) =>
  runProfile(p.id, p.label, p.config, DURATION_S)
);

console.log(`\n# Attacker detection — ${argSeeds} seeds × ${DURATION_S}s each\n`);
console.log(
  "| profile | verdict rate | mean conf | median t→flag | median t→BOT | jitter | Δ⁴/Δ² | RT min |"
);
console.log("|---|---|---|---|---|---|---|---|");
for (const p of profiles) {
  const verdict =
    p.botRate === 1 ? "BOT 100%" : p.botRate > 0 ? `BOT ${(p.botRate * 100).toFixed(0)}%` : p.flaggedRate > 0 ? `SUSPECT ${(p.flaggedRate * 100).toFixed(0)}%` : "HUMAN";
  console.log(
    `| ${p.label} | ${verdict} | ${fmt(p.meanOverall)} | ${fmt(p.medianFirstFlagS, 0)}s | ${p.medianFirstBotS === null ? "never" : fmt(p.medianFirstBotS, 0) + "s"} | ${fmt(p.meanJitter)}px | ${fmt(p.meanWhite)} | ${fmt(p.meanRtMin, 0)}ms |`
  );
}

// ---- economy sweep ----
console.log(`\n# Economy sweep ($${DEFAULT_CONFIG.econ.entry} entry, ${(DEFAULT_CONFIG.econ.rake * 100).toFixed(0)}% rake)\n`);
const be = breakEven(DEFAULT_CONFIG.econ.entry, DEFAULT_CONFIG.econ.rake);
console.log(`break-even win rate: ${(be * 100).toFixed(1)}%\n`);
console.log("| bot win rate | EV/game | z-score | percentile |");
console.log("|---|---|---|---|");
const econRows = [];
for (const wr of [0.55, 0.6, 0.625, 0.65, 0.7, 0.8]) {
  const s = simulatePopulation({
    nPlayers: DEFAULT_CONFIG.econ.nPlayers,
    nGames: DEFAULT_CONFIG.econ.nGames,
    botWR: wr,
  });
  const ev = evPerGame(wr, DEFAULT_CONFIG.econ.entry, DEFAULT_CONFIG.econ.rake);
  econRows.push({ wr, ev, z: s.z, pctile: s.pctile, mean: s.mean, sd: s.sd });
  console.log(
    `| ${(wr * 100).toFixed(1)}% | ${ev >= 0 ? "+" : ""}$${ev.toFixed(2)} | ${s.z.toFixed(1)}σ | ${s.pctile.toFixed(2)} |`
  );
}

// ---- cadence ----
const week = simulateWeek();
const cad = {
  human: cadenceMetrics(week.human),
  farm: cadenceMetrics(week.farm),
  sched: cadenceMetrics(week.sched),
};
console.log(`\n# Session cadence (7-day sim)\n`);
console.log("| profile | games/wk | in-session gap cv | active hours | longest idle |");
console.log("|---|---|---|---|---|");
for (const [k, label] of [["human", "human"], ["farm", "naive farm"], ["sched", "scheduled bot"]] as const) {
  const m = cad[k];
  console.log(
    `| ${label} | ${m.n} | ${m.cv.toFixed(2)} | ${m.activeHours}/24 | ${m.longestIdle.toFixed(1)} h |`
  );
}

// ---- emit ----
const outDir = path.resolve(import.meta.dirname, "..", "results");
mkdirSync(outDir, { recursive: true });
const summary = {
  generatedBy: "pnpm batch",
  seeds: argSeeds,
  durationS: DURATION_S,
  profiles,
  economy: { breakEven: be, entry: DEFAULT_CONFIG.econ.entry, rake: DEFAULT_CONFIG.econ.rake, rows: econRows },
  cadence: {
    human: { n: cad.human.n, cv: cad.human.cv, activeHours: cad.human.activeHours, longestIdle: cad.human.longestIdle },
    farm: { n: cad.farm.n, cv: cad.farm.cv, activeHours: cad.farm.activeHours, longestIdle: cad.farm.longestIdle },
    sched: { n: cad.sched.n, cv: cad.sched.cv, activeHours: cad.sched.activeHours, longestIdle: cad.sched.longestIdle },
  },
};
writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nwrote results/summary.json`);
