"use client";

import type { BenchController } from "@/lib/ui/bench-controller";

/*
 * Every completed run as one cell: green banked, red crashed. The aggregate
 * line is what a long session (say 100 runs) nets out to.
 */
export function RunsPanel({ controller }: { controller: BenchController | null }) {
  const runs = controller?.runs ?? [];
  const cashed = runs.filter((r) => r.endKind === "cashout");
  const banked = cashed.reduce((s, r) => s + r.banked, 0);
  const forfeited = runs.reduce((s, r) => s + r.forfeited, 0);
  const avgScore = runs.length ? runs.reduce((s, r) => s + r.score, 0) / runs.length : 0;
  const shown = runs.slice(-200);

  return (
    <section className="panel">
      <div className="hline">
        runs{" "}
        <span className="dim">
          {runs.length
            ? `${runs.length} ended · ${cashed.length} cashed (${Math.round((cashed.length / runs.length) * 100)}%) · banked $${banked.toFixed(2)} · forfeited $${forfeited.toFixed(2)} · avg score ${avgScore.toFixed(0)}`
            : "none ended yet"}
        </span>
      </div>
      <div style={{ padding: 12 }}>
        {!runs.length && <div className="muted mono tiny">each run lands here as a cell when it ends</div>}
        {runs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {shown.map((r, i) => (
              <span
                key={runs.length - shown.length + i}
                title={
                  `run ${runs.length - shown.length + i + 1}: ` +
                  (r.endKind === "cashout"
                    ? `cashed out $${r.banked.toFixed(2)} (score ${r.score})`
                    : `crashed at score ${r.score}, $${r.forfeited.toFixed(2)} forfeited`)
                }
                style={{
                  width: 11,
                  height: 18,
                  borderRadius: 2,
                  background: r.endKind === "cashout" ? "var(--ok)" : "var(--bad)",
                  opacity: r.endKind === "cashout" ? 0.45 + Math.min(0.55, r.banked / 3) : 0.7,
                }}
              />
            ))}
          </div>
        )}
        {runs.length > shown.length && (
          <div className="mono tiny muted" style={{ marginTop: 6 }}>
            showing the last {shown.length} of {runs.length}
          </div>
        )}
      </div>
    </section>
  );
}
