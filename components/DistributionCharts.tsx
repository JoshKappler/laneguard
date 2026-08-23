"use client";

import { useEffect, useRef } from "react";
import type { BenchController } from "@/lib/ui/bench-controller";
import { palette, setupCanvas, monoFont } from "@/lib/ui/chart-utils";
import { stats, skewness } from "@/lib/detect/features";

function histogram(
  canvas: HTMLCanvasElement,
  values: number[],
  lo: number,
  hi: number,
  bins: number,
  unit: string
) {
  const W = 340, H = 150;
  const g = setupCanvas(canvas, W, H);
  const p = palette();
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(154,164,176,0.12)";
  for (let y = 0; y < H; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = p.ink3; g.font = monoFont(10);
  g.textAlign = "left"; g.fillText(lo + unit, 4, H - 4);
  g.textAlign = "right"; g.fillText(hi + unit, W - 4, H - 4);
  if (!values.length) {
    g.textAlign = "center"; g.fillStyle = p.ink3;
    g.fillText("no samples yet", W / 2, H / 2);
    return;
  }
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const b = Math.max(0, Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins)));
    counts[b]++;
  }
  const cmax = Math.max(...counts);
  const bw = (W - 8) / bins;
  for (let i = 0; i < bins; i++) {
    const h = (counts[i] / cmax) * (H - 34);
    g.fillStyle = p.accent;
    g.fillRect(4 + i * bw, H - 16 - h, Math.max(1, bw - 1.5), h);
  }
}

export function DistributionCharts({ controller, version }: { controller: BenchController | null; version: number }) {
  const rtRef = useRef<HTMLCanvasElement>(null);
  const mRef = useRef<HTMLCanvasElement>(null);
  const rts = controller?.detector.rts ?? [];
  const margins = controller?.detector.margins ?? [];

  useEffect(() => {
    if (rtRef.current) histogram(rtRef.current, rts, 0, 800, 28, "ms");
    if (mRef.current) histogram(mRef.current, margins, 0, 1.2, 24, "s");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const rtStat = rts.length ? stats(rts) : null;
  const rtSkew = rts.length >= 8 ? skewness(rts) : NaN;
  const mStat = margins.length ? stats(margins) : null;

  return (
    <section className="panel">
      <div className="panel-head"><h2>Distributions</h2><span className="sub">reaction time · dodge margin</span></div>
      <div className="panel-body" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>reaction-time distribution</div>
          <canvas ref={rtRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <div className="mono tiny muted" style={{ marginTop: 4 }}>
            {rtStat
              ? `n ${rts.length} · mean ${rtStat.mean.toFixed(0)}ms · sd ${rtStat.sd.toFixed(0)} · cv ${rtStat.cv.toFixed(2)} · min ${rtStat.min.toFixed(0)}` +
                (Number.isNaN(rtSkew) ? "" : ` · skew ${rtSkew.toFixed(2)}${rtSkew < 0.15 ? " (no lapse tail)" : ""}`)
              : "n 0"}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>dodge-margin distribution</div>
          <canvas ref={mRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <div className="mono tiny muted" style={{ marginTop: 4 }}>
            {mStat
              ? `n ${margins.length} · mean ${mStat.mean.toFixed(2)}s · cv ${mStat.cv.toFixed(2)}${mStat.cv < 0.22 && margins.length >= 8 ? " (metronome-consistent)" : ""}`
              : "n 0"}
          </div>
        </div>
      </div>
    </section>
  );
}
