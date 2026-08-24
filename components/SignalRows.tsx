"use client";

import type { BenchSnapshot } from "@/lib/ui/bench-controller";

const badgeClass = (v: string) =>
  v === "HUMAN" ? "human" : v === "SUSPECT" ? "suspect" : v === "BOT" ? "bot" : "na";

/*
 * The verdict, one line per signal: name · bar · sus% · evidence, every bar on
 * the same horizontal alignment. Bar length is the signal's suspicion in
 * [0,1]; grey = not enough samples yet, green/amber/red = below, near, or past
 * the escalation thresholds.
 */
export function SignalRows({ snap, detailWidth = 0 }: { snap: BenchSnapshot | null; detailWidth?: number }) {
  if (!snap) return <div className="muted mono tiny">booting bench…</div>;
  const verdict = snap.ready ? snap.verdict : "WARMING UP";
  const conf = Math.round(snap.overall * 100);
  const c = snap.counters;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="rowline" style={{ minHeight: 32 }}>
        <span className={"badge " + badgeClass(verdict)}>{verdict}</span>
        <span className="mono" style={{ fontSize: 12 }}>{conf}% conf</span>
        <span className="mono note" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
          dodges {c.dodges} · deaths {c.deaths} · swipes {c.swipes} · cars passed {c.rowsPassed} · runs {c.runEnds} ({c.cashouts} cashed)
        </span>
      </div>
      {snap.signals.map((s) => {
        const pct = Math.round(s.sus * 100);
        const color = !s.ready ? "var(--ink-4)" : s.sus < 0.33 ? "var(--ok)" : s.sus < 0.6 ? "var(--warn)" : "var(--bad)";
        return (
          <div key={s.name} className="rowline" style={{ minHeight: 22 }}>
            <span className="lbl" style={{ width: 118 }}>{s.name}</span>
            <span style={{ flex: "0 0 190px", height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: (s.ready ? pct : 0) + "%",
                  background: color,
                  transition: "width .3s, background .3s",
                }}
              />
            </span>
            <span className="mono" style={{ flex: "0 0 40px", textAlign: "right", fontSize: 11, color: s.ready ? "var(--ink-2)" : "var(--ink-4)" }}>
              {s.ready ? pct + "%" : "…"}
            </span>
            <span
              className="mono note"
              style={{
                flex: 1,
                minWidth: detailWidth,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={s.detail}
            >
              {s.detail}
            </span>
          </div>
        );
      })}
      {snap.flags.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {snap.flags.map((f, i) => (
            <div key={i} className="mono" style={{ color: "var(--bad)", fontSize: 11, lineHeight: 1.7 }}>
              ⚑ {f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
