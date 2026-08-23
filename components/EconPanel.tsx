"use client";

import { useEffect, useRef, useState } from "react";
import { palette, setupCanvas, monoFont } from "@/lib/ui/chart-utils";
import { simulatePopulation } from "@/lib/econ/population";
import { breakEven, evPerGame } from "@/lib/econ/economy";

export function EconPanel() {
  const popRef = useRef<HTMLCanvasElement>(null);
  const bankRef = useRef<HTMLCanvasElement>(null);
  const [botWR, setBotWR] = useState(70);
  const [popN, setPopN] = useState(400);
  const [games, setGames] = useState(300);
  const [rake, setRake] = useState(20);
  const entry = 5;

  const be = breakEven(entry, rake / 100);
  const sim = simulatePopulation({ nPlayers: popN, nGames: games, botWR: botWR / 100, band: 0.06, k: 1.15 });
  const evBot = evPerGame(botWR / 100, entry, rake / 100);
  const profitable = botWR / 100 > be;

  useEffect(() => {
    const p = palette();
    // population histogram
    const c = popRef.current;
    if (c) {
      const W = 470, H = 210;
      const g = setupCanvas(c, W, H);
      g.clearRect(0, 0, W, H);
      const lo = 0.25, hi = 0.95, bins = 56;
      const counts = new Array(bins).fill(0);
      for (const v of sim.rates) counts[Math.max(0, Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins)))]++;
      const cmax = Math.max(...counts, 1);
      const bw = (W - 16) / bins;
      const xOf = (v: number) => 8 + ((v - lo) / (hi - lo)) * (W - 16);
      for (let i = 0; i < bins; i++) {
        const h = (counts[i] / cmax) * (H - 44);
        const v = lo + ((i + 0.5) / bins) * (hi - lo);
        g.fillStyle = v >= be ? p.bad : p.accent; // above the rake wall = the profitable-bot zone (status)
        g.fillRect(8 + i * bw, H - 26 - h, Math.max(1, bw - 1), h);
      }
      g.strokeStyle = p.warn; g.lineWidth = 2; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(xOf(be), 12); g.lineTo(xOf(be), H - 26); g.stroke();
      g.setLineDash([]);
      g.fillStyle = p.warn; g.font = monoFont(10); g.textAlign = "center";
      g.fillText("rake wall " + (be * 100).toFixed(1) + "%", xOf(be), 10);
      g.strokeStyle = p.bad; g.lineWidth = 2;
      g.beginPath(); g.moveTo(xOf(botWR / 100), 12); g.lineTo(xOf(botWR / 100), H - 26); g.stroke();
      g.fillStyle = p.bad; g.fillText("BOT " + botWR + "%", xOf(botWR / 100), H - 14);
      g.fillStyle = p.ink3; g.textAlign = "left"; g.fillText("25%", 8, H - 4);
      g.textAlign = "right"; g.fillText("95%", W - 8, H - 4);
      g.textAlign = "left";
      g.fillText(`player win-rate distribution (n=${sim.rates.length}, ${games} games each)`, 8, 12);
    }
    // bankroll curves — 3 direct-labeled lines
    const c2 = bankRef.current;
    if (c2) {
      const W = 380, H = 210;
      const g = setupCanvas(c2, W, H);
      g.clearRect(0, 0, W, H);
      const series = [
        { p: botWR / 100, col: p.bad, label: "bot " + botWR + "%" },
        { p: be, col: p.warn, label: "break-even" },
        { p: sim.mean, col: p.accent, label: "median human" },
      ];
      const N = games;
      let ymin = 0, ymax = 0;
      for (const s of series) { const end = evPerGame(s.p, entry, rake / 100) * N; ymin = Math.min(ymin, end); ymax = Math.max(ymax, end); }
      const pad = Math.max(10, (ymax - ymin) * 0.1); ymin -= pad; ymax += pad;
      const yOf = (v: number) => H - 24 - ((v - ymin) / (ymax - ymin)) * (H - 40);
      g.strokeStyle = "rgba(154,164,176,0.25)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(8, yOf(0)); g.lineTo(W - 8, yOf(0)); g.stroke();
      for (const s of series) {
        g.strokeStyle = s.col; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const n = (i / 60) * N, x = 8 + (i / 60) * (W - 16);
          i ? g.lineTo(x, yOf(evPerGame(s.p, entry, rake / 100) * n)) : g.moveTo(x, yOf(evPerGame(s.p, entry, rake / 100) * n));
        }
        g.stroke();
        g.fillStyle = s.col; g.font = monoFont(10); g.textAlign = "right";
        g.fillText(`${s.label}  $${(evPerGame(s.p, entry, rake / 100) * N).toFixed(0)}`, W - 10, yOf(evPerGame(s.p, entry, rake / 100) * N) - 4);
      }
      g.fillStyle = p.ink3; g.textAlign = "left"; g.fillText(`expected bankroll over ${N} games ($${entry} entry)`, 8, 12);
    }
  }, [botWR, popN, games, rake, be, sim.mean, sim.rates, entry]);

  const rows: [string, string, boolean?][] = [
    ["entry / pot", `$${entry} / $${2 * entry}`],
    ["rake", `${rake}% ($${(2 * entry * (rake / 100)).toFixed(2)})`],
    ["winner nets", `+$${(2 * entry * (1 - rake / 100) - entry).toFixed(2)}`],
    ["loser nets", `-$${entry.toFixed(2)}`],
    ["break-even win rate", `${(be * 100).toFixed(1)} %`],
    ["bot win rate", `${botWR} %`, profitable],
    ["bot EV / game", `${evBot >= 0 ? "+" : ""}$${evBot.toFixed(2)}`, profitable],
    ["bot z-score", `${sim.z.toFixed(1)} σ`, sim.z > 4],
    ["percentile", `${sim.pctile.toFixed(2)} th`, sim.z > 4],
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
      <div className="panel-head">
        <h2>Server-side: economy &amp; population</h2>
        <span className="sub">${entry} head-to-head · {rake}% rake · break-even {(be * 100).toFixed(1)}%</span>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <canvas ref={popRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
          <canvas ref={bankRef} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
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
