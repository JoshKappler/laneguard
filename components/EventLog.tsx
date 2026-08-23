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

export function EventLog({ controller, version }: { controller: BenchController | null; version: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [version]);

  const entries = controller?.log ?? [];
  return (
    <section className="panel">
      <div className="panel-head"><h2>Event log</h2><span className="mono sub">{controller?.clock() ?? ""}</span></div>
      <div className="panel-body" style={{ padding: 0 }}>
        <div
          ref={ref}
          className="mono"
          style={{
            height: 340,
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
