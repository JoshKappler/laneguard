/*
 * Calibration pipeline. Replaces first-principles detector priors with
 * thresholds measured against a REAL human swipe corpus.
 *
 *   pnpm calibrate
 *
 * It loads corpus/*.json (+ corpus/sample/*.json), featurizes the human swipes
 * as the NEGATIVE class, runs each attacker as the POSITIVE class, and for every
 * swipe-level feature computes an ROC/AUC and a threshold at a strict FPR
 * ceiling (a false ban withholds a real player's money, so FPR is the budget).
 * It writes:
 *   results/calibration.json          — ROC data + the AUC matrix (for the UI)
 *   lib/detect/thresholds.generated.ts — the calibrated constants + metadata
 *
 * HONESTY: with no human corpus present it still runs, but emits basis "prior"
 * and changes NO threshold. It never fabricates a human distribution. The AUC
 * matrix intentionally exposes that the evasive/stealth attackers are NOT
 * separable on any swipe-level feature — that is the demonstrated arms race,
 * not a bug to tune away.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, mergeConfig, type BenchConfig } from "../lib/core/config.ts";
import { featurize, type TracePoint } from "../lib/detect/features.ts";
import { runSession } from "../lib/bench/session.ts";
import { auc, thresholdAtFpr, rocCurve, type Direction } from "../lib/detect/roc.ts";

const repo = path.resolve(import.meta.dirname, "..");
const FPR_TARGET = 0.001; // ≤ 0.1%
const today = new Date().toISOString().slice(0, 10);

interface CorpusSwipe {
  id?: number;
  dir?: string;
  dur?: number;
  points: TracePoint[];
}
interface CorpusFile {
  meta?: { subject?: string; device?: string; input?: string; date?: string };
  swipes: CorpusSwipe[];
}

/* ---- load human corpus ---- */
function loadCorpus(): { files: { file: string; data: CorpusFile }[] } {
  const dirs = [path.join(repo, "corpus"), path.join(repo, "corpus", "sample")];
  const files: { file: string; data: CorpusFile }[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const data = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
        if (data && Array.isArray(data.swipes)) files.push({ file: name, data });
      } catch {
        console.warn("skip unreadable corpus file:", name);
      }
    }
  }
  return { files };
}

interface FeatureRow {
  jitter: number;
  white: number;
  wamp: number;
  peakT: number;
  dur: number;
  len: number;
}
function featureRows(swipes: { points: TracePoint[]; dur: number }[]): FeatureRow[] {
  const rows: FeatureRow[] = [];
  for (const s of swipes) {
    if (s.points.length < DEFAULT_CONFIG.detector.swipeMinPoints) continue;
    if (s.dur <= DEFAULT_CONFIG.detector.swipeMinDurMs) continue;
    const f = featurize({ points: s.points, trusted: true, dur: s.dur });
    if (Number.isNaN(f.white)) continue;
    rows.push({ jitter: f.jitter, white: f.white, wamp: f.wamp, peakT: f.peakT, dur: f.dur, len: f.len });
  }
  return rows;
}

/* ---- attacker positives ---- */
const BOT_MODES: { key: string; over: Partial<BenchConfig> | Record<string, unknown> }[] = [
  { key: "naive", over: { mode: "perfect", hwInject: false } },
  { key: "replay", over: { mode: "mirror", hwInject: true } },
  { key: "generative-iid", over: { mode: "generative", hwInject: true, bot: { noise: { model: "iid" } } } },
  { key: "generative-organic", over: { mode: "generative", hwInject: true, bot: { noise: { model: "organic" } } } },
  {
    key: "stealth",
    over: {
      mode: "generative",
      hwInject: true,
      bot: {
        noise: { model: "organic" },
        rt: { family: "exgaussian", mean: 210, sd: 40, tau: 90, floor: 170 },
        gateRtToThreat: true,
        riskPerMin: 0.7,
        abortsPerMin: 1.6,
      },
    },
  },
];

