"use client";

import { useEffect, useRef } from "react";
import type { TracePoint } from "@/lib/attack/bot";
import type { BenchConfig, DeepPartial } from "@/lib/core/config";

const W = 250;
const H = 470;

/*
 * A phone screen that records real human swipes for the replay-farm corpus.
 * Traces are stored direction-normalized and start-relative (the bot replays
 * them from wherever its finger lands), localStorage only — never the URL.
 */
export function RecorderPhone({
  corpus,
  config,
  onTrace,
  onClear,
  onPatch,
}: {
  corpus: TracePoint[][];
  config: BenchConfig;
  onTrace: (t: TracePoint[]) => void;
  onClear: () => void;
  onPatch: (p: DeepPartial<BenchConfig>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ pts: TracePoint[]; t0: number } | null>(null);

  const redraw = () => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#0b0c0e";
    g.fillRect(0, 0, W, H);
    // stored traces, re-anchored down the screen
    corpus.slice(-10).forEach((t, i) => {
      const ax = 55,
        ay = 60 + ((i * 47) % (H - 120));
      g.strokeStyle = "rgba(154,164,176,0.4)";
      g.lineWidth = 2;
      g.beginPath();
      t.forEach((p, j) => (j ? g.lineTo(ax + p.x, ay + p.y) : g.moveTo(ax + p.x, ay + p.y)));
      g.stroke();
    });
    const lv = live.current;
    if (lv && lv.pts.length > 1) {
      g.strokeStyle = "#3ddcff";
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      lv.pts.forEach((p, j) => (j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    if (!corpus.length && !lv) {
      g.fillStyle = "rgba(154,164,176,0.7)";
      g.font = "12px var(--font-mono), monospace";
      g.textAlign = "center";
      g.fillText("swipe here to record", W / 2, H / 2);
    }
  };

  useEffect(redraw);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const pos = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      const p = pos(e);
      live.current = { pts: [{ x: p.x, y: p.y, t: 0 }], t0: performance.now() };
    };
    const move = (e: PointerEvent) => {
      const lv = live.current;
      if (!lv) return;
      const p = pos(e);
      lv.pts.push({ x: p.x, y: p.y, t: performance.now() - lv.t0 });
      redraw();
    };
    const up = () => {
      const lv = live.current;
      live.current = null;
      if (!lv || lv.pts.length < 5) return redraw();
      const a = lv.pts[0];
      const dx = lv.pts[lv.pts.length - 1].x - a.x;
      if (Math.abs(dx) < 25) return redraw();
      const mirror = dx < 0 ? -1 : 1;
      onTrace(lv.pts.map((p) => ({ x: (p.x - a.x) * mirror, y: p.y - a.y, t: p.t })));
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpus.length]);

  return (
    <section className="panel" style={{ width: W + 28 }}>
      <div className="hline">
        record swipes <span className="dim">{corpus.length ? corpus.length + " recorded" : "none yet"}</span>
      </div>
      <div style={{ padding: 14 }} className="col">
        <canvas
          ref={ref}
          width={W}
          height={H}
          style={{ border: "1px solid var(--line)", borderRadius: 14, touchAction: "none", display: "block" }}
        />
        <div className="rowline" style={{ marginTop: 8 }}>
          <span className="lbl" style={{ width: 60 }}>mutate</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <span className="note">±px</span>
            <input
              type="number"
              value={config.bot.mirror.perturbPx}
              step={0.1}
              style={{ width: 46 }}
              onChange={(e) => onPatch({ bot: { mirror: { perturbPx: +e.target.value || 0 } } })}
            />
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <span className="note">scale ±</span>
            <input
              type="number"
              value={config.bot.mirror.scaleVar}
              step={0.01}
              style={{ width: 50 }}
              onChange={(e) => onPatch({ bot: { mirror: { scaleVar: +e.target.value || 0 } } })}
            />
          </span>
        </div>
        <div className="rowline">
          <label className="toggle">
            <input
              type="checkbox"
              checked={config.bot.mirror.useRecorded}
              disabled={!corpus.length}
              onChange={(e) => onPatch({ bot: { mirror: { useRecorded: e.target.checked } } })}
            />
            replay farm drives these traces
          </label>
          <button onClick={onClear} disabled={!corpus.length} style={{ marginLeft: "auto" }}>
            clear
          </button>
        </div>
      </div>
    </section>
  );
}
