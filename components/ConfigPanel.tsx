"use client";

import { useState } from "react";
import type { BenchConfig, DeepPartial } from "@/lib/core/config";

type Field = { path: string; label: string; min: number; max: number; step: number };
type Group = { title: string; note?: string; fields: Field[] };

const GROUPS: Group[] = [
  {
    title: "Game",
    fields: [
      { path: "game.baseSpeed", label: "base speed", min: 8, max: 30, step: 1 },
      { path: "game.maxSpeed", label: "max speed", min: 20, max: 60, step: 1 },
      { path: "game.speedRamp", label: "speed ramp /s", min: 0, max: 1.5, step: 0.02 },
      { path: "game.densityStart", label: "density start", min: 0.2, max: 1, step: 0.01 },
      { path: "game.densityMax", label: "density max", min: 0.4, max: 1, step: 0.01 },
      { path: "game.barrierFreq", label: "barrier freq", min: 0, max: 0.8, step: 0.02 },
      { path: "game.cashHold", label: "cashout hold (s)", min: 0.5, max: 4, step: 0.1 },
      { path: "game.maxSteer", label: "max steer (rad)", min: 0.3, max: 1, step: 0.02 },
      { path: "game.hitHalfWidth", label: "hitbox half-w", min: 12, max: 40, step: 1 },
      { path: "game.hitHalfLength", label: "hitbox half-l", min: 25, max: 70, step: 1 },
    ],
  },
  {
    title: "Attacker",
    note: "reaction-time sampler + motor-noise model + stealth texture",
    fields: [
      { path: "bot.rt.mean", label: "RT mean (ms)", min: 120, max: 400, step: 5 },
      { path: "bot.rt.sd", label: "RT sd", min: 5, max: 120, step: 5 },
      { path: "bot.rt.tau", label: "RT tau (exG tail)", min: 0, max: 200, step: 5 },
      { path: "bot.rt.floor", label: "RT floor", min: 80, max: 250, step: 5 },
      { path: "bot.riskPerMin", label: "risks / min", min: 0, max: 6, step: 0.1 },
      { path: "bot.abortsPerMin", label: "aborts / min", min: 0, max: 8, step: 0.1 },
      { path: "bot.noise.pinkAmp", label: "pink amp", min: 0, max: 6, step: 0.1 },
      { path: "bot.noise.tremorAmpMin", label: "tremor amp", min: 0, max: 3, step: 0.05 },
      { path: "bot.mirror.perturbPx", label: "replay perturb px", min: 0, max: 6, step: 0.1 },
    ],
  },
  {
    title: "Detector",
    note: "calibrated default marked in the ROC panel; wandering off it is visible here",
    fields: [
      { path: "detector.reaction.floorMs", label: "RT floor flag", min: 80, max: 200, step: 5 },
      { path: "detector.kinematics.jitterNone", label: "jitter floor", min: 0.05, max: 1, step: 0.05 },
      { path: "detector.noise.whiteFlag", label: "whiteness flag", min: 1.4, max: 3, step: 0.05 },
      { path: "detector.replay.shapeDupe", label: "replay shape dupe", min: 0.005, max: 0.05, step: 0.001 },
      { path: "detector.cuts.human", label: "HUMAN cut", min: 0.1, max: 0.5, step: 0.01 },
      { path: "detector.cuts.bot", label: "BOT cut", min: 0.4, max: 0.85, step: 0.01 },
    ],
  },
  {
    title: "Economy",
    fields: [
      { path: "econ.entry", label: "entry fee ($)", min: 1, max: 50, step: 1 },
      { path: "econ.rake", label: "rake", min: 0, max: 0.4, step: 0.01 },
      { path: "econ.k", label: "skill steepness", min: 0.5, max: 2.5, step: 0.05 },
    ],
  },
];

function getPath(obj: unknown, path: string): number {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj) as number;
}
function makePatch(path: string, value: number): DeepPartial<BenchConfig> {
  const keys = path.split(".");
  const root: Record<string, unknown> = {};
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else cur = (cur[k] = {}) as Record<string, unknown>;
  });
  return root as DeepPartial<BenchConfig>;
}

export function ConfigPanel({
  config,
  onPatch,
  onSeed,
}: {
  config: BenchConfig;
  onPatch: (p: DeepPartial<BenchConfig>) => void;
  onSeed: (seed: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <button
        className="panel-head"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", borderRadius: 0, cursor: "pointer" }}
      >
        <h2 style={{ color: "var(--ink)" }}>Configuration {open ? "▾" : "▸"}</h2>
        <span className="sub">every parameter · seeded · shareable via permalink</span>
      </button>
      {open && (
        <div className="panel-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <label className="field" style={{ minWidth: 140 }}>
              <span>run seed <span className="mono muted">(same seed = identical run)</span></span>
              <input type="number" value={config.seed} onChange={(e) => onSeed(parseInt(e.target.value, 10) || 0)} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 18 }}>
            {GROUPS.map((grp) => (
              <div key={grp.title}>
                <div className="eyebrow" style={{ marginBottom: 2 }}>{grp.title}</div>
                {grp.note && <div className="tiny muted" style={{ marginBottom: 8 }}>{grp.note}</div>}
                <div className="col" style={{ gap: 8 }}>
                  {grp.fields.map((f) => {
                    const val = getPath(config, f.path);
                    return (
                      <label key={f.path} className="field">
                        <span style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{f.label}</span>
                          <span className="mono" style={{ color: "var(--ink-2)" }}>{typeof val === "number" ? +val.toFixed(3) : val}</span>
                        </span>
                        <input
                          type="range"
                          min={f.min}
                          max={f.max}
                          step={f.step}
                          value={val}
                          onChange={(e) => onPatch(makePatch(f.path, +e.target.value))}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
