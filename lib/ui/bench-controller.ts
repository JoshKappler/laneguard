/*
 * Browser controller: owns the Engine + Bot + Detector + Renderer and runs the
 * live rAF loop, routing telemetry into the detector exactly as the headless
 * session runner does (so what you see live matches what the batch measures).
 * React only reads snapshots + getters off this; all mutation lives here.
 */
import {
  DEFAULT_CONFIG,
  type BenchConfig,
  type PlayMode,
} from "@/lib/core/config";
import { mulberry32, splitSeed } from "@/lib/core/rng";
import { Engine, type TelemetryEvent } from "@/lib/sim/engine";
import { Bot, type TracePoint } from "@/lib/attack/bot";
import { Detector, SIGNAL_NAMES } from "@/lib/detect/detector";
import type { SwipeFeatures } from "@/lib/detect/features";
import { Renderer, makeViewFx, type ViewFx } from "./renderer";

export interface SwipeView extends SwipeFeatures {
  seq: number;
  nn?: { sd: number; pd: number; seq: number } | null;
  replayMatch?: boolean;
}

export interface LogEntry {
  t: number;
  cls: string;
  msg: string;
}

export interface RunInfo {
  endKind: "crash" | "cashout";
  score: number;
  banked: number;
  forfeited: number;
  atMs: number;
}

export interface ConfPoint {
  t: number;
  overall: number;
}

export interface BenchSnapshot {
  version: number;
  clockMs: number;
  mode: PlayMode;
  verdict: string;
  overall: number;
  ready: boolean;
  /** true once runsTarget completed runs have finished; the sim is frozen */
  done: boolean;
  signals: { name: string; sus: number; ready: boolean; detail: string }[];
  flags: string[];
  counters: {
    dodges: number;
    deaths: number;
    moves: number;
    swipes: number;
    aborts: number;
    risks: number;
    rowsPassed: number;
    runEnds: number;
    cashouts: number;
  };
}

type Callbacks = {
  onSnapshot: (s: BenchSnapshot) => void;
  /** recorded human traces for the replay-farm corpus; [] = use synthesized */
  recordedCorpus?: () => TracePoint[][];
};

interface SwipeAnim {
  pts: TracePoint[];
  dur: number;
  t0: number;
}

export class BenchController {
  cfg: BenchConfig;
  engine!: Engine;
  bot!: Bot;
  detector!: Detector;
  renderer: Renderer | null = null;
  fx: ViewFx = makeViewFx();
  private canvas: HTMLCanvasElement | null = null;
  private cb: Callbacks;
  private raf = 0;
  private lastFrame = 0;
  private startClock = 0;
  private lastSnapshot = 0;

  swipes: SwipeView[] = [];
  log: LogEntry[] = [];
  runs: RunInfo[] = [];
  confHistory: ConfPoint[] = [];
  tierTouches = { suspect: 0, bot: 0 };
  peakConf = 0;
  private lastTier = "HUMAN";
  selectedSeq: number | null = null;
  finished = false;
  private swipeCanvas: HTMLCanvasElement | null = null;
  private swipeAnims: SwipeAnim[] = [];
  private seq = 0;
  private version = 0;

  constructor(cfg: BenchConfig, cb: Callbacks) {
    this.cfg = cfg;
    this.cb = cb;
    this.build();
  }

  private build() {
    this.engine = new Engine(this.cfg.game, mulberry32(splitSeed(this.cfg.seed, "world")));
    this.bot = new Bot(this.engine, this.cfg.bot, this.cfg.mode, this.cfg.hwInject, splitSeed(this.cfg.seed, "bot"));
    const recorded = this.cb.recordedCorpus?.() ?? [];
    if (recorded.length) this.bot.setCorpus(recorded);
    this.detector = new Detector(this.cfg.detector);
    this.engine.autoRestart = this.cfg.mode !== "human";
    if (this.cfg.mode !== "human") this.engine.resetRun();
    if (this.renderer) this.renderer = new Renderer(this.renderer.ctx, this.engine, this.fx);
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d")!;
    this.renderer = new Renderer(ctx, this.engine, this.fx);
  }

  detach() {
    this.canvas = null;
    this.renderer = null;
  }

  attachSwipeView(canvas: HTMLCanvasElement) {
    this.swipeCanvas = canvas;
  }

  detachSwipeView() {
    this.swipeCanvas = null;
  }

