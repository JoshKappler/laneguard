"use client";

import { useEffect, useRef } from "react";
import type { BenchController, SwipeView } from "@/lib/ui/bench-controller";
import { palette, setupCanvas, monoFont } from "@/lib/ui/chart-utils";

function drawSwipe(canvas: HTMLCanvasElement, f: SwipeView) {
  const Wc = 500, Hc = 300;
  const g = setupCanvas(canvas, Wc, Hc);
  const p = palette();
  g.clearRect(0, 0, Wc, Hc);
  g.strokeStyle = "rgba(154,164,176,0.10)";
  g.lineWidth = 1;
  for (let x = 0; x < Wc; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hc); g.stroke(); }
  for (let y = 0; y < Hc; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(Wc, y); g.stroke(); }

  const pathH = Hc - 88;
  const pts = f.pts;
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const pt of pts) { minx = Math.min(minx, pt.x); maxx = Math.max(maxx, pt.x); miny = Math.min(miny, pt.y); maxy = Math.max(maxy, pt.y); }
  const spanx = Math.max(20, maxx - minx), spany = Math.max(20, maxy - miny);
  const sc = Math.min((Wc - 70) / spanx, (pathH - 50) / spany);
  const ox = (Wc - spanx * sc) / 2 - minx * sc;
  const oy = (pathH - spany * sc) / 2 - miny * sc + 14;
  const X = (pt: { x: number }) => pt.x * sc + ox, Y = (pt: { y: number }) => pt.y * sc + oy;

  // segments colored by speed on a single-hue ramp (accent, light→bright)
  let vmax = 1e-9;
  const vs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t || 1;
    const v = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / dt;
    vs.push(v); vmax = Math.max(vmax, v);
  }
  g.lineWidth = 3;
  g.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const u = vs[i - 1] / vmax;
    g.globalAlpha = 0.35 + 0.65 * u;
    g.strokeStyle = p.accent;
    g.beginPath(); g.moveTo(X(pts[i - 1]), Y(pts[i - 1])); g.lineTo(X(pts[i]), Y(pts[i])); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = "rgba(230,234,239,0.85)";
  for (const pt of pts) { g.beginPath(); g.arc(X(pt), Y(pt), 2.2, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = p.ok; g.lineWidth = 2;
  g.beginPath(); g.arc(X(pts[0]), Y(pts[0]), 6, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = p.bad;
  g.beginPath(); g.arc(X(pts[pts.length - 1]), Y(pts[pts.length - 1]), 6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = p.ink3; g.font = monoFont(10); g.textAlign = "left";
  g.fillText("path (screen px), brightness = speed", 10, 12);

  // velocity profile strip (single hue)
  const vy0 = Hc - 60;
  g.fillText("velocity profile (16 samples, normalized)", 10, vy0 - 5);
  const bw = (Wc - 20) / f.profile.length;
  const pmax = Math.max(...f.profile, 1e-9);
  for (let i = 0; i < f.profile.length; i++) {
    const h = (f.profile[i] / pmax) * 44;
    g.globalAlpha = 0.4 + 0.6 * (f.profile[i] / pmax);
    g.fillStyle = p.accent;
    g.fillRect(10 + i * bw, vy0 + 44 - h, bw - 2, h);
  }
  g.globalAlpha = 1;
}

export function SwipeInspector({ controller, version }: { controller: BenchController | null; version: number }) {
  const plotRef = useRef<HTMLCanvasElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const selected = controller?.getSelected() ?? null;

  useEffect(() => {
    if (plotRef.current && selected) drawSwipe(plotRef.current, selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, selected?.seq]);

  const rows: [string, string, boolean?][] = selected
    ? [
        ["duration", selected.dur.toFixed(0) + " ms"],
        ["sample points", String(selected.pts.length)],
        ["path length", selected.len.toFixed(1) + " px"],
        ["jitter (motor noise)", selected.jitter.toFixed(3) + " px", selected.jitter < 0.3],
        ["Δ⁴/Δ² whiteness", Number.isNaN(selected.white) ? "n/a" : selected.white.toFixed(2), selected.white >= 2.0 && selected.wamp >= 0.4],
        ["implied noise σ", selected.wamp.toFixed(2) + " px"],
        ["velocity peak", selected.peakT.toFixed(3)],
        ["integer-coord frac", (selected.intFrac * 100).toFixed(0) + " %"],
        ["provenance", selected.trusted ? "trusted" : "SYNTHETIC", !selected.trusted],
        ["nn shape dist", selected.nn ? selected.nn.sd.toFixed(4) + " (#" + selected.nn.seq + ")" : "n/a", !!selected.replayMatch],
        ["classification", selected.replayMatch ? "REPLAY MATCH" : "unique", !!selected.replayMatch],
      ]
    : [];

  return (
    <section className="panel">
      <div className="hline">
        swipe forensics{" "}
        <span className="dim">
          {selected ? "swipe #" + selected.seq + (selected.replayMatch ? " ⚑ replay" : " · unique") : "waiting for first swipe"}
        </span>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <canvas ref={plotRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <div className="kv" style={{ minWidth: 220, flex: 1 }}>
            {rows.map((r) => (
              <div key={r[0]} style={{ display: "contents" }}>
                <span className="k">{r[0]}</span>
                <span className={"v" + (r[2] ? " hot" : "")}>{r[1]}</span>
              </div>
            ))}
            {!selected && <span className="muted tiny">no swipes yet; play, or start a bot</span>}
          </div>
        </div>

        <div
          ref={galleryRef}
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, minHeight: 20 }}
        >
          {controller?.swipes.slice(-24).map((f) => (
            <button
              key={f.seq}
              onClick={() => controller.selectSwipe(f.seq)}
              title={"swipe #" + f.seq}
              className="mono"
              style={{
                padding: "3px 6px",
                fontSize: 10,
                border: "1px solid " + (f.replayMatch ? "var(--bad)" : f.trusted ? "var(--line)" : "var(--warn)"),
                color: f.seq === selected?.seq ? "var(--accent)" : "var(--ink-3)",
                background: f.seq === selected?.seq ? "rgba(61,220,255,0.06)" : "var(--surface-2)",
              }}
            >
              #{f.seq}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
