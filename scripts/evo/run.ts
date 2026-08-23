/*
 * Parallel evolution run. Derives the attacker's win rate from actual
 * head-to-head play instead of assuming it, and reports where — if anywhere —
 * a policy is simultaneously profitable, statistically unremarkable, and
 * invisible to the client-side detector.
 *
 *   pnpm evo                              # default study
 *   pnpm evo --courses 300 --pop 240      # bigger
 *   pnpm evo --workers 8                  # fewer processes
 *   pnpm evo --no-detect                  # economy only (seconds instead of a minute)
 *
 * Three axes, because collapsing any of them would smuggle in the answer:
 *
 *   FIELD    how competent the opposition is. An attacker's edge is bounded by
 *            how badly the field plays, so this is swept, not assumed.
 *   POLICY   the attacker's greed (bank-at score), apparent reaction speed, and
 *            whether it wears the stealth kit.
 *   TIE RULE how the operator settles a match where neither player banked.
 *            On this course difficulty that is a large share of matches, so the
 *            rule moves break-even materially.
 *
 * Every player drives the same deterministic course set, so one run per
 * (player, course) yields all pairwise match outcomes — and because a policy's
 * runs do not depend on the field, the whole field x policy matrix is priced at
 * one dispatch of each.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_CONFIG,
  type DeepPartial,
  type BenchConfig,
} from "../../lib/core/config.ts";
import {
  fieldRecords,
  recordVsField,
  addRecord,
  winRate,
  decidedWinRate,
  tieRate,
  evPerGameH2H,
  breakEvenDecided,
  spread,
  zAgainst,
  DEFAULT_FIELD,
  type FieldParams,
  type Record_,
  type TieRule,
  type Spread,
} from "../../lib/econ/headtohead.ts";
import { buildPopulation, type Job, type JobResult } from "./jobs.ts";

const repo = path.resolve(import.meta.dirname, "..", "..");
const outDir = path.join(repo, "results", "evo");
const tmpDir = path.join(outDir, "shards");

const argNum = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Math.max(1, parseInt(process.argv[i + 1], 10) || dflt) : dflt;
};
const hasFlag = (f: string) => process.argv.includes(f);

const COURSES = argNum("--courses", 200);
const POP = argNum("--pop", 160);
const WORKERS = argNum("--workers", Math.max(2, Math.min(14, os.cpus().length - 2)));
const DO_DETECT = !hasFlag("--no-detect");
/** independent bot seeds per policy, pooled to beat down win-rate noise */
const REPS = argNum("--reps", 4);
const ENTRY = DEFAULT_CONFIG.econ.entry;
const RAKE = DEFAULT_CONFIG.econ.rake;
const TIE_RULES: TieRule[] = ["refund", "split", "loss"];
/** the rule the headline numbers use: the house rakes every seated game */
const PRIMARY_TIE: TieRule = "split";

/*
 * What the operator compares to decide a match. Public material does not settle
 * this, and it swings the economics hard enough that picking one silently would
 * be choosing the answer, so both are measured:
 *
 *   banked — a forfeited run is worth nothing. Cashing out IS the score, so two
 *            players who both crash tie at zero, and on this difficulty that is
 *            most matches.
 *   score  — the run's score always stands and cashing out only locks the money
 *            multiplier. Ties become vanishingly rare and break-even returns to
 *            the clean 62.5% the rake arithmetic implies.
 */
type Comparator = "banked" | "score";
const COMPARATORS: Comparator[] = ["banked", "score"];
const PRIMARY_CMP: Comparator = "banked";

const seriesOf = (r: JobResult, c: Comparator) =>
  c === "banked" ? r.scores : r.rawScores;

/* -------------------------------- fields -------------------------------- */

interface FieldDef {
  id: string;
  label: string;
  note: string;
  params: FieldParams;
}

const FIELDS: FieldDef[] = [
  {
    id: "casual",
    label: "casual",
    note: "slow, error-prone, and too greedy to bank — a launch-week player base",
    params: { rtCenter: 460, rtPerZ: 55, errCenter: 0.18, greedCenter: 75, greedSd: 22 },
  },
  {
    id: "typical",
    label: "typical",
    note: "the study default",
    params: DEFAULT_FIELD,
  },
  {
    id: "learned",
    label: "learned",
    note: "has worked out that banking early beats pushing",
    params: { rtCenter: 380, rtPerZ: 50, errCenter: 0.11, greedCenter: 32, greedSd: 14 },
  },
  {
    id: "sharp",
    label: "sharp",
    note: "fast, consistent, and banking near the strategy optimum",
    params: { rtCenter: 340, rtPerZ: 45, errCenter: 0.07, greedCenter: 24, greedSd: 10 },
  },
  {
    /*
     * Banking early is only correct when a forfeited run scores nothing. Under a
     * leaderboard rule the score stands either way, so the right play is to
     * never bank and grind the score up until you crash. Without this field the
     * "score" comparator would only ever be measured against opposition using
     * the wrong strategy for it, which flatters the attacker.
     */
    id: "grinder",
    label: "grinder",
    note: "fast and consistent, and never banks — the correct play under a leaderboard rule",
    params: { rtCenter: 340, rtPerZ: 45, errCenter: 0.07, greedCenter: 400, greedSd: 40 },
  },
];

