/*
 * Headless session runner. Wires the deterministic engine, an attacker, and
 * the detector, advances a fixed-step simulated clock, routes telemetry into
 * the detector in the same order the live loop does, and reports the outcome.
 *
 * Same seed + config -> identical session, everywhere (tests, batch, browser
 * replay). This is the function the whole bench is built on: the UI drives one
 * step at a time for rendering; the batch runner and tests drive it to
 * completion.
 */
import {
  DEFAULT_CONFIG,
  type BenchConfig,
} from "@/lib/core/config";
import { mulberry32, splitSeed } from "@/lib/core/rng";
import { Engine, type TelemetryEvent } from "@/lib/sim/engine";
import { Bot } from "@/lib/attack/bot";
import { Detector, SIGNAL_NAMES } from "@/lib/detect/detector";

export const FRAME_MS = 1000 / 60;

export interface FeatureStats {
  meanJitter: number | null;
  meanWhite: number | null;
  meanWamp: number | null;
  rtMean: number | null;
  rtMin: number | null;
  rtCv: number | null;
  marginCv: number | null;
}

export interface Counters {
  dodges: number;
  deaths: number;
  moves: number;
  swipes: number;
  aborts: number;
  risks: number;
  runEnds: number;
  cashouts: number;
  rowsPassed: number;
}

export interface Snapshot {
  atS: number;
  verdict: string;
  overall: number;
  ready: boolean;
  signals: Record<string, { sus: number; ready: boolean }>;
  flags: string[];
  counters: Counters;
  featureStats: FeatureStats;
}

export interface RunOutcome {
  endKind: "crash" | "cashout";
  score: number;
  banked: number;
  atS: number;
}

export interface SessionResult {
  config: BenchConfig;
  durationS: number;
  final: Snapshot;
  snapshots: Record<string, Snapshot>;
  runs: RunOutcome[];
  events: TelemetryEvent[];
  /** compact deterministic signature of the routed event stream */
  trail: string;
  firstFlagS: number | null;
  firstBotS: number | null;
  firstSuspectS: number | null;
}

export interface SessionSpec {
  config: BenchConfig;
  durationS: number;
  /** seconds at which to capture intermediate snapshots */
  snapshotAtS?: number[];
  /** keep the full per-swipe feature vectors + event log for export */
  keepEvents?: boolean;
}

const avg = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const cvOf = (a: number[]) => {
  if (!a.length) return null;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
  return m ? sd / m : 0;
};

function featureStats(d: Detector): FeatureStats {
  const ws = d.swipes.filter((s) => !Number.isNaN(s.white));
  return {
    meanJitter: avg(d.swipes.map((s) => s.jitter)),
    meanWhite: avg(ws.map((s) => s.white)),
    meanWamp: avg(ws.map((s) => s.wamp)),
    rtMean: avg(d.rts),
    rtMin: d.rts.length ? Math.min(...d.rts) : null,
    rtCv: cvOf(d.rts),
    marginCv: cvOf(d.margins),
  };
}

function counters(d: Detector): Counters {
  return {
    dodges: d.dodges,
    deaths: d.deaths,
    moves: d.moves,
    swipes: d.swipes.length,
    aborts: d.aborts,
    risks: d.risks.length,
    runEnds: d.runEnds.length,
    cashouts: d.runEnds.filter((k) => k === "cashout").length,
    rowsPassed: d.rowsPassed,
  };
}

function snapshot(d: Detector, atS: number): Snapshot {
  const v = d.analyze();
  const signals: Record<string, { sus: number; ready: boolean }> = {};
  for (const name of SIGNAL_NAMES) {
    const s = v.signals.find((x) => x.name === name)!;
    signals[name] = { sus: s.sus, ready: s.ready };
  }
  return {
    atS,
    verdict: v.label,
    overall: v.overall,
    ready: v.ready,
    signals,
    flags: v.flags.slice(),
    counters: counters(d),
    featureStats: featureStats(d),
  };
}

export function runSession(spec: SessionSpec): SessionResult {
  const cfg = spec.config ?? DEFAULT_CONFIG;
  const worldRng = mulberry32(splitSeed(cfg.seed, "world"));
  const engine = new Engine(cfg.game, worldRng);
  const bot = new Bot(
    engine,
    cfg.bot,
    cfg.mode,
    cfg.hwInject,
    splitSeed(cfg.seed, "bot")
  );
  const detector = new Detector(cfg.detector);
  engine.autoRestart = cfg.mode !== "human";
  if (cfg.mode !== "human") engine.resetRun();

  const events: TelemetryEvent[] = [];
  const trailParts: string[] = [];
  const runs: RunOutcome[] = [];
  const snapshots: Record<string, Snapshot> = {};
  const snapAt = (spec.snapshotAtS ?? []).slice().sort((a, b) => a - b);
  let nextSnap = 0;

  let firstFlagS: number | null = null;
  let firstSuspectS: number | null = null;
  let firstBotS: number | null = null;
  let seenFlags = new Set<string>();

  const route = (evs: TelemetryEvent[]) => {
    for (const ev of evs) {
      trailParts.push(ev.t.toFixed(1) + ev.kind);
      if (spec.keepEvents) events.push(ev);
      const d = ev.data ?? {};
      switch (ev.kind) {
        case "pass":
          detector.recordPass();
          break;
        case "death":
          detector.recordDeath(ev.t);
          break;
        case "runEnd":
          detector.recordRunEnd(d.endKind as string);
          runs.push({
            endKind: d.endKind as "crash" | "cashout",
            score: (d.score as number) ?? 0,
            banked: (d.banked as number) ?? 0,
            atS: ev.t / 1000,
          });
          break;
        case "move":
          detector.recordMove();
          break;
        case "dodge":
          detector.recordDodge(d.rt as number, d.margin as number);
          break;
        case "risk":
          detector.recordRisk(ev.t);
          break;
        case "abort":
          detector.recordAbort();
          break;
        case "key":
          detector.recordKey(d.trusted as boolean);
          break;
        case "swipe":
          detector.recordSwipe(
            d.swipe as Parameters<Detector["recordSwipe"]>[0]
          );
          break;
      }
    }
  };

  const totalFrames = Math.round((spec.durationS * 1000) / FRAME_MS);
  for (let frame = 0; frame < totalFrames; frame++) {
    route(engine.step(FRAME_MS));
    detector.tickRisks(engine.now);
    route(bot.tick(engine.now));

    // verdict / flag transition tracking
    const nowS = engine.now / 1000;
    const v = detector.analyze();
    for (const f of v.flags)
      if (!seenFlags.has(f) && firstFlagS === null) firstFlagS = nowS;
    seenFlags = new Set(v.flags);
    if (v.ready) {
      if (v.label === "SUSPECT" && firstSuspectS === null) firstSuspectS = nowS;
      if (v.label === "BOT" && firstBotS === null) firstBotS = nowS;
    }

    while (nextSnap < snapAt.length && nowS >= snapAt[nextSnap]) {
      snapshots[String(snapAt[nextSnap])] = snapshot(detector, snapAt[nextSnap]);
      nextSnap++;
    }
  }

  return {
    config: cfg,
    durationS: spec.durationS,
    final: snapshot(detector, spec.durationS),
    snapshots,
    runs,
    events,
    trail: trailParts.join("|"),
    firstFlagS,
    firstSuspectS,
    firstBotS,
  };
}
