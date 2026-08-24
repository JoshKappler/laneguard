"use client";

import { useEffect, useRef } from "react";
import type { BenchController } from "@/lib/ui/bench-controller";
import { palette, setupCanvas, monoFont, useContainerWidth } from "@/lib/ui/chart-utils";

/*
 * Detector confidence over the whole session, against the SUSPECT and BOT
 * cuts. This is the pass/fail picture for a long session: a setup "passes"
 * the anti-cheat if the line never enters the BOT band; time above the
 * SUSPECT cut is what a review queue would see.
 */
export function ConfTimeline({ controller, version }: { controller: BenchController | null; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = useContainerWidth(box, { min: 320, max: 1600 });
  const cuts = controller?.cfg.detector.cuts ?? { human: 0.33, bot: 0.58 };
  const hist = controller?.confHistory ?? [];
  const touches = controller?.tierTouches ?? { suspect: 0, bot: 0 };
  const peak = controller?.peakConf ?? 0;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const H = 120;
    const g = setupCanvas(cv, W, H);
    const p = palette();
    g.clearRect(0, 0, W, H);
    const yOf = (c: number) => H - 14 - c * (H - 26);
    // tier bands
    g.fillStyle = "rgba(240,85,94,0.07)";
    g.fillRect(0, 0, W, yOf(cuts.bot));
    g.fillStyle = "rgba(232,169,59,0.06)";
    g.fillRect(0, yOf(cuts.bot), W, yOf(cuts.human) - yOf(cuts.bot));
    for (const [cut, color, label] of [
      [cuts.bot, "rgba(240,85,94,0.55)", "BOT " + cuts.bot] as const,
      [cuts.human, "rgba(232,169,59,0.55)", "SUSPECT " + cuts.human] as const,
    ]) {
      g.strokeStyle = color;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(0, yOf(cut));
      g.lineTo(W, yOf(cut));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = color;
      g.font = monoFont(9);
      g.textAlign = "right";
      g.fillText(label, W - 4, yOf(cut) - 3);
    }
    if (!hist.length) {
      g.fillStyle = p.ink3;
      g.font = monoFont(10);
      g.textAlign = "center";
      g.fillText("confidence appears once the detector has samples", W / 2, H / 2);
      return;
    }
    const t0 = hist[0].t;
    const t1 = Math.max(hist[hist.length - 1].t, t0 + 1000);
    const xOf = (t: number) => 4 + ((t - t0) / (t1 - t0)) * (W - 60);
    g.strokeStyle = p.accent;
    g.lineWidth = 1.6;
    g.beginPath();
    hist.forEach((pt, i) => {
      const x = xOf(pt.t),
        y = yOf(pt.overall);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
    const last = hist[hist.length - 1];
    g.fillStyle = p.accent;
    g.beginPath();
    g.arc(xOf(last.t), yOf(last.overall), 2.5, 0, Math.PI * 2);
    g.fill();
    g.font = monoFont(10);
    g.textAlign = "left";
    g.fillText(Math.round(last.overall * 100) + "%", xOf(last.t) + 7, yOf(last.overall) + 3);
    g.fillStyle = p.ink3;
    g.textAlign = "left";
    g.fillText("T+" + Math.round(t0 / 1000) + "s", 4, H - 3);
    g.textAlign = "right";
    g.fillText("T+" + Math.round(t1 / 1000) + "s", W - 4, H - 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, W]);

  const passLine =
    touches.bot > 0
      ? "would be actioned: BOT reached, balance withheld"
      : touches.suspect > 0
        ? "never actioned; SUSPECT queued a review " + touches.suspect + "x"
        : "passes: never flagged";

  return (
    <section className="panel">
      <div className="hline">
        vs the anti-cheat{" "}
        <span className="dim">
          {passLine} · peak conf {Math.round(peak * 100)}% · SUSPECT touches {touches.suspect} · BOT touches {touches.bot}
        </span>
      </div>
      <div style={{ padding: 12 }} ref={box}>
        <canvas ref={ref} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4, maxWidth: "100%" }} />
      </div>
    </section>
  );
}