/* ------------------------------ policy grid ------------------------------ */

const CASH_TARGETS: (number | null)[] = [null, 12, 18, 24, 30, 40, 55, 75, 110];
const RT_MEANS = [180, 210, 235, 280, 340];

interface Shape {
  id: string;
  label: string;
  over: DeepPartial<BenchConfig>;
  /** reaction time is meaningless for the scripted bot: it never waits */
  sweepRt: boolean;
}

const SHAPES: Shape[] = [
  {
    id: "scripted",
    label: "scripted (capability ceiling)",
    over: { mode: "perfect" },
    sweepRt: false,
  },
  { id: "loud", label: "generative, no camouflage", over: { mode: "generative" }, sweepRt: true },
  {
    id: "stealth",
    label: "generative + full stealth kit",
    over: {
      mode: "generative",
      bot: {
        noise: { model: "organic" as const },
        rt: { family: "exgaussian" as const, tau: 90, floor: 170 },
        gateRtToThreat: true,
        riskPerMin: 0.7,
        abortsPerMin: 1.6,
      },
    },
    sweepRt: true,
  },
];

function policyJobs(): Job[] {
  const jobs: Job[] = [];
  let i = 0;
  for (const sh of SHAPES) {
    const rts = sh.sweepRt ? RT_MEANS : [0];
    for (const rtMean of rts) {
      for (const cashTarget of CASH_TARGETS) {
        const botOver: Record<string, unknown> = { ...(sh.over.bot ?? {}) };
        if (sh.sweepRt)
          botOver.rt = { ...((sh.over.bot?.rt as object) ?? {}), mean: rtMean };
        botOver.cashout = { target: cashTarget };
        const gid = `p${i++}`;
        for (let rep = 0; rep < REPS; rep++)
          jobs.push({
            id: `${gid}r${rep}`,
            groupId: gid,
            kind: "policy",
            seed: 300_000 + i * 101 + rep * 7919,
            over: {
              ...sh.over,
              hwInject: true,
              bot: botOver as DeepPartial<BenchConfig>["bot"],
            },
            params: { shape: sh.id, rtMean, cashTarget },
          });
      }
    }
  }
  return jobs;
}

/* ----------------------------- worker pool ----------------------------- */

function shard<T>(items: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => []);
  items.forEach((it, i) => out[i % n].push(it)); // round-robin evens out cost
  return out.filter((s) => s.length);
}

function runWorker(shardFile: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        path.join(repo, "scripts", "evo", "worker.ts"),
        shardFile,
        outFile,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`worker exited ${code}\n${err.slice(0, 4000)}`))
    );
  });
}

async function dispatch(
  jobs: Job[],
  courses: number,
  tag: string
): Promise<JobResult[]> {
  mkdirSync(tmpDir, { recursive: true });
  const shards = shard(jobs, WORKERS);
  const t0 = Date.now();
  process.stdout.write(`  ${tag}: ${jobs.length} jobs / ${shards.length} workers … `);
  const files = shards.map((s, i) => {
    const inF = path.join(tmpDir, `${tag}-in-${i}.json`);
    const outF = path.join(tmpDir, `${tag}-out-${i}.json`);
    writeFileSync(inF, JSON.stringify({ jobs: s, courses }));
    return { inF, outF };
  });
  await Promise.all(files.map((f) => runWorker(f.inF, f.outF)));
  const results = files.flatMap(
    (f) => JSON.parse(readFileSync(f.outF, "utf8")) as JobResult[]
  );
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return results;
}

/* -------------------------------- study -------------------------------- */

interface FieldStats {
  id: string;
  label: string;
  note: string;
  n: number;
  winRate: Spread;
  tieRate: number;
  bankRate: number;
  /** the greed level that actually performed best inside this field */
  bestGreed: number | null;
  series: Record<Comparator, number[][]>;
}