function botFeatureRows(over: object, seeds = 3): FeatureRow[] {
  const rows: FeatureRow[] = [];
  for (let s = 0; s < seeds; s++) {
    const cfg = mergeConfig(DEFAULT_CONFIG, { ...(over as object), seed: 2000 + s * 13 } as never);
    const r = runSession({ config: cfg, durationS: 180, keepEvents: true });
    for (const ev of r.events) {
      if (ev.kind !== "swipe") continue;
      const sw = ev.data!.swipe as { points: TracePoint[]; dur: number };
      if (sw.points.length < DEFAULT_CONFIG.detector.swipeMinPoints) continue;
      const f = featurize({ points: sw.points, trusted: true, dur: sw.dur });
      if (Number.isNaN(f.white)) continue;
      rows.push({ jitter: f.jitter, white: f.white, wamp: f.wamp, peakT: f.peakT, dur: f.dur, len: f.len });
    }
  }
  return rows;
}

/* ---- feature specs: which detector threshold each maps to, and its tail ---- */
const FEATURES: {
  key: keyof FeatureRow;
  label: string;
  direction: Direction;
  /** attacker class this feature is designed to catch */
  target: string;
  /** where the calibrated value lands in DetectorConfig */
  apply?: (v: number, cfg: BenchConfig["detector"]) => void;
}[] = [
  { key: "jitter", label: "motor-noise jitter (px)", direction: "low", target: "naive", apply: (v, c) => (c.kinematics.jitterNone = round(v)) },
  { key: "white", label: "Δ⁴/Δ² whiteness", direction: "high", target: "generative-iid", apply: (v, c) => (c.noise.whiteFlag = round(v)) },
  { key: "wamp", label: "implied noise σ (px)", direction: "high", target: "generative-iid" },
  { key: "peakT", label: "velocity-peak position", direction: "low", target: "naive" },
  { key: "dur", label: "swipe duration (ms)", direction: "low", target: "naive" },
];

const round = (x: number) => Math.round(x * 1000) / 1000;

/* ---- run ---- */
const corpus = loadCorpus();
const humanSwipes = corpus.files.flatMap((f) =>
  f.data.swipes.map((s) => ({
    points: s.points,
    dur: s.dur ?? (s.points.length ? s.points[s.points.length - 1].t - s.points[0].t : 0),
  }))
);
const human = featureRows(humanSwipes);
const bots = Object.fromEntries(BOT_MODES.map((m) => [m.key, botFeatureRows(m.over)]));

const basis: "prior" | "calibrated" = human.length >= 50 ? "calibrated" : "prior";
const calibratedDetector = mergeConfig(DEFAULT_CONFIG, {}).detector;

const perFeature: Record<string, unknown> = {};
const matrix: Record<string, Record<string, number>> = {};
for (const spec of FEATURES) {
  const negVals = human.map((r) => r[spec.key]);
  matrix[spec.key] = {};
  for (const m of BOT_MODES) {
    const posVals = bots[m.key].map((r) => r[spec.key]);
    matrix[spec.key][m.key] =
      human.length && posVals.length ? round(auc(negVals, posVals, spec.direction)) : NaN;
  }
  const posVals = bots[spec.target]?.map((r) => r[spec.key]) ?? [];
  if (basis === "calibrated" && posVals.length) {
    const choice = thresholdAtFpr(negVals, posVals, spec.direction, FPR_TARGET);
    const curve = rocCurve(negVals, posVals, spec.direction).map((p) => ({
      fpr: round(p.fpr),
      tpr: round(p.tpr),
    }));
    perFeature[spec.key] = { label: spec.label, direction: spec.direction, target: spec.target, ...choice, threshold: round(choice.threshold), auc: round(choice.auc), curve };
    if (spec.apply) spec.apply(choice.threshold, calibratedDetector);
  } else {
    perFeature[spec.key] = { label: spec.label, direction: spec.direction, target: spec.target, auc: matrix[spec.key][spec.target] ?? NaN, note: "no human corpus — threshold left at prior" };
  }
}

if (basis === "calibrated") {
  calibratedDetector.calibration = {
    basis: "calibrated",
    corpusSwipes: human.length,
    fprTarget: FPR_TARGET,
    note: `calibrated on ${human.length} human swipes at FPR ≤ ${(FPR_TARGET * 100).toFixed(2)}%`,
  };
}

