"use client";

import { useEffect, useRef } from "react";
import type { BenchController } from "@/lib/ui/bench-controller";

const clsColor: Record<string, string> = {
  info: "var(--ink-3)",
  metric: "var(--series-2)",
  good: "var(--ok)",
  warn: "var(--warn)",
  flag: "var(--bad)",
};

function clock(ms: number) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return "T+" + String(m).padStart(2, "0") + ":" + (s % 60).toFixed(3).padStart(6, "0");
}

export function EventLog({
  controller,
  version,
  grow,
}: {
  controller: BenchController | null;
  version: number;
  /** absorb the column's leftover height instead of pinning a fixed one */
  grow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [version]);

  const entries = controller?.log ?? [];
  return (
    <section
      className="panel"
      style={grow ? { flex: 1, minHeight: 220, display: "flex", flexDirection: "column" } : undefined}
    >
      <div className="hline">event log <span className="dim">{controller?.clock() ?? ""}</span></div>
      <div
        className="panel-body"
        style={{
          padding: 0,
          // column, so the scroller's flex/height:0 works on the vertical axis
          ...(grow ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const } : {}),
          // the scroller cuts the topmost line mid-glyph; fade it out rather
          // than leaving a sliced row under the header
          maskImage: "linear-gradient(to bottom, transparent 0, #000 10px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 10px)",
        }}
      >
        <div
          ref={ref}
          className="mono"
          style={{
            // height:0 + grow, not minHeight:0 — otherwise the scroller's
            // content height leaks into intrinsic sizing and an auto grid row
            // resolves to the full length of the log
            ...(grow ? { flex: "1 1 0", height: 0 } : { height: 340 }),
            overflowY: "auto",
            fontSize: 11,
            lineHeight: 1.55,
            padding: "8px 12px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {entries.slice(-260).map((e, i) => (
            <div key={i} style={{ color: clsColor[e.cls] ?? "var(--ink-3)" }}>
              [{clock(e.t)}] {e.msg}
            </div>
          ))}
          {!entries.length && <div className="muted">log is empty</div>}
        </div>
      </div>
    </section>
  );
}