interface Row {
  id: string;
  field: string;
  cmp: Comparator;
  shape: string;
  rtMean: number;
  cashTarget: number | null;
  wr: number;
  decided: number;
  ties: number;
  z: number;
  bankRate: number;
  ev: Record<TieRule, number>;
  breakEven: Record<TieRule, number>;
  detect?: JobResult["detect"];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function fieldStats(def: FieldDef, res: JobResult[]): FieldStats {
  const series = {
    banked: res.map((r) => r.scores),
    score: res.map((r) => r.rawScores),
  } as Record<Comparator, number[][]>;
  // the field's own win-rate spread is reported under the primary comparator
  const recs = fieldRecords(series[PRIMARY_CMP]);
  const wrs = recs.map(winRate);
  // which greed level did best inside this field — an emergent optimum, not a
  // parameter: bin players by their bank-at target and compare win rates
  const bins = new Map<number, number[]>();
  res.forEach((r, i) => {
    const g = Math.round((r.draw!.cashTarget ?? 0) / 10) * 10;
    if (!bins.has(g)) bins.set(g, []);
    bins.get(g)!.push(wrs[i]);
  });
  let bestGreed: number | null = null,
    bestWr = -1;
  for (const [g, v] of bins) {
    if (v.length < 5) continue; // don't crown a bin of one
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    if (m > bestWr) {
      bestWr = m;
      bestGreed = g;
    }
  }
  return {
    id: def.id,
    label: def.label,
    note: def.note,
    n: res.length,
    winRate: spread(wrs),
    tieRate: spread(recs.map(tieRate)).mean,
    bankRate: spread(
      res.map((r) => r.banked.filter((b) => b > 0).length / r.banked.length)
    ).mean,
    bestGreed,
    series,
  };
}

function rowFor(f: FieldStats, reps: JobResult[], cmp: Comparator): Row {
  const r = reps[0];
  // pool every repetition's matches into one record for this policy
  const rec: Record_ = reps
    .map((x) => recordVsField(seriesOf(x, cmp), f.series[cmp]))
    .reduce(addRecord, { wins: 0, losses: 0, ties: 0 });
  const wr = winRate(rec);
  const tie = tieRate(rec);
  const ev = {} as Record<TieRule, number>;
  const be = {} as Record<TieRule, number>;
  for (const rule of TIE_RULES) {
    ev[rule] = evPerGameH2H(rec, ENTRY, RAKE, rule);
    be[rule] = breakEvenDecided(ENTRY, RAKE, tie, rule);
  }
  return {
    id: r.groupId ?? r.id,
    field: f.id,
    cmp,
    shape: String(r.params!.shape),
    rtMean: Number(r.params!.rtMean),
    cashTarget: r.params!.cashTarget as number | null,
    wr,
    decided: decidedWinRate(rec),
    ties: tie,
    z: zAgainst(wr, spread(fieldRecords(f.series[cmp]).map(winRate))),
    bankRate:
      reps.reduce((a, x) => a + x.banked.filter((b) => b > 0).length, 0) /
      reps.reduce((a, x) => a + x.banked.length, 0),
    ev,
    breakEven: be,
  };
}

async function main() {
  console.log(
    `\nLaneGuard evolution run\n` +
      `  ${FIELDS.length} fields x ${POP} modeled players, ${COURSES} shared courses, ${WORKERS} workers\n` +
      `  $${ENTRY} entry, ${(RAKE * 100).toFixed(0)}% rake, primary tie rule: ${PRIMARY_TIE}`
  );

  const polJobs = policyJobs();
  const totalPlayers = FIELDS.length * POP + polJobs.length;
  console.log(
    `  ${totalPlayers.toLocaleString()} players x ${COURSES} courses = ${(totalPlayers * COURSES).toLocaleString()} runs\n`
  );

  // one dispatch per field, plus one for all policies (policy play is
  // field-independent, so the full matrix costs no extra simulation)
  const fields: FieldStats[] = [];
  for (const def of FIELDS) {
    const jobs = buildPopulation(POP, def.params, 4242, `${def.id}-`);
    fields.push(fieldStats(def, await dispatch(jobs, COURSES, def.id)));
  }
  const polRes = await dispatch(polJobs, COURSES, "pol");

  let detById = new Map<string, JobResult["detect"]>();
  if (DO_DETECT) {
    const detRes = await dispatch(
      polJobs
        .filter((j) => j.id.endsWith("r0"))
        .map((j) => ({ ...j, id: j.groupId!, kind: "detect" as const })),
      0,
      "det"
    );
    detById = new Map(detRes.map((d) => [d.id, d.detect]));
  }

  const groups = new Map<string, JobResult[]>();
  for (const r of polRes) {
    const g = r.groupId ?? r.id;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const rows: Row[] = [];
  for (const f of fields)
    for (const cmp of COMPARATORS)
      for (const [gid, reps] of groups) {
        const row = rowFor(f, reps, cmp);
        row.detect = detById.get(gid);
        rows.push(row);
      }

  report(fields, rows);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "evolution.json"),
    JSON.stringify(
      {
        generatedBy: "pnpm evo",
        courses: COURSES,
        popPerField: POP,
        entry: ENTRY,
        rake: RAKE,
        primaryTieRule: PRIMARY_TIE,
        fields: fields.map((f) => ({
          id: f.id,
          label: f.label,
          note: f.note,
          n: f.n,
          winRate: f.winRate,
          tieRate: f.tieRate,
          bankRate: f.bankRate,
          bestGreed: f.bestGreed,
        })),
        rows: rows.map(({ ...r }) => r),
      },
      null,
      2
    )
  );
  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\nwrote results/evo/evolution.json`);
}

function report(fields: FieldStats[], rows: Row[]) {
  console.log(`\n# Modeled fields (${COURSES} shared courses, all-play-all)\n`);
  console.log(
    "| field | win-rate sd (banked) | win-rate sd (score) | tie rate | bank rate | best greed in-field | note |"
  );
  console.log("|---|---|---|---|---|---|---|");
  for (const f of fields)
    console.log(
      `| ${f.label} | ${(f.winRate.sd * 100).toFixed(2)}pp | ` +
        `${(spread(fieldRecords(f.series.score).map(winRate)).sd * 100).toFixed(2)}pp | ` +
        `${pct(f.tieRate)} | ${pct(f.bankRate)} | ` +
        `bank@${f.bestGreed ?? "—"} | ${f.note} |`
    );

