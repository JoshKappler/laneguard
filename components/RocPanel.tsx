"use client";

import { useEffect, useRef } from "react";
import { CALIBRATION } from "@/lib/detect/thresholds";
import { DEFAULT_CONFIG } from "@/lib/core/config";
import { palette, setupCanvas, monoFont } from "@/lib/ui/chart-utils";

/*
 * Until a corpus exists there is no ROC to draw, but the brief's rule is that a
 * stated threshold must state how it was derived — so the empty state shows the
 * derivation of every live cut rather than an empty box and an apology.
 */
const D = DEFAULT_CONFIG.detector;
const PRIORS: { cut: string; value: string; basis: string }[] = [
  {
    cut: "reaction-time floor",
    value: `${D.reaction.floorMs} ms`,
    basis:
      "simple-RT literature puts the visual-motor floor near 200 ms; 130 ms sits below any plausible human and above a display-refresh artifact",
  },
  {
    cut: "jitter floor",
    value: `${D.kinematics.jitterNone} px`,
    basis:
      "a finger cannot trace a path this clean — below this is a generated curve, not a hand. Not fitted; the human side of the boundary is unmeasured",
  },
  {
    cut: "Δ⁴/Δ² whiteness",
    value: `${D.noise.whiteFlag}`,
    basis:
      "iid noise has a flat spectrum, so the 4th-difference / 2nd-difference energy ratio → 2.0 analytically. Band-limited motor noise falls below it; 2.0 is the theoretical value, not an empirical cut",
  },
  {
    cut: "replay shape duplicate",
    value: `${D.replay.shapeDupe}`,
    basis:
      "normalized-path distance at which two swipes are the same gesture. Chosen by eye against the bench's own replay attacker — the weakest-justified number here",
  },
  {
    cut: "SUSPECT / BOT cuts",
    value: `${D.cuts.human} / ${D.cuts.bot}`,
    basis:
      "tiering, not a measurement: one strong signal reviews, convergent signals act. Set so that acting requires corroboration, because acting withholds money",
  },
];

type FeatureInfo = {
  label: string;
  direction: string;
  target: string;
  auc?: number;
  threshold?: number;
  fpr?: number;
  tpr?: number;
  curve?: { fpr: number; tpr: number }[];
};

function RocMini({ f, name }: { f: FeatureInfo; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !f.curve) return;
    const S = 128;
    const g = setupCanvas(c, S, S);
    const p = palette();
    g.clearRect(0, 0, S, S);
    // diagonal reference (chance)
    g.strokeStyle = p.line; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(0, S); g.lineTo(S, 0); g.stroke(); g.setLineDash([]);
    // ROC curve (single hue)
    g.strokeStyle = p.accent; g.lineWidth = 2; g.beginPath();
    f.curve.forEach((pt, i) => {
      const x = pt.fpr * S, y = S - pt.tpr * S;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
    g.fillStyle = p.ink3; g.font = monoFont(9); g.textAlign = "left";
    g.fillText("AUC " + (f.auc ?? 0).toFixed(2), 4, 12);
  }, [f]);
  return (
    <div style={{ textAlign: "center" }}>
      <canvas ref={ref} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4 }} />
      <div className="mono tiny muted" style={{ marginTop: 3 }}>{name}</div>
    </div>
  );
}

