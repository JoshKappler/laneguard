"use client";

import { useEffect, useRef } from "react";
import type { BenchController } from "@/lib/ui/bench-controller";
import { palette, setupCanvas, monoFont, useContainerWidth, binValues } from "@/lib/ui/chart-utils";
import { stats, skewness } from "@/lib/detect/features";

/*
 * Values past the domain get their own separated bin, drawn dimmer and labeled
 * "N+". Folding them into the last in-range bin makes the tail look like a
 * mode at the axis maximum, which is exactly the shape this chart exists to
 * read.
 */
function histogram(
  canvas: HTMLCanvasElement,
  values: number[],
  lo: number,
  hi: number,
  bins: number,
  unit: string,
  W: number
) {
  const H = 150;
  const g = setupCanvas(canvas, W, H);
  const p = palette();
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(154,164,176,0.12)";
  for (let y = 0; y < H; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  if (!values.length) {
    g.fillStyle = p.ink3; g.font = monoFont(10);
    g.textAlign = "left"; g.fillText(lo + unit, 4, H - 4);
    g.textAlign = "right"; g.fillText(hi + unit, W - 4, H - 4);
    g.textAlign = "center";
    g.fillText("no samples yet; dodges land here as they happen", W / 2, H / 2);
    return;
  }
  const { counts, overflow } = binValues(values, lo, hi, bins);
  const cmax = Math.max(...counts, overflow, 1);
  // reserve a gutter for the overflow bin only when something landed in it
  const gutter = overflow ? 34 : 0;
  const plotW = W - 8 - gutter;
  const bw = plotW / bins;
  g.fillStyle = p.accent;
  for (let i = 0; i < bins; i++) {
    const h = (counts[i] / cmax) * (H - 34);
    g.fillRect(4 + i * bw, H - 16 - h, Math.max(1, bw - 1.5), h);
  }
  // x axis ticks at quarters, tallest-bar count on the left
  g.fillStyle = p.ink3;
  g.font = monoFont(10);
  for (let k = 0; k <= 4; k++) {
    const x = 4 + plotW * (k / 4);
    const v = lo + (hi - lo) * (k / 4);
    g.strokeStyle = "rgba(154,164,176,0.3)";
    g.beginPath(); g.moveTo(x, H - 16); g.lineTo(x, H - 12); g.stroke();
    g.textAlign = k === 0 ? "left" : k === 4 ? "right" : "center";
    g.fillText(+v.toFixed(2) + unit, x, H - 4);
  }
  g.textAlign = "left";
  g.fillText("tallest bar = " + cmax, 4, 10);
  if (overflow) {
    const x = 4 + plotW + 10;
    const h = (overflow / cmax) * (H - 34);
    g.fillStyle = "rgba(154,164,176,0.45)";
    g.fillRect(x, H - 16 - h, gutter - 14, h);
    g.textAlign = "center";
    g.fillText(hi + "+", x + (gutter - 14) / 2, H - 4);
  }
}

export function DistributionCharts({ controller, version }: { controller: BenchController | null; version: number }) {
  const rtRef = useRef<HTMLCanvasElement>(null);
  const mRef = useRef<HTMLCanvasElement>(null);
  const rtBox = useRef<HTMLDivElement>(null);
  const mBox = useRef<HTMLDivElement>(null);
  const rtW = useContainerWidth(rtBox, { min: 240, max: 640 });
  const mW = useContainerWidth(mBox, { min: 240, max: 640 });
  const rts = controller?.detector.rts ?? [];
  const margins = controller?.detector.margins ?? [];

  useEffect(() => {
    // 0–1200 ms, not 0–800: credited RT is measured from threat onset, so a
    // lookahead attacker's dodges routinely land past 800 and the old domain
    // dumped most of the right half of the distribution into one edge bin
    if (rtRef.current) histogram(rtRef.current, rts, 0, 1200, 30, "ms", rtW);
    if (mRef.current) histogram(mRef.current, margins, 0, 1.2, 24, "s", mW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, rtW, mW]);

  const rtStat = rts.length ? stats(rts) : null;
  const rtSkew = rts.length >= 8 ? skewness(rts) : NaN;
  const mStat = margins.length ? stats(margins) : null;

  return (
    <section className="panel">
      <div className="hline">
        distributions <span className="dim">one bar = one bin, bar height = how many dodges landed in it</span>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: 14 }}>
        <div ref={rtBox} style={{ flex: 1, minWidth: 280 }}>
          <div className="rowline" style={{ minHeight: 22 }}>
            <span className="lbl" style={{ width: "auto" }}>reaction time per dodge</span>
            <span className="note">from a car turning threat to the swipe that dodged it · 40 ms bins</span>
          </div>
          <canvas ref={rtRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <div className="mono tiny muted" style={{ marginTop: 4 }}>
            {rtStat
              ? `n ${rts.length} · mean ${rtStat.mean.toFixed(0)}ms · sd ${rtStat.sd.toFixed(0)} · cv ${rtStat.cv.toFixed(2)} · min ${rtStat.min.toFixed(0)}` +
                (Number.isNaN(rtSkew) ? "" : ` · skew ${rtSkew.toFixed(2)}${rtSkew < 0.15 ? " (no lapse tail)" : ""}`)
              : "n 0"}
          </div>
        </div>
        <div ref={mBox} style={{ flex: 1, minWidth: 280 }}>
          <div className="rowline" style={{ minHeight: 22 }}>
            <span className="lbl" style={{ width: "auto" }}>dodge margin</span>
            <span className="note">seconds to spare when the dodge cleared · 0.05 s bins · tight spread = metronome</span>
          </div>
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