  for (const cmp of COMPARATORS) {
    console.log(
      `
# Best attacker policy per field — "${cmp}" comparator, ${PRIMARY_TIE} ties
`
    );
    console.log(
      "| field | best policy | win rate | decided | tie | need decided | EV/game | z vs field | ever BOT |"
    );
    console.log("|---|---|---|---|---|---|---|---|---|");
    for (const f of fields) {
      const fr = rows.filter((r) => r.field === f.id && r.cmp === cmp);
      const best = fr.reduce((a, b) =>
        a.ev[PRIMARY_TIE] > b.ev[PRIMARY_TIE] ? a : b
      );
      console.log(
        `| ${f.label} | ${best.shape}${best.rtMean ? ` ${best.rtMean}ms` : ""} bank@${best.cashTarget ?? "never"} | ` +
          `${pct(best.wr)} | ${pct(best.decided)} | ${pct(best.ties)} | ${pct(best.breakEven[PRIMARY_TIE])} | ` +
          `${best.ev[PRIMARY_TIE] >= 0 ? "+" : ""}$${best.ev[PRIMARY_TIE].toFixed(3)} | ${best.z.toFixed(1)}σ | ` +
          `${best.detect ? pct(best.detect.everBotRate) : "—"} |`
      );
    }
  }

  console.log(`
# Is there a profitable AND hidden policy anywhere?
`);
  console.log(
    "Hidden = stays under 3σ against its own field AND the client-side detector\n" +
      "never once reaches BOT across all detector seeds.\n"
  );
  console.log(
    "| comparator | tie rule | profitable | under 3σ | never actioned | best hidden policy |"
  );
  console.log("|---|---|---|---|---|---|");
  for (const cmp of COMPARATORS)
    for (const rule of TIE_RULES) {
      const sub = rows.filter((r) => r.cmp === cmp);
      const prof = sub.filter((r) => r.ev[rule] > 0);
      const quiet = prof.filter((r) => r.z < 3);
      const inv = quiet.filter((r) => r.detect && r.detect.everBotRate === 0);
      const best = inv.length
        ? inv.reduce((a, b) => (a.ev[rule] > b.ev[rule] ? a : b))
        : null;
      console.log(
        `| ${cmp} | ${rule} | ${prof.length} | ${quiet.length} | ${inv.length} | ` +
          (best
            ? `${best.field} / ${best.shape}${best.rtMean ? ` ${best.rtMean}ms` : ""} bank@${best.cashTarget ?? "never"} ` +
              `(${pct(best.wr)}, ${best.z.toFixed(1)}σ, +$${best.ev[rule].toFixed(3)}/game)`
            : "none") +
          " |"
      );
    }

  for (const cmp of COMPARATORS) {
    console.log(`
# Edge available per field — "${cmp}" comparator
`);
    console.log(
      `  (the strongest field is the conservative one to quote: it is the` +
        ` opposition that
   leaves an attacker the least room)
`
    );
    for (const f of fields) {
      const fr = rows.filter((r) => r.field === f.id && r.cmp === cmp);
      const top = fr.reduce((a, b) => (a.wr > b.wr ? a : b));
      console.log(
        `  ${f.label.padEnd(8)} max win rate ${pct(top.wr)} (${top.z.toFixed(1)}σ) by ` +
          `${top.shape}${top.rtMean ? ` ${top.rtMean}ms` : ""} bank@${top.cashTarget ?? "never"}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