  start() {
    if (this.raf) return;
    this.startClock = performance.now();
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** live-swappable settings that don't require a full reset */
  setLive(p: { mode?: PlayMode; hwInject?: boolean; showHitbox?: boolean }) {
    if (p.showHitbox !== undefined) this.fx.showHitbox = p.showHitbox;
    if (p.hwInject !== undefined) {
      this.cfg = { ...this.cfg, hwInject: p.hwInject };
      this.bot.hwInject = p.hwInject;
    }
    if (p.mode !== undefined && p.mode !== this.cfg.mode) {
      this.cfg = { ...this.cfg, mode: p.mode };
      this.resetAll();
    }
  }

  /** full rebuild from a new config (game/detector/bot params or seed changed) */
  setConfig(cfg: BenchConfig) {
    this.cfg = cfg;
    this.resetAll();
  }

  resetAll() {
    this.swipes = [];
    this.log = [];
    this.runs = [];
    this.confHistory = [];
    this.tierTouches = { suspect: 0, bot: 0 };
    this.peakConf = 0;
    this.lastTier = "HUMAN";
    this.selectedSeq = null;
    this.finished = false;
    this.swipeAnims = [];
    this.seq = 0;
    this.fx.particles = [];
    this.fx.tilt = 0;
    this.fx.lastGain = null;
    this.build();
    this.pushLog(0, "good", "telemetry reset — detector state and charts cleared");
    this.emit(true);
  }

  private pushLog(t: number, cls: string, msg: string) {
    this.log.push({ t, cls, msg });
    if (this.log.length > 600) this.log.shift();
  }

  private clockStr(ms: number) {
    const s = ms / 1000;
    const m = Math.floor(s / 60);
    return "T+" + String(m).padStart(2, "0") + ":" + (s % 60).toFixed(3).padStart(6, "0");
  }

  private frame(now: number) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const dtMs = dt * 1000;

    // physics + telemetry (sim clock lives inside the engine)
    if (!this.finished) {
      const before = this.engine.state.phase;
      this.route(this.engine.step(dtMs));
      this.detector.tickRisks(this.engine.now);
      this.route(this.bot.tick(this.engine.now));
      // crash burst
      if (before === "running" && this.engine.state.phase === "dead") this.renderer?.burst();
    }

    if (this.renderer) this.renderer.draw(this.engine.now, dt);
    this.drawSwipeView(now);

    // throttle React updates to ~7 Hz
    if (now - this.lastSnapshot > 140) {
      this.lastSnapshot = now;
      this.emit();
    }
  }

