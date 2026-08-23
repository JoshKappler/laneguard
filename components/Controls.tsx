"use client";

import { useState } from "react";
import { PRESETS, encodeConfig, type BenchConfig, type PlayMode } from "@/lib/core/config";
import type { BenchController } from "@/lib/ui/bench-controller";

const MODES: { id: PlayMode; label: string }[] = [
  { id: "human", label: "Play (human)" },
  { id: "perfect", label: "Perfect bot" },
  { id: "mirror", label: "Mirror bot" },
  { id: "generative", label: "Generative bot" },
];

export function Controls({
  config,
  controller,
  onMode,
  onToggleHw,
  onToggleHitbox,
  onOrganic,
  onReset,
  onPreset,
}: {
  config: BenchConfig;
  controller: BenchController | null;
  onMode: (m: PlayMode) => void;
  onToggleHw: (v: boolean) => void;
  onToggleHitbox: (v: boolean) => void;
  onOrganic: (v: boolean) => void;
  onReset: () => void;
  onPreset: (id: string) => void;
}) {
  const [hitbox, setHitbox] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPermalink = async () => {
    const url = new URL(window.location.href);
    const enc = encodeConfig(config);
    if (enc) url.searchParams.set("c", enc);
    else url.searchParams.delete("c");
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const exportRun = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      config,
      seed: config.seed,
      finalCounters: controller?.["detector"]
        ? {
            dodges: controller.detector.dodges,
            deaths: controller.detector.deaths,
            swipes: controller.detector.swipes.length,
            moves: controller.detector.moves,
            aborts: controller.detector.aborts,
            risks: controller.detector.risks.length,
          }
        : null,
      verdict: controller?.detector.analyze() ?? null,
      swipes: controller?.swipes.map((s) => ({
        seq: s.seq, dur: s.dur, jitter: s.jitter, white: s.white, wamp: s.wamp,
        peakT: s.peakT, len: s.len, trusted: s.trusted, intFrac: s.intFrac,
        replayMatch: s.replayMatch, points: s.pts,
      })) ?? [],
      runs: controller?.runs ?? [],
      log: controller?.log ?? [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laneguard-run-seed${config.seed}-${config.mode}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Scenario presets</div>
        <div className="row">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => onPreset(p.id)} title={p.description}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Who&apos;s driving</div>
        <div className="row">
          {MODES.map((m) => (
            <button key={m.id} className={config.mode === m.id ? "active" : ""} onClick={() => onMode(m.id)}>
              {m.label}
            </button>
          ))}
          <button onClick={onReset}>Reset telemetry</button>
        </div>
      </div>

      <div className="col" style={{ gap: 7 }}>
        <label className="toggle">
          <input type="checkbox" checked={config.hwInject} onChange={(e) => onToggleHw(e.target.checked)} />
          simulate hardware-level injection (events arrive trusted, like a phone-farm rig)
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={config.bot.noise.model === "organic"}
            onChange={(e) => onOrganic(e.target.checked)}
          />
          generative bot: organic noise evasion (pink 1/f + tremor + drift vs iid)
        </label>
        <label className="toggle">
          <input type="checkbox" checked={hitbox} onChange={(e) => { setHitbox(e.target.checked); onToggleHitbox(e.target.checked); }} />
          show hitboxes (player box rotates + shrinks while angled)
        </label>
      </div>

      <div className="row" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>
        <button onClick={copyPermalink}>{copied ? "✓ copied" : "Copy permalink"}</button>
        <button onClick={exportRun}>Export run JSON</button>
        <span className="mono tiny muted">seed {config.seed}</span>
      </div>
    </div>
  );
}
