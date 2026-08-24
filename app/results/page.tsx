"use client";

import { useState } from "react";
import { encodeConfig } from "@/lib/core/config";
import { useBench } from "@/lib/ui/useBench";
import { NavBar } from "@/components/NavBar";
import { SignalRows } from "@/components/SignalRows";
import { ConfTimeline } from "@/components/ConfTimeline";
import { RunsPanel } from "@/components/RunsPanel";
import { DistributionCharts } from "@/components/DistributionCharts";
import { SwipeInspector } from "@/components/SwipeInspector";
import { EventLog } from "@/components/EventLog";
import { RocPanel } from "@/components/RocPanel";
import { EconPanel } from "@/components/EconPanel";
import { CadencePanel } from "@/components/CadencePanel";

export default function ResultsPage() {
  const { controller, config, snapshot, hydrated } = useBench();
  const [copied, setCopied] = useState(false);
  const version = snapshot?.version ?? 0;

  const copyPermalink = async () => {
    const url = new URL(window.location.origin + "/");
    const enc = encodeConfig(config);
    if (enc) url.searchParams.set("c", enc);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const exportRun = () => {
    if (!controller) return;
    const data = {
      exportedAt: new Date().toISOString(),
      config,
      seed: config.seed,
      finalCounters: {
        dodges: controller.detector.dodges,
        deaths: controller.detector.deaths,
        swipes: controller.detector.swipes.length,
        moves: controller.detector.moves,
        aborts: controller.detector.aborts,
        risks: controller.detector.risks.length,
      },
      verdict: controller.detector.analyze(),
      swipes: controller.swipes.map((s) => ({
        seq: s.seq, dur: s.dur, jitter: s.jitter, white: s.white, wamp: s.wamp,
        peakT: s.peakT, len: s.len, trusted: s.trusted, intFrac: s.intFrac,
        replayMatch: s.replayMatch, points: s.pts,
      })),
      runs: controller.runs,
      log: controller.log,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laneguard-run-seed${config.seed}-${config.mode}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: "0 16px 16px" }}>
      <NavBar page="results" />
      {!hydrated && <div className="muted mono">booting bench…</div>}
      {hydrated && (
        <div className="col" style={{ gap: 14 }}>
          <section className="panel">
            <div className="hline">
              session verdict{" "}
              <span className="dim">
                {config.mode} · seed {config.seed} · {controller?.clock() ?? ""}
                {snapshot?.done ? " · complete" : " · still running"}
              </span>
            </div>
            <div style={{ padding: 12 }}>
              <SignalRows snap={snapshot} detailWidth={280} />
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(540px, 1fr))", gap: 14 }}>
            <ConfTimeline controller={controller} version={version} />
            <RunsPanel controller={controller} />
          </div>

          <DistributionCharts controller={controller} version={version} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(560px, 1fr))", gap: 14, alignItems: "stretch" }}>
            <SwipeInspector controller={controller} version={version} />
            <EventLog controller={controller} version={version} grow />
          </div>

          <RocPanel />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(560px, 1fr))", gap: 14 }}>
            <EconPanel />
            <CadencePanel />
          </div>

          <div className="rowline" style={{ gap: 10 }}>
            <button onClick={copyPermalink}>{copied ? "✓ copied" : "copy config permalink"}</button>
            <button onClick={exportRun}>export run JSON</button>
            <span className="mono note">the export carries every swipe, run, verdict input, and log line of this session</span>
          </div>
        </div>
      )}
    </main>
  );
}
