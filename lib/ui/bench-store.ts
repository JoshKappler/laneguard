/*
 * Module-singleton bench state: one BenchController shared by the setup, run,
 * and results pages, so navigating between them never resets a session. Also
 * owns the recorded swipe corpus (localStorage only — never the URL, traces
 * are biometric-adjacent).
 */
import {
  DEFAULT_CONFIG,
  PRESETS,
  decodeConfig,
  encodeConfig,
  mergeConfig,
  type BenchConfig,
  type DeepPartial,
} from "@/lib/core/config";
import type { TracePoint } from "@/lib/attack/bot";
import { BenchController, type BenchSnapshot } from "./bench-controller";

const CONFIG_KEY = "laneguard.config.v2";
const CORPUS_KEY = "laneguard.corpus.v1";

/* First visit (no saved config, no ?c= permalink): boot the naive scripted
   bot and pre-run 3 sim-minutes so every panel arrives populated. */
const DEMO_PRESET_ID = "naive-scripted";
const DEMO_FF_MS = 180_000;

type Listener = () => void;

class BenchStore {
  controller: BenchController | null = null;
  config: BenchConfig = DEFAULT_CONFIG;
  snapshot: BenchSnapshot | null = null;
  corpus: TracePoint[][] = [];
  private listeners = new Set<Listener>();
  private demoBoot = false;

  ensure() {
    if (this.controller || typeof window === "undefined") return;
    this.config = this.readInitialConfig();
    this.corpus = this.readCorpus();
    this.controller = new BenchController(this.config, {
      onSnapshot: (s) => {
        this.snapshot = s;
        this.notify();
      },
      recordedCorpus: () => (this.config.bot.mirror.useRecorded ? this.corpus : []),
    });
    if (this.demoBoot) {
      const p = PRESETS.find((x) => x.id === DEMO_PRESET_ID);
      if (p) this.controller.annotate(p.logLine);
      this.controller.annotate(
        "DEMO: pre-ran 3 minutes of the naive scripted bot so every panel arrives populated. Pick any preset on setup to run your own session."
      );
      this.controller.fastForward(DEMO_FF_MS);
    }
    this.controller.start();
  }

  private readInitialConfig(): BenchConfig {
    const url = new URL(window.location.href);
    const c = url.searchParams.get("c");
    if (c) return decodeConfig(c);
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
    } catch {
      /* ignore */
    }
    this.demoBoot = true;
    const demo = PRESETS.find((p) => p.id === DEMO_PRESET_ID);
    return demo ? mergeConfig(DEFAULT_CONFIG, demo.config) : DEFAULT_CONFIG;
  }

  private readCorpus(): TracePoint[][] {
    try {
      const raw = localStorage.getItem(CORPUS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return [];
  }

  private persist() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
      const url = new URL(window.location.href);
      const enc = encodeConfig(this.config);
      if (enc) url.searchParams.set("c", enc);
      else url.searchParams.delete("c");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private notify() {
    for (const fn of this.listeners) fn();
  }

  applyConfig(cfg: BenchConfig) {
    this.config = cfg;
    this.controller?.setConfig(cfg);
    this.persist();
    this.notify();
  }

  patchConfig(patch: DeepPartial<BenchConfig>) {
    this.applyConfig(mergeConfig(this.config, patch));
  }

  setLive(p: { mode?: BenchConfig["mode"]; hwInject?: boolean; showHitbox?: boolean }) {
    this.controller?.setLive(p);
    const next = { ...this.config };
    if (p.mode !== undefined) next.mode = p.mode;
    if (p.hwInject !== undefined) next.hwInject = p.hwInject;
    this.config = next;
    this.persist();
    this.notify();
  }

  resetTelemetry() {
    this.controller?.resetAll();
  }

  addTrace(t: TracePoint[]) {
    this.corpus = [...this.corpus, t];
    try {
      localStorage.setItem(CORPUS_KEY, JSON.stringify(this.corpus));
    } catch {
      /* ignore */
    }
    this.notify();
  }

  clearCorpus() {
    this.corpus = [];
    try {
      localStorage.removeItem(CORPUS_KEY);
    } catch {
      /* ignore */
    }
    this.notify();
  }
}

export const benchStore = new BenchStore();
