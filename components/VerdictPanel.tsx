"use client";

import type { BenchSnapshot } from "@/lib/ui/bench-controller";

const badgeClass = (v: string) =>
  v === "HUMAN" ? "human" : v === "SUSPECT" ? "suspect" : v === "BOT" ? "bot" : "na";

function SignalBar({ s }: { s: BenchSnapshot["signals"][number] }) {
  const pct = Math.round(s.sus * 100);
  const color = !s.ready
    ? "var(--ink-4)"
    : s.sus < 0.33
      ? "var(--ok)"
      : s.sus < 0.6
        ? "var(--warn)"
        : "var(--bad)";
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 12 }}>{s.name}</span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {s.ready ? pct + "% sus" : "…"}
        </span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: (s.ready ? pct : 0) + "%",
            background: color,
            borderRadius: 3,
            transition: "width .3s, background .3s",
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, minHeight: 13 }}>{s.detail}</div>
    </div>
  );
}

export function VerdictPanel({ snap }: { snap: BenchSnapshot | null }) {
  const verdict = snap?.ready ? snap.verdict : "WARMING UP";
  const conf = snap ? Math.round(snap.overall * 100) : 0;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Anti-cheat verdict</h2>
        <span className="mono sub">{snap ? conf + "% conf" : ""}</span>
      </div>
      <div className="panel-body">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-panel)",
            background: "var(--bg)",
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>session assessment</span>
          <span className={"badge " + badgeClass(verdict)}>{verdict}</span>
        </div>

        {snap?.signals.map((s) => <SignalBar key={s.name} s={s} />)}

        {snap && snap.flags.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {snap.flags.map((f, i) => (
              <div key={i} style={{ color: "var(--bad)", fontSize: 11, marginBottom: 3 }}>
                ⚑ {f}
              </div>
            ))}
          </div>
        )}

        {snap && (
          <div
            className="mono"
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid var(--line)",
              color: "var(--ink-3)",
              fontSize: 11,
              lineHeight: 1.7,
            }}
          >
            dodges {snap.counters.dodges} · deaths {snap.counters.deaths} · swipes{" "}
            {snap.counters.swipes} · cars passed {snap.counters.rowsPassed} · runs{" "}
            {snap.counters.runEnds} ({snap.counters.cashouts} cashed) · conf {conf}%
          </div>
        )}
      </div>
    </section>
  );
}