  /* Ghost phone: the run at 25% opacity with each swipe traced in red at the
     speed it actually happened, then fading out. */
  private drawSwipeView(now: number) {
    const cv = this.swipeCanvas;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#0b0c0e";
    g.fillRect(0, 0, cv.width, cv.height);
    if (this.canvas) {
      g.globalAlpha = 0.25;
      g.drawImage(this.canvas, 0, 0, cv.width, cv.height);
      g.globalAlpha = 1;
    }
    const FADE = 1400;
    this.swipeAnims = this.swipeAnims.filter((a) => now - a.t0 < a.dur + FADE);
    for (const a of this.swipeAnims) {
      const el = now - a.t0;
      const base = a.pts[0]?.t ?? 0;
      const alpha = el <= a.dur ? 1 : 1 - (el - a.dur) / FADE;
      g.strokeStyle = `rgba(255,59,48,${alpha.toFixed(2)})`;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      let head: { x: number; y: number } | null = null;
      for (let i = 0; i < a.pts.length; i++) {
        const p = a.pts[i];
        if (p.t - base > el) break;
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
        head = p;
      }
      g.stroke();
      if (head && el <= a.dur) {
        g.fillStyle = `rgba(255,59,48,${alpha.toFixed(2)})`;
        g.beginPath();
        g.arc(head.x, head.y, 7, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private route(evs: TelemetryEvent[]) {
    for (const ev of evs) {
      const d = ev.data ?? {};
      switch (ev.kind) {
        case "pass":
          this.detector.recordPass();
          if ((d.mult as number) > 0)
            this.fx.lastGain = { mult: d.mult as number, at: this.engine.now, y: 550 };
          break;
        case "death":
          this.detector.recordDeath(ev.t);
          break;
        case "runEnd": {
          const kind = d.endKind as "crash" | "cashout";
          this.detector.recordRunEnd(kind);
          this.runs.push({
            endKind: kind,
            score: (d.score as number) ?? 0,
            banked: (d.banked as number) ?? 0,
            forfeited: (d.forfeited as number) ?? 0,
            atMs: ev.t,
          });
          if (kind === "crash")
            this.pushLog(ev.t, "flag", `RUN END: CRASH at score ${d.score} — $${((d.forfeited as number) ?? 0).toFixed(2)} forfeited`);
          else
            this.pushLog(ev.t, "good", `RUN END: CASHOUT — banked $${(d.banked as number).toFixed(2)} at ${(d.mult as number).toFixed(2)}x (score ${d.score})`);
          if (this.cfg.runsTarget > 0 && this.runs.length >= this.cfg.runsTarget && !this.finished) {
            this.finished = true;
            this.pushLog(ev.t, "good", `target of ${this.cfg.runsTarget} runs reached — sim frozen, results are ready`);
          }
          break;
        }
        case "move":
          this.detector.recordMove();
          break;
        case "dodge":
          this.detector.recordDodge(d.rt as number, d.margin as number);
          this.pushLog(ev.t, "metric", `dodge: RT ${(d.rt as number).toFixed(0)}ms · margin ${(d.margin as number).toFixed(2)}s · speed ${(d.speed as number).toFixed(1)}`);
          break;
        case "risk":
          this.detector.recordRisk(ev.t);
          this.pushLog(ev.t, "warn", "CONTESTED move — entered a lane with live traffic in the threat window");
          break;
        case "abort":
          this.detector.recordAbort();
          this.pushLog(ev.t, "info", `gesture aborted — released with no lane change (${this.detector.aborts} total)`);
          break;
        case "key":
          this.detector.recordKey(d.trusted as boolean);
          break;
        case "swipe": {
          const f = this.detector.recordSwipe(d.swipe as Parameters<Detector["recordSwipe"]>[0]);
          if (f) this.captureSwipe(f as SwipeView);
          break;
        }
      }
    }
  }

  private captureSwipe(f: SwipeView) {
    f.seq = ++this.seq;
    this.swipes.push(f);
    if (this.swipes.length > 80) this.swipes.shift();
    this.selectedSeq = f.seq;
    this.swipeAnims.push({ pts: f.pts, dur: Math.max(f.dur, 60), t0: performance.now() });
    if (this.swipeAnims.length > 12) this.swipeAnims.shift();
    const dir = f.pts[f.pts.length - 1].x >= f.pts[0].x ? "R" : "L";
    this.pushLog(
      this.engine.now,
      f.replayMatch ? "flag" : f.trusted ? "metric" : "warn",
      `SWIPE #${f.seq} dir=${dir} dur=${f.dur.toFixed(0)}ms pts=${f.pts.length} jitter=${f.jitter.toFixed(2)}px white=${Number.isNaN(f.white) ? "n/a" : f.white.toFixed(2)} peakT=${f.peakT.toFixed(2)}${f.trusted ? "" : " [SYNTHETIC]"}${f.replayMatch ? " ** REPLAY-MATCH **" : ""}`
    );
  }

  private emit(force = false) {
    const v = this.detector.analyze();
    if (force || true) this.version++;
    if (v.ready) {
      this.confHistory.push({ t: this.engine.now, overall: v.overall });
      // ~7 Hz sampling; halve the series past 2400 points so long sessions stay light
      if (this.confHistory.length > 2400) this.confHistory = this.confHistory.filter((_, i) => i % 2 === 0);
      this.peakConf = Math.max(this.peakConf, v.overall);
      if (v.label !== this.lastTier) {
        if (v.label === "SUSPECT") this.tierTouches.suspect++;
        if (v.label === "BOT") this.tierTouches.bot++;
        this.lastTier = v.label;
      }
    }
    const snap: BenchSnapshot = {
      version: this.version,
      clockMs: this.engine.now,
      mode: this.cfg.mode,
      verdict: v.label,
      overall: v.overall,
      ready: v.ready,
      done: this.finished,
      signals: SIGNAL_NAMES.map((n) => {
        const s = v.signals.find((x) => x.name === n)!;
        return { name: n, sus: s.sus, ready: s.ready, detail: s.detail };
      }),
      flags: v.flags,
      counters: {
        dodges: this.detector.dodges,
        deaths: this.detector.deaths,
        moves: this.detector.moves,
        swipes: this.detector.swipes.length,
        aborts: this.detector.aborts,
        risks: this.detector.risks.length,
        rowsPassed: this.detector.rowsPassed,
        runEnds: this.detector.runEnds.length,
        cashouts: this.detector.runEnds.filter((k) => k === "cashout").length,
      },
    };
    this.cb.onSnapshot(snap);
  }

  clock() {
    return this.clockStr(this.engine.now);
  }

  /** annotate the event log (used by preset buttons to say what they demonstrate) */
  annotate(msg: string) {
    this.pushLog(this.engine.now, "good", msg);
    this.emit(true);
  }

  /* ---- human input (ignored while a bot drives) ---- */
  private advanceState(): boolean {
    if (this.finished) return true;
    const s = this.engine.state;
    if (s.phase === "idle") {
      this.route(this.engine.resetRun());
      return true;
    }
    if ((s.phase === "dead" || s.phase === "cashed") && this.engine.now - s.stateAt > 450) {
      this.route(this.engine.resetRun());
      return true;
    }
    return s.phase !== "running";
  }

  pointerDown(x: number, y: number, trusted: boolean) {
    if (this.cfg.mode !== "human") return;
    if (this.advanceState()) return;
    this.engine.input.begin(x, y, trusted, "pointer", this.engine.now);
  }
  pointerMove(x: number, y: number) {
    if (this.cfg.mode !== "human" || !this.engine.input.active) return;
    this.route(this.engine.input.move(x, y, this.engine.now));
  }
  pointerUp() {
    if (this.cfg.mode !== "human") return;
    this.route(this.engine.input.end(this.engine.now));
  }
  key(dir: number, trusted: boolean) {
    if (this.cfg.mode !== "human") return;
    if (this.advanceState()) return;
    this.route(this.engine.keyLaneChange(dir, trusted, this.engine.now));
  }

  selectSwipe(seq: number) {
    this.selectedSeq = seq;
    this.emit(true);
  }
  getSelected(): SwipeView | null {
    return this.swipes.find((s) => s.seq === this.selectedSeq) ?? this.swipes[this.swipes.length - 1] ?? null;
  }
}

export { DEFAULT_CONFIG };
