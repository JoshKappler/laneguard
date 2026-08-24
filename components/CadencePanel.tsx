"use client";

import { useEffect, useMemo, useRef } from "react";
import { palette, setupCanvas, monoFont, useContainerWidth } from "@/lib/ui/chart-utils";
import { simulateWeek, cadenceMetrics } from "@/lib/econ/cadence";

/*
 * Both charts are single-hue small multiples, one row per profile. An earlier
 * version colored the three profiles green / red / amber as a categorical set;
 * scripts/validate_palette.js FAILS that trio at ΔE 5.3 (deutan) — below even
 * the 6–8 floor that secondary encoding can rescue — and no three hues fit the
 * dark-mode lightness band with enough separation either. Faceting removes the
 * need for a categorical palette entirely: identity is row position + label.
 */
const PROFILES = [
  { key: "human", label: "human" },
  { key: "farm", label: "naive farm" },
  { key: "sched", label: "scheduled bot" },
] as const;

export function CadencePanel() {
  const hourRef = useRef<HTMLCanvasElement>(null);
  const gapRef = useRef<HTMLCanvasElement>(null);
  const hourBox = useRef<HTMLDivElement>(null);
  const gapBox = useRef<HTMLDivElement>(null);
  const hourW = useContainerWidth(hourBox, { min: 280, max: 620 });
  const gapW = useContainerWidth(gapBox, { min: 240, max: 480 });

  // a full 7-day simulation for three profiles; memoized so it does not re-run
  // on every render of the live bench above it
  const m = useMemo(() => {
    const week = simulateWeek();
    return {
      human: cadenceMetrics(week.human),
      farm: cadenceMetrics(week.farm),
      sched: cadenceMetrics(week.sched),
    };
  }, []);

  useEffect(() => {
    const p = palette();
    // hour-of-day as three small-multiple rows
    const c = hourRef.current;
    if (c) {
      // small multiples: one row per profile, each row's label above its own
      // bars (they used to sit in a 46px gutter and run over the bars)
      const W = hourW, H = 224, PAD = 8, AXIS = 16;
      const g = setupCanvas(c, W, H);
      g.clearRect(0, 0, W, H);
      const rowH = (H - PAD - AXIS) / 3;
      const x0 = PAD, plotW = W - PAD * 2;
      PROFILES.forEach((prof, ri) => {
        const met = m[prof.key];
        const hmax = Math.max(...met.hours.map((v) => v / met.n), 1e-9);
        const y0 = PAD + ri * rowH;
        const base = y0 + rowH - 6;
        const bw = plotW / 24;
        g.fillStyle = p.accent;
        for (let h = 0; h < 24; h++) {
          const hh = (met.hours[h] / met.n / hmax) * (rowH - 22);
          g.fillRect(x0 + h * bw, base - hh, Math.max(1, bw - 1), hh);
        }
        // hairline baseline so an all-zero row still reads as a row
        g.fillStyle = "rgba(154,164,176,0.18)";
        g.fillRect(x0, base, plotW, 1);
        g.fillStyle = p.ink2; g.font = monoFont(10); g.textAlign = "left";
        g.fillText(prof.label, x0, y0 + 9);
      });
      g.fillStyle = p.ink3; g.font = monoFont(9);
      g.textAlign = "left"; g.fillText("00", x0, H - 4);
      g.textAlign = "center"; g.fillText("games by hour of day", W / 2, H - 4);
      g.textAlign = "right"; g.fillText("23", W - PAD, H - 4);
    }
    // gap distribution, faceted the same way — overlaid, the three curves
    // occluded each other and all peaked at nearly the same gap, so every
    // peak-anchored label landed on the same pixel
    const c2 = gapRef.current;
    if (c2) {
      const W = gapW, H = 224, PAD = 8, TITLE = 16, AXIS = 16;
      const g = setupCanvas(c2, W, H);
      g.clearRect(0, 0, W, H);
      const bins = 40, lo = Math.log(5), hi = Math.log(3600);
      const rowH = (H - TITLE - AXIS) / 3;
      const plotW = W - PAD * 2;
      g.fillStyle = p.ink3; g.font = monoFont(10); g.textAlign = "left";
      g.fillText("in-session gap distribution", PAD, 11);
      PROFILES.forEach((prof, ri) => {
        const met = m[prof.key];
        const counts = new Array(bins).fill(0);
        for (const v of met.gaps.filter((x) => x > 4 && x < 3600))
          counts[Math.max(0, Math.min(bins - 1, Math.floor(((Math.log(v) - lo) / (hi - lo)) * bins)))]++;
        const cm = Math.max(...counts, 1);
        const y0 = TITLE + ri * rowH;
        const base = y0 + rowH - 5;
        g.strokeStyle = p.accent; g.lineWidth = 1.5; g.beginPath();
        for (let i = 0; i < bins; i++) {
          const x = PAD + (i / (bins - 1)) * plotW;
          const y = base - (counts[i] / cm) * (rowH - 18);
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
        g.fillStyle = "rgba(154,164,176,0.18)";
        g.fillRect(PAD, base, plotW, 1);
        g.fillStyle = p.ink2; g.font = monoFont(9); g.textAlign = "left";
        g.fillText(prof.label, PAD, y0 + 8);
      });
      g.fillStyle = p.ink3; g.font = monoFont(9);
      g.textAlign = "left"; g.fillText("5s", PAD, H - 4);
      g.textAlign = "center"; g.fillText("log scale · each row normalized", W / 2, H - 4);
      g.textAlign = "right"; g.fillText("1h", W - PAD, H - 4);
    }
  }, [m, hourW, gapW]);

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
      <div className="hline">
        server-side session cadence{" "}
        <span className="dim">7-day simulation · human vs naive farm vs scheduled bot</span>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div ref={hourBox} style={{ flex: "1 1 320px", minWidth: 280 }}>
            <canvas ref={hourRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          </div>
          <div ref={gapBox} style={{ flex: "1 1 260px", minWidth: 240 }}>
            <canvas ref={gapRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          </div>
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
