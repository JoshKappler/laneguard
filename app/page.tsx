"use client";

import { useCallback } from "react";
import { useBench } from "@/lib/ui/useBench";
import { PRESETS, mergeConfig, DEFAULT_CONFIG, type PlayMode } from "@/lib/core/config";
import { GameCanvas } from "@/components/GameCanvas";
import { VerdictPanel } from "@/components/VerdictPanel";
import { SwipeInspector } from "@/components/SwipeInspector";
import { DistributionCharts } from "@/components/DistributionCharts";
import { EventLog } from "@/components/EventLog";
import { EconPanel } from "@/components/EconPanel";
import { CadencePanel } from "@/components/CadencePanel";
import { RocPanel } from "@/components/RocPanel";
import { Controls } from "@/components/Controls";
import { ConfigPanel } from "@/components/ConfigPanel";

export default function Page() {
  const { controller, config, snapshot, hydrated, applyConfig, patchConfig, setLive, resetTelemetry } = useBench();
  const version = snapshot?.version ?? 0;

  const onPreset = useCallback(
    (id: string) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) return;
      applyConfig(mergeConfig(DEFAULT_CONFIG, { ...preset.config, seed: config.seed }));
      // applyConfig rebuilds the controller synchronously; annotate after
      setTimeout(() => controller?.annotate(preset.logLine), 0);
    },
    [applyConfig, config.seed, controller]
  );

  return (
    <main style={{ maxWidth: 1900, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, letterSpacing: 1 }}>
          LANE<span style={{ color: "var(--accent)" }}>GUARD</span>
        </h1>
        <p className="muted" style={{ fontSize: 12, maxWidth: "68ch" }}>
          behavioral anti-cheat test bench — live input forensics on an original simulation of a
          lane-change money game. <a href="/writeup">read the analysis →</a>
        </p>
        <span className="mono muted" style={{ marginLeft: "auto", fontSize: 12 }}>
          {snapshot ? snapshot.mode : "…"}{snapshot ? "  ·  " + controller?.clock() : ""}
        </span>
      </header>

      {!hydrated && <div className="muted mono">booting bench…</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 404px) minmax(420px, 1fr) minmax(360px, 440px)",
          gap: 14,
          alignItems: "start",
        }}
        className="dash-grid"
      >
        <div className="col" style={{ gap: 14 }}>
          <GameCanvas controller={controller} />
        </div>

        <div className="col" style={{ gap: 14 }}>
          <SwipeInspector controller={controller} version={version} />
          <DistributionCharts controller={controller} version={version} />
        </div>

        <div className="col" style={{ gap: 14 }}>
          <VerdictPanel snap={snapshot} />
          <section className="panel">
            <div className="panel-body">
              <Controls
                config={config}
                controller={controller}
                onMode={(m: PlayMode) => setLive({ mode: m })}
                onToggleHw={(v) => setLive({ hwInject: v })}
                onToggleHitbox={(v) => setLive({ showHitbox: v })}
                onOrganic={(v) => patchConfig({ bot: { noise: { model: v ? "organic" : "iid" } } })}
                onReset={resetTelemetry}
                onPreset={onPreset}
              />
            </div>
          </section>
          <EventLog controller={controller} version={version} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <ConfigPanel config={config} onPatch={patchConfig} onSeed={(seed) => applyConfig({ ...config, seed })} />
      </div>

      <div style={{ marginTop: 14 }}>
        <RocPanel />
      </div>

      <div className="dash-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <EconPanel />
        <CadencePanel />
      </div>

      <footer className="muted tiny" style={{ marginTop: 20, textAlign: "center", lineHeight: 1.7, maxWidth: 820, marginInline: "auto" }}>
        The game is an original simulation built from public screenshots — no third-party code or
        assets, and nothing here reverse-engineers, inspects, or runs against Triumph&apos;s real app.
        The detector runs client-side for visibility; the design is server-side. Thresholds are
        first-principles priors until calibrated on a real human corpus.
      </footer>

      <style>{`
        @media (max-width: 1300px) {
          .dash-grid { grid-template-columns: 1fr 1fr !important; }
          .dash-grid > div:first-child { grid-column: 1 / -1; align-items: center; }
        }
        @media (max-width: 900px) {
          .dash-grid, .dash-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