function AucMatrix({ matrix }: { matrix: Record<string, Record<string, number>> }) {
  const feats = Object.keys(matrix);
  const cols = feats.length ? Object.keys(matrix[feats[0]]) : [];
  const cell = (v: number) => {
    if (Number.isNaN(v)) return { bg: "var(--surface-2)", fg: "var(--ink-3)", t: "—" };
    // sequential accent ramp by |auc-0.5| (separability), text stays ink
    const sep = Math.abs(v - 0.5) * 2;
    return { bg: `rgba(61,220,255,${(0.08 + sep * 0.5).toFixed(2)})`, fg: "var(--ink)", t: v.toFixed(2) };
  };
  return (
    <table className="mono" style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", color: "var(--ink-3)", padding: "3px 6px", fontWeight: 400 }}>feature \ attacker</th>
          {cols.map((c) => <th key={c} style={{ color: "var(--ink-3)", padding: "3px 6px", fontWeight: 400 }}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {feats.map((f) => (
          <tr key={f}>
            <td style={{ color: "var(--ink-2)", padding: "3px 6px" }}>{f}</td>
            {cols.map((c) => {
              const s = cell(matrix[f][c]);
              return <td key={c} style={{ background: s.bg, color: s.fg, textAlign: "center", padding: "3px 6px", border: "1px solid var(--bg)" }}>{s.t}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RocPanel() {
  const cal = CALIBRATION as unknown as {
    basis: string;
    humanCorpus: { swipes: number; subjects: string[] };
    fprTarget: number;
    perFeature: Record<string, FeatureInfo>;
    aucMatrix: Record<string, Record<string, number>>;
    note: string;
    generatedAt: string;
  };
  const calibrated = cal.basis === "calibrated";

  return (
    <section className="panel">
      <div className="hline">
        calibration + ROC{" "}
        <span className="dim">
          {calibrated
            ? `${cal.humanCorpus.swipes} human swipes · FPR ≤ ${(cal.fprTarget * 100).toFixed(2)}%`
            : "first-principles priors — no corpus yet"}
        </span>
      </div>
      <div className="panel-body">
        {!calibrated ? (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 320px", minWidth: 260, maxWidth: 460 }}>
              <p style={{ color: "var(--ink-2)", fontSize: 13, marginBottom: 12 }}>
                Every detector threshold is currently a first-principles prior, not a fitted value.
                To calibrate, record a real human swipe corpus with{" "}
                <span className="mono" style={{ color: "var(--accent)" }}>recorder/index.html</span>,
                drop the JSON in <span className="mono">corpus/</span>, and run{" "}
                <span className="mono" style={{ color: "var(--accent)" }}>pnpm calibrate</span>. This
                panel then shows a per-signal ROC/AUC against each attacker class and the thresholds
                chosen at FPR ≤ 0.1% — a false ban withholds a real player&apos;s money, so FPR is the
                budget being spent.
              </p>
              <div
                className="mono tiny"
                style={{ color: "var(--ink-3)", border: "1px dashed var(--line)", borderRadius: 4, padding: 12, background: "var(--bg)" }}
              >
                The pipeline is built and unit-tested (lib/detect/roc.ts, scripts/calibrate.ts). The
                AUC matrix it produces is designed to expose, not hide, that the evasive and stealth
                attackers are not separable on any swipe-level feature — that is the arms-race result,
                not a bug to tune away.
              </div>
            </div>
            <div style={{ flex: "2 1 460px", minWidth: 260 }}>
              <div className="mono tiny muted" style={{ marginBottom: 8 }}>
                what each live cut is derived from
              </div>
              <table className="mono" style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
                <tbody>
                  {PRIORS.map((r) => (
                    <tr key={r.cut} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ color: "var(--ink-2)", padding: "7px 10px 7px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>
                        {r.cut}
                      </td>
                      <td style={{ color: "var(--ink)", padding: "7px 14px 7px 0", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>
                        {r.value}
                      </td>
                      <td style={{ color: "var(--ink-3)", padding: "7px 0", lineHeight: 1.5 }}>{r.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
              {Object.entries(cal.perFeature)
                .filter(([, f]) => f.curve)
                .map(([name, f]) => <RocMini key={name} f={f} name={name} />)}
            </div>
            <div className="mono tiny muted" style={{ marginBottom: 6 }}>AUC matrix — feature × attacker class (0.5 = indistinguishable)</div>
            <AucMatrix matrix={cal.aucMatrix} />
            <div className="mono tiny muted" style={{ marginTop: 8, maxWidth: "70ch" }}>{cal.note}</div>
          </div>
        )}
      </div>
    </section>
  );
}