/* diff calibrated detector vs prior for the generated overrides */
function detectorDiff(): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const base = DEFAULT_CONFIG.detector;
  if (calibratedDetector.kinematics.jitterNone !== base.kinematics.jitterNone)
    d.kinematics = { jitterNone: calibratedDetector.kinematics.jitterNone };
  if (calibratedDetector.noise.whiteFlag !== base.noise.whiteFlag)
    d.noise = { whiteFlag: calibratedDetector.noise.whiteFlag };
  if (basis === "calibrated") d.calibration = calibratedDetector.calibration;
  return d;
}

const subjects = [...new Set(corpus.files.map((f) => f.data.meta?.subject).filter(Boolean))];
const inputs: Record<string, number> = {};
for (const f of corpus.files) {
  const k = f.data.meta?.input ?? "unknown";
  inputs[k] = (inputs[k] ?? 0) + f.data.swipes.length;
}

const calibration = {
  generatedAt: today,
  basis,
  fprTarget: FPR_TARGET,
  humanCorpus: { files: corpus.files.length, swipes: human.length, subjects, inputs },
  botSamples: Object.fromEntries(BOT_MODES.map((m) => [m.key, bots[m.key].length])),
  perFeature,
  aucMatrix: matrix,
  note:
    basis === "calibrated"
      ? "Thresholds fitted to the human corpus at the stated FPR. Rows in aucMatrix show each feature's separability against each attacker class — the evasive/stealth columns are expected to be near 0.5 (indistinguishable), which is the arms-race result."
      : "No human corpus recorded yet (need ≥50 swipes). Thresholds remain first-principles priors. Record a corpus with recorder/index.html, drop it in corpus/, and re-run `pnpm calibrate`.",
};

mkdirSync(path.join(repo, "results"), { recursive: true });
writeFileSync(path.join(repo, "results", "calibration.json"), JSON.stringify(calibration, null, 2));

const generated = `/* AUTO-GENERATED by \`pnpm calibrate\` — do not edit by hand.
 * ${basis === "calibrated" ? calibration.note : "No human corpus yet; thresholds are first-principles priors."}
 * generated: ${today}
 */
import type { DeepPartial, BenchConfig } from "@/lib/core/config";

export const CALIBRATION = ${JSON.stringify(
  {
    basis,
    generatedAt: today,
    fprTarget: FPR_TARGET,
    humanCorpus: calibration.humanCorpus,
    perFeature,
    aucMatrix: matrix,
    note: calibration.note,
  },
  null,
  2
)} as const;

export const CALIBRATED_THRESHOLDS: DeepPartial<BenchConfig["detector"]> = ${JSON.stringify(
  detectorDiff(),
  null,
  2
)};
`;
writeFileSync(path.join(repo, "lib", "detect", "thresholds.generated.ts"), generated);

/* ---- report ---- */
console.log(`\nCalibration (${basis})  —  human swipes: ${human.length}${subjects.length ? " · subjects: " + subjects.join(",") : ""}\n`);
console.log("AUC matrix (feature × attacker class; 0.5 = indistinguishable, 1.0 = perfectly separable)\n");
const cols = BOT_MODES.map((m) => m.key);
console.log("| feature | " + cols.join(" | ") + " |");
console.log("|" + "---|".repeat(cols.length + 1));
for (const spec of FEATURES) {
  const cells = cols.map((c) => {
    const v = matrix[spec.key][c];
    return Number.isNaN(v) ? "—" : v.toFixed(2);
  });
  console.log(`| ${spec.key} | ${cells.join(" | ")} |`);
}
if (basis === "calibrated") {
  console.log("\nChosen thresholds at FPR ≤ " + (FPR_TARGET * 100).toFixed(2) + "%:");
  for (const spec of FEATURES) {
    const pf = perFeature[spec.key] as { threshold?: number; fpr?: number; tpr?: number; auc?: number };
    if (pf.threshold !== undefined)
      console.log(`  ${spec.key.padEnd(8)} ${spec.direction === "low" ? "≤" : "≥"} ${pf.threshold}  (AUC ${pf.auc}, TPR ${pf.tpr} @ FPR ${pf.fpr})`);
  }
} else {
  console.log("\n" + calibration.note);
}
console.log("\nwrote results/calibration.json and lib/detect/thresholds.generated.ts");
