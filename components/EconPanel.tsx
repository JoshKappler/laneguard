"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { palette, setupCanvas, monoFont, useContainerWidth } from "@/lib/ui/chart-utils";
import { simulatePopulation } from "@/lib/econ/population";
import { breakEven, evPerGame } from "@/lib/econ/economy";

export function EconPanel() {
  const popRef = useRef<HTMLCanvasElement>(null);
  const bankRef = useRef<HTMLCanvasElement>(null);
  const popBox = useRef<HTMLDivElement>(null);
  const bankBox = useRef<HTMLDivElement>(null);
  const popW = useContainerWidth(popBox, { min: 260, max: 620 });
  const bankW = useContainerWidth(bankBox, { min: 240, max: 520 });
  const [botWR, setBotWR] = useState(70);
  const [popN, setPopN] = useState(400);
  const [games, setGames] = useState(300);
  const [rake, setRake] = useState(20);
  const entry = 5;

  const be = breakEven(entry, rake / 100);
  // the population sim is a few hundred thousand simulated games — it must not
  // re-run on every parent render (this panel re-renders with the live bench)
  const sim = useMemo(
    () => simulatePopulation({ nPlayers: popN, nGames: games, botWR: botWR / 100, band: 0.06, k: 1.15 }),
    [popN, games, botWR]
  );
  const evBot = evPerGame(botWR / 100, entry, rake / 100);
  const profitable = botWR / 100 > be;

  useEffect(() => {
    const p = palette();
    // population histogram
    const c = popRef.current;
    if (c) {
      // title band on top, then the plot, then the axis — nothing shares a row,
      // so the rake-wall / bot markers can never land on the title
      const W = popW, H = 232, TITLE = 40, AXIS = 30;
      const g = setupCanvas(c, W, H);
      g.clearRect(0, 0, W, H);
      const plotTop = TITLE, plotBot = H - AXIS;
      const lo = 0.25, hi = 0.85, bins = 48;
      const counts = new Array(bins).fill(0);
      for (const v of sim.rates) counts[Math.max(0, Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins)))]++;
      const cmax = Math.max(...counts, 1);
      const bw = (W - 16) / bins;
      const xOf = (v: number) => 8 + ((v - lo) / (hi - lo)) * (W - 16);
      for (let i = 0; i < bins; i++) {
        const h = (counts[i] / cmax) * (plotBot - plotTop);
        const v = lo + ((i + 0.5) / bins) * (hi - lo);
        g.fillStyle = v >= be ? p.bad : p.accent; // above the rake wall = the profitable-bot zone (status)
        g.fillRect(8 + i * bw, plotBot - h, Math.max(1, bw - 1), h);
      }
      g.fillStyle = p.ink3; g.font = monoFont(10); g.textAlign = "left";
      g.fillText(`player win-rate distribution (n=${sim.rates.length}, ${games} games each)`, 8, 11);
      // markers: rules through the plot, labels in the title band above it
      g.strokeStyle = p.warn; g.lineWidth = 2; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(xOf(be), plotTop); g.lineTo(xOf(be), plotBot); g.stroke();
      g.setLineDash([]);
      g.strokeStyle = p.bad; g.lineWidth = 2;
      g.beginPath(); g.moveTo(xOf(botWR / 100), plotTop); g.lineTo(xOf(botWR / 100), plotBot); g.stroke();
      g.font = monoFont(10); g.textAlign = "center";
      // two label rows below the title, used only when the markers are close
      // enough that their text would overlap on one row
      const close = Math.abs(xOf(botWR / 100) - xOf(be)) < 92;
      g.fillStyle = p.warn;
      g.fillText("rake wall " + (be * 100).toFixed(1) + "%", xOf(be), close ? TITLE - 16 : TITLE - 4);
      g.fillStyle = p.bad;
      g.fillText("bot " + botWR + "%", xOf(botWR / 100), TITLE - 4);
      g.fillStyle = p.ink3; g.textAlign = "left"; g.fillText("25%", 8, H - 8);
      g.textAlign = "right"; g.fillText("85%", W - 8, H - 8);
      g.textAlign = "center";
      g.fillText("observed win rate", W / 2, H - 8);
    }
    // bankroll curves — 3 direct-labeled lines
    const c2 = bankRef.current;
    if (c2) {
      // right gutter holds the end-of-run labels so they sit beside their line
      // rather than on top of it
      const W = bankW, H = 224, GUT = 108, TITLE = 26, AXIS = 30;
      const g = setupCanvas(c2, W, H);
      g.clearRect(0, 0, W, H);
      const x1 = W - GUT, plotTop = TITLE, plotBot = H - AXIS;
      // break-even is a reference, not a series — dashed, so the three lines
      // are told apart by stroke as well as hue (bad/warn are a weak pair for
      // red-green CVD; see the note in CadencePanel)
      const series = [
        { p: botWR / 100, col: p.bad, label: "bot " + botWR + "%", dash: [] as number[] },
        { p: be, col: p.warn, label: "break-even", dash: [5, 4] },
        { p: sim.mean, col: p.accent, label: "mean human", dash: [] as number[] },
      ];
      const N = games;
      let ymin = 0, ymax = 0;
      for (const s of series) { const end = evPerGame(s.p, entry, rake / 100) * N; ymin = Math.min(ymin, end); ymax = Math.max(ymax, end); }
      const pad = Math.max(10, (ymax - ymin) * 0.12); ymin -= pad; ymax += pad;
      const yOf = (v: number) => plotBot - ((v - ymin) / (ymax - ymin)) * (plotBot - plotTop);
      g.strokeStyle = "rgba(154,164,176,0.25)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(8, yOf(0)); g.lineTo(x1, yOf(0)); g.stroke();
      g.fillStyle = p.ink3; g.font = monoFont(9); g.textAlign = "left";
      g.fillText("$0", 10, yOf(0) - 3);
      // keep labels from stacking on each other when two lines end close together
      const ends = series
        .map((s, i) => ({ i, y: yOf(evPerGame(s.p, entry, rake / 100) * N) }))
        .sort((a, b) => a.y - b.y);
      const labelY: number[] = [];
      let prev = -Infinity;
      for (const e of ends) { const y = Math.max(e.y, prev + 13); labelY[e.i] = y; prev = y; }
      series.forEach((s, i) => {
        const end = evPerGame(s.p, entry, rake / 100) * N;
        g.strokeStyle = s.col; g.lineWidth = 2; g.setLineDash(s.dash); g.beginPath();
        for (let k = 0; k <= 60; k++) {
          const n = (k / 60) * N, x = 8 + (k / 60) * (x1 - 8);
          k ? g.lineTo(x, yOf(evPerGame(s.p, entry, rake / 100) * n)) : g.moveTo(x, yOf(evPerGame(s.p, entry, rake / 100) * n));
        }
        g.stroke();
        g.setLineDash([]);
        // leader from the line end to its label in the gutter
        g.strokeStyle = s.col; g.lineWidth = 1; g.globalAlpha = 0.5;
        g.beginPath(); g.moveTo(x1, yOf(end)); g.lineTo(x1 + 6, labelY[i]); g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = s.col; g.font = monoFont(10); g.textAlign = "left";
        g.fillText(`${s.label} $${end.toFixed(0)}`, x1 + 9, labelY[i] + 3);
      });
      g.fillStyle = p.ink3; g.font = monoFont(10); g.textAlign = "left";
      g.fillText(`expected bankroll ($${entry} entry)`, 8, 11);
      g.fillText("0", 8, H - 8);
      g.textAlign = "right"; g.fillText(`${N} games`, x1, H - 8);
    }
  }, [botWR, games, rake, be, sim, entry, popW, bankW]);

  const rows: [string, string, boolean?][] = [
    ["entry / pot", `$${entry} / $${2 * entry}`],
    ["rake", `${rake}% ($${(2 * entry * (rake / 100)).toFixed(2)})`],
    ["winner nets", `+$${(2 * entry * (1 - rake / 100) - entry).toFixed(2)}`],
    ["loser nets", `-$${entry.toFixed(2)}`],
    ["break-even win rate", `${(be * 100).toFixed(1)} %`],
    ["bot win rate", `${botWR} %`, profitable],
    ["bot EV / game", `${evBot >= 0 ? "+" : ""}$${evBot.toFixed(2)}`, profitable],
    ["bot z-score", `${sim.z.toFixed(1)} σ`, sim.z > 4],
    // a count, not a percentile: the empirical percentile has 1/nPlayers
    // resolution and pins at 100 the moment nobody beats the bot
    ["players at or above", `${sim.above} / ${sim.nRated}`, sim.z > 4],
    ["verdict", profitable && sim.z > 4 ? "PROFITABLE → DETECTABLE" : profitable ? "profitable, low signal" : "unprofitable", profitable && sim.z > 4],
  ];

  const Slider = ({ label, val, set, min, max, step, fmt }: { label: string; val: number; set: (n: number) => void; min: number; max: number; step?: number; fmt: (n: number) => string }) => (
    <label className="field" style={{ minWidth: 120 }}>
      <span>{label} <span className="mono" style={{ color: "var(--ink-2)" }}>{fmt(val)}</span></span>
      <input type="range" min={min} max={max} step={step ?? 1} value={val} onChange={(e) => set(+e.target.value)} />
    </label>
  );

  return (
    <section className="panel">
      <div className="hline">
        server-side economy + population{" "}
        <span className="dim">${entry} head-to-head · {rake}% rake · break-even {(be * 100).toFixed(1)}%</span>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div ref={popBox} style={{ flex: "1 1 300px", minWidth: 260 }}>
            <canvas ref={popRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          </div>
          <div ref={bankBox} style={{ flex: "1 1 260px", minWidth: 240 }}>
            <canvas ref={bankRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          </div>
          <div className="kv" style={{ minWidth: 210 }}>
            {rows.map((r) => (
              <div key={r[0]} style={{ display: "contents" }}>
                <span className="k">{r[0]}</span>
                <span className={"v" + (r[2] ? " hot" : "")}>{r[1]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mono tiny muted" style={{ marginTop: 8 }}>
          skill-matched population: mean {(sim.mean * 100).toFixed(1)}% · sd {(sim.sd * 100).toFixed(1)}pp
          (binomial floor {(sim.noise * 100).toFixed(1)}pp) · the instant a bot clears the rake wall it is already a {sim.z.toFixed(1)}σ outlier
        </div>
        <div className="row" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <Slider label="bot win rate" val={botWR} set={setBotWR} min={45} max={90} fmt={(n) => n + "%"} />
          <Slider label="population" val={popN} set={setPopN} min={50} max={1000} step={50} fmt={(n) => String(n)} />
          <Slider label="games each" val={games} set={setGames} min={50} max={800} step={50} fmt={(n) => String(n)} />
          <Slider label="rake" val={rake} set={setRake} min={0} max={40} fmt={(n) => n + "%"} />
        </div>
      </div>
    </section>
  );
}
