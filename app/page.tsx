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
        <p className="muted" style={{ fontSize: 12, maxWidth: "56ch" }}>
          behavioral anti-cheat test bench — live input forensics on an original simulation of a
          lane-change money game
        </p>
        <span className="mono muted" style={{ marginLeft: "auto", fontSize: 12 }}>
          {snapshot ? snapshot.mode : "…"}{snapshot ? "  ·  " + controller?.clock() : ""}
        </span>
        <a
          href="/writeup"
          className="mono"
          style={{
            fontSize: 12,
            border: "1px solid var(--accent-dim)",
            borderRadius: "var(--r-chip)",
            padding: "5px 11px",
            textDecoration: "none",
          }}
        >
          read the analysis →
        </a>
      </header>

      {!hydrated && <div className="muted mono">booting bench…</div>}

      {/*
        Four placeable regions — the game, the evidence it produces, the verdict
        drawn from it, and the log. Every breakpoint arranges them so the columns
        come out the same height, with the log as the single elastic element that
        absorbs the slack. A fixed-height log used to leave a ~670px void here.
      */}
      <div className="dash-grid">
        <div className="col g-game">
          <GameCanvas controller={controller} />
        </div>

        <div className="col g-evidence">
          <SwipeInspector controller={controller} version={version} />
          <DistributionCharts controller={controller} version={version} />
        </div>

        <div className="col g-log">
          <EventLog controller={controller} version={version} grow />
        </div>

        <div className="col g-verdict">
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
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <ConfigPanel config={config} onPatch={patchConfig} onSeed={(seed) => applyConfig({ ...config, seed })} />
      </div>

      <div style={{ marginTop: 14 }}>
        <RocPanel />
      </div>

      <div className="dash-grid-2">
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
        .dash-grid {
          display: grid;
          gap: 14px;
          align-items: stretch;
          /* wide: game | evidence-over-log | verdict-over-controls */
          grid-template-columns: minmax(300px, 372px) minmax(560px, 1fr) minmax(360px, 424px);
          grid-template-rows: auto 1fr;
          grid-template-areas:
            "game evidence verdict"
            "game log      verdict";
        }
        .dash-grid > .col { gap: 14px; min-width: 0; }
        .dash-grid-2 {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
          margin-top: 14px;
        }
        .g-game { grid-area: game; }
        .g-evidence { grid-area: evidence; }
        .g-log { grid-area: log; }
        .g-verdict { grid-area: verdict; }

        /* Laptop widths: below ~1560 the swipe inspector wraps and the evidence
           column doubles in height, so drop to two columns instead. The game
           keeps the verdict beside it — that pairing is the point of the bench.
           (The old rule sent the full-height canvas full-width at 1280, which
           put nothing but the game above the fold.) */
        @media (max-width: 1559px) {
          .dash-grid {
            grid-template-columns: minmax(240px, 340px) minmax(0, 1fr);
            grid-template-rows: auto auto;
            grid-template-areas:
              "game verdict"
              "log  evidence";
          }
          /* the verdict cell is wide here — sit the controls beside the verdict
             rather than stretching one narrow list across 800px */
          .dash-grid > .g-verdict {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            align-content: start;
          }
          /* and hold the canvas near the height of the verdict stack beside it */
          .dash-grid { --game-max-h: 640px; }
        }
        @media (max-width: 860px) {
          .dash-grid, .dash-grid-2 { grid-template-columns: 1fr; }
          .dash-grid {
            grid-template-rows: none;
            grid-template-areas: "game" "verdict" "evidence" "log";
          }
        }
      `}</style>
    </main>
  );
}
