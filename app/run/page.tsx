"use client";

import { useState } from "react";
import Link from "next/link";
import { useBench } from "@/lib/ui/useBench";
import { NavBar } from "@/components/NavBar";
import { GameCanvas } from "@/components/GameCanvas";
import { SwipePhone } from "@/components/SwipePhone";
import { SignalRows } from "@/components/SignalRows";
import { ConfTimeline } from "@/components/ConfTimeline";
import { RunsPanel } from "@/components/RunsPanel";
import { DistributionCharts } from "@/components/DistributionCharts";

export default function RunPage() {
  const { controller, config, snapshot, hydrated, setLive, resetTelemetry } = useBench();
  const [hitbox, setHitbox] = useState(false);
  const runsDone = snapshot?.counters.runEnds ?? 0;
  const target = config.runsTarget;
  const version = snapshot?.version ?? 0;

  return (
    <main style={{ maxWidth: 1700, margin: "0 auto", padding: "0 16px 16px" }}>
      <NavBar page="run" />
      {!hydrated && <div className="muted mono">booting bench…</div>}
      {hydrated && (
        <div className="col" style={{ gap: 14 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <GameCanvas controller={controller} />
            <SwipePhone controller={controller} />
            <div className="col" style={{ flex: 1, minWidth: 470, gap: 14 }}>
              <section className="panel">
                <div className="hline">
                  run {runsDone}
                  {target > 0 ? " / " + target : ""}{" "}
                  <span className="dim">
                    {config.mode === "human" ? "you drive: swipe the phone or use arrow keys" : config.mode + " bot driving"}
                    {" · "}seed {config.seed}
                    {snapshot?.done ? " · target reached, sim frozen" : ""}
                  </span>
                </div>
                <div style={{ padding: 12 }}>
                  <SignalRows snap={snapshot} />
                </div>
              </section>
              <ConfTimeline controller={controller} version={version} />
              <div className="rowline" style={{ gap: 14 }}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={hitbox}
                    onChange={(e) => {
                      setHitbox(e.target.checked);
                      setLive({ showHitbox: e.target.checked });
                    }}
                  />
                  show hitboxes
                </label>
                <button onClick={resetTelemetry}>reset telemetry</button>
                {config.mode !== "human" && controller && !snapshot?.done && (
                  <button onClick={() => controller.fastForward(180_000)} title="advance the sim 3 minutes instantly">
                    fast-forward 3 min
                  </button>
                )}
                <Link
                  href="/results"
                  className="mono"
                  style={{
                    marginLeft: "auto",
                    border: "1px solid " + (snapshot?.done ? "var(--accent)" : "var(--line)"),
                    borderRadius: "var(--r-chip)",
                    padding: "6px 12px",
                    fontSize: 12,
                    color: snapshot?.done ? "var(--accent)" : "var(--ink-2)",
                  }}
                >
                  results →
                </Link>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(540px, 1fr))", gap: 14 }}>
            <RunsPanel controller={controller} />
            <DistributionCharts controller={controller} version={version} />
          </div>
        </div>
      )}
    </main>
  );
}
