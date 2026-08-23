"use client";

import { useEffect, useRef } from "react";
import { palette, setupCanvas, monoFont } from "@/lib/ui/chart-utils";
import { simulateWeek, cadenceMetrics } from "@/lib/econ/cadence";

// Three account profiles map to outcomes (clean / caught / evasive), so they
// carry status colors — but every series is DIRECT-LABELED so identity is never
// color-alone (green/amber collide under protanopia; labels carry it).
const PROFILES = [
  { key: "human", label: "human", tok: "--ok" },
  { key: "farm", label: "naive farm", tok: "--bad" },
  { key: "sched", label: "scheduled bot", tok: "--warn" },
] as const;

export function CadencePanel() {
  const hourRef = useRef<HTMLCanvasElement>(null);
  const gapRef = useRef<HTMLCanvasElement>(null);

  const week = simulateWeek();
  const m = {
    human: cadenceMetrics(week.human),
    farm: cadenceMetrics(week.farm),
    sched: cadenceMetrics(week.sched),
  };

  useEffect(() => {
    const p = palette();
    const col = (t: string) => getComputedStyle(document.documentElement).getPropertyValue(t).trim();
    // hour-of-day as three small-multiple rows (single hue each, labeled)
    const c = hourRef.current;
    if (c) {
      const W = 470, H = 210;
      const g = setupCanvas(c, W, H);
      g.clearRect(0, 0, W, H);
      const rowH = (H - 16) / 3;
      PROFILES.forEach((prof, ri) => {
        const met = m[prof.key];
        const hmax = Math.max(...met.hours.map((v) => v / met.n), 1e-9);
        const y0 = 8 + ri * rowH;
        const bw = (W - 60) / 24;
        g.fillStyle = col(prof.tok);
        for (let h = 0; h < 24; h++) {
          const v = met.hours[h] / met.n / hmax;
          const hh = v * (rowH - 22);
          g.fillRect(52 + h * bw, y0 + (rowH - 18) - hh, Math.max(1, bw - 1), hh);
        }
        g.fillStyle = p.ink2; g.font = monoFont(10); g.textAlign = "left";
        g.fillText(prof.label, 6, y0 + 10);
      });
      g.fillStyle = p.ink3; g.font = monoFont(9); g.textAlign = "left";
      g.fillText("00", 52, H - 2); g.textAlign = "center"; g.fillText("12h", W / 2 + 20, H - 2);
      g.textAlign = "right"; g.fillText("23", W - 4, H - 2);
    }
    // gap distribution as labeled lines
    const c2 = gapRef.current;
    if (c2) {
      const W = 330, H = 210;
      const g = setupCanvas(c2, W, H);
      g.clearRect(0, 0, W, H);
      const bins = 40, lo = Math.log(5), hi = Math.log(3600);
      PROFILES.forEach((prof) => {
        const met = m[prof.key];
        const counts = new Array(bins).fill(0);
        for (const v of met.gaps.filter((x) => x > 4 && x < 3600))
          counts[Math.max(0, Math.min(bins - 1, Math.floor(((Math.log(v) - lo) / (hi - lo)) * bins)))]++;
        const cm = Math.max(...counts, 1);
        g.strokeStyle = col(prof.tok); g.lineWidth = 2; g.beginPath();
        let lastX = 8, lastY = H - 22;
        for (let i = 0; i < bins; i++) {
          const x = 8 + (i / (bins - 1)) * (W - 16);
          const y = H - 22 - (counts[i] / cm) * (H - 40);
          i ? g.lineTo(x, y) : g.moveTo(x, y);
          if (counts[i] === cm) { lastX = x; lastY = y; }
        }
        g.stroke();
        g.fillStyle = col(prof.tok); g.font = monoFont(9); g.textAlign = "center";
        g.fillText(prof.label, Math.min(W - 30, Math.max(30, lastX)), lastY - 4);
      });
      g.fillStyle = p.ink3; g.font = monoFont(10); g.textAlign = "left"; g.fillText("5s", 8, H - 6);
      g.textAlign = "right"; g.fillText("1h", W - 8, H - 6);
      g.textAlign = "left"; g.fillText("in-session gap distribution", 8, 12);
    }
  });

  const rows: [string, string, boolean?][] = [];
  for (const prof of PROFILES) {
    const x = m[prof.key];
    rows.push([`${prof.label} games/wk`, String(x.n)]);
    rows.push([`${prof.label} gap cv`, x.cv.toFixed(2), x.cv < 0.15]);
    rows.push([`${prof.label} active hrs`, `${x.activeHours}/24`, x.activeHours >= 23]);
    rows.push([`${prof.label} longest idle`, `${x.longestIdle.toFixed(1)} h`, x.longestIdle < 3]);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Server-side: session cadence</h2>
        <span className="sub">7-day simulation · human vs naive farm vs scheduled bot</span>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <canvas ref={hourRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <canvas ref={gapRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <div className="kv" style={{ minWidth: 200 }}>
            {rows.map((r) => (
              <div key={r[0]} style={{ display: "contents" }}>
                <span className="k">{r[0]}</span>
                <span className={"v" + (r[2] ? " hot" : "")}>{r[1]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mono tiny muted" style={{ marginTop: 8 }}>
          the naive farm is trivially caught (rigid cadence, no sleep) — but the scheduled bot passes every cadence check.
          cadence filters lazy farms; the economy is what binds a competent one.
        </div>
      </div>
    </section>
  );
}
