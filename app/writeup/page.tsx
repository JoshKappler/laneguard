import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LaneGuard — analysis",
  description:
    "How a real-money mobile skill game gets attacked, what a client-side behavioral detector can and cannot catch, and why the economics bind a bot.",
};

const serif = { fontFamily: "var(--font-serif)" };

function H({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 26, marginTop: 48, marginBottom: 14, letterSpacing: "-0.02em" }}>
      <span className="mono" style={{ color: "var(--accent)", fontSize: 14, marginRight: 10 }}>{n}</span>
      {children}
    </h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ ...serif, fontSize: 17, lineHeight: 1.7, color: "var(--ink)", margin: "0 0 16px", maxWidth: "68ch" }}>{children}</p>;
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...serif, fontSize: 15, lineHeight: 1.65, color: "var(--ink-2)", borderLeft: "2px solid var(--accent)", paddingLeft: 16, margin: "0 0 20px", maxWidth: "66ch" }}>
      {children}
    </div>
  );
}

function Table({ head, rows, hot }: { head: string[]; rows: (string | number)[][]; hot?: (r: number, c: number) => boolean }) {
  return (
    <div style={{ overflowX: "auto", margin: "0 0 22px" }}>
      <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%", minWidth: 420 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? "left" : "right", color: "var(--ink-3)", fontWeight: 500, padding: "6px 10px", borderBottom: "1px solid var(--line-strong)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} style={{ textAlign: ci === 0 ? "left" : "right", padding: "5px 10px", borderBottom: "1px solid var(--line)", color: hot?.(ri, ci) ? "var(--bad)" : ci === 0 ? "var(--ink-2)" : "var(--ink)" }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Writeup() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 96px" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <Link href="/" className="mono" style={{ fontSize: 12 }}>← bench</Link>
        <span className="eyebrow">Analysis</span>
      </div>
      <h1 style={{ fontSize: 40, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "8px 0 12px" }}>
        Behavioral anti-cheat for a skill-money lane game
      </h1>
      <P>
        An analysis of how a real-money mobile skill game gets attacked, what a client-side
        behavioral detector can and cannot catch, and why the economics — not the motor forensics —
        are what actually bind a bot.
      </P>
      <Note>
        <strong>Scope and honesty.</strong> The game here is an <em>original simulation</em> built
        from public App Store screenshots of the &ldquo;Drive&rdquo; game in the Triumph Arcade app.
        Nothing in this project reverse-engineers, decompiles, inspects, or runs against Triumph&apos;s
        real app or servers, and nothing here is usable as a cheat against it. Every number below is
        produced by code in this repo that actually ran (<span className="mono">pnpm batch</span>).
        Thresholds that are first-principles priors rather than values fitted to measured data are
        labeled as such.
      </Note>

      <H n="01">Threat model</H>
      <P>
        A head-to-head skill game paying real money is attacked by a ladder of adversaries, cheapest
        first. Each rung costs the attacker more and defeats more of the defense.
      </P>
      <Table
        head={["tier", "capability", "what it beats"]}
        rows={[
          ["T0 scripted", "reads state, perfect inputs", "nothing subtle — but ~90% of attempts"],
          ["T1 replay", "records + replays human swipes", "jitter / kinematics"],
          ["T2 generative", "fresh synthetic swipe per dodge", "replay similarity"],
          ["T2+ organic", "models human motor-noise structure", "every swipe-level forensic"],
          ["T3 stealth", "organic + gated ex-Gaussian RT + imperfect play", "the whole client detector"],
          ["T4 farm / collusion", "many accounts, shared corpus, feeding wins", "within-account analysis"],
        ]}
      />
      <P>
        The defender&apos;s constraint is asymmetric: a false positive withholds a real player&apos;s cash
        balance. That makes false-positive rate the budget every threshold is spent against — and it
        is why the strongest conclusion here needs no per-player forensics at all.
      </P>

      <H n="02">The arms race, measured</H>
      <P>
        The honest headline is that a competent attacker beats the entire client-side detector, and
        the bench demonstrates it rather than hiding it. An anti-cheat pitch that overclaims is worse
        than useless to a team that has thought about this problem longer than we have. Each attacker,
        180&nbsp;s across 12 seeds:
      </P>
      <Table
        head={["attacker", "verdict", "conf", "t→BOT", "jitter", "Δ⁴/Δ²", "RT floor"]}
        rows={[
          ["naive scripted", "BOT 100%", "0.75", "30 s", "0.00", "0.00", "150 ms"],
          ["replay farm (injected)", "BOT 100%", "0.75", "52 s", "1.82", "2.29", "260 ms"],
          ["evasive generative", "BOT 17%", "0.33", "80 s", "1.65", "1.76", "236 ms"],
          ["stealth camouflage", "HUMAN", "0.09", "never", "1.62", "1.77", "274 ms"],
        ]}
        hot={(r, c) => r === 3 && c === 1}
      />
      <P>
        The evasive generative bot defeats every swipe-level motor-forensics signal by modeling human
        motor noise correctly — pink 1/f noise, an 8–12&nbsp;Hz physiological tremor, and low-frequency
        drift — instead of the spectrally-white iid noise a naive bot injects:
      </P>
      <Table
        head={["noise model", "Δ⁴/Δ² whiteness", "caught by motor forensics?"]}
        rows={[
          ["iid Gaussian (naive)", "2.21", "yes — injected noise is white"],
          ["pink + tremor + drift (organic)", "1.76", "no — looks like a human hand"],
        ]}
        hot={(r, c) => r === 1 && c === 2}
      />
      <P>
        The evasive bot still trips <em>behavior texture</em> over a few minutes (it never enters
        contested space), so it flags on 17% of seeds by 180&nbsp;s. The stealth rung closes that gap:
        it enters contested space on purpose and sometimes genuinely crashes for it, fakes aborted
        gestures, and gates its reaction times to threat onset with an ex-Gaussian sampler that has a
        real lapse tail. It reads HUMAN, confidence 0.09, and never flags as BOT across ten minutes
        and three seeds. That is the ceiling of client-side behavioral detection.
      </P>

      <H n="03">The seven signals</H>
      <P>
        Each signal has a physical rationale and catches a specific tier. Thresholds are
        first-principles priors until fitted to a human corpus at a stated FPR (§05).
      </P>
      <ul style={{ ...serif, fontSize: 16, lineHeight: 1.7, color: "var(--ink)", maxWidth: "68ch", paddingLeft: 22, marginBottom: 16 }}>
        <li><strong>Reaction time</strong> — human RT is ex-Gaussian (a floor plus a heavy lapse tail); scripted play has a superhuman floor and a naive sampler is symmetric. <em>Catches T0.</em></li>
        <li><strong>Swipe kinematics</strong> — motor-noise magnitude; clean synthetic swipes have jitter ≈ 0. <em>Catches T0.</em></li>
        <li><strong>Noise character</strong> — Δ⁴/Δ² spectral whiteness; injected iid noise is white, human tremor is not. <em>Catches T2 iid; defeated by T2+ organic.</em></li>
        <li><strong>Replay similarity</strong> — near-duplicate swipes in shape and timing. <em>Catches T1.</em></li>
        <li><strong>Perfection</strong> — dodge-margin consistency and survival humans don&apos;t produce.</li>
        <li><strong>Behavior texture</strong> — aborts, entering contested space and paying for it, banking runs. <em>Catches T2+; defeated by T3.</em></li>
        <li><strong>Event integrity</strong> — synthetic-event provenance; corroborating only, zero under hardware injection.</li>
      </ul>
      <P>
        Aggregation is a weighted blend with escalation, so one smoking gun or several independent
        suspicions override the average. Enforcement is tiered: one strong signal → SUSPECT (review);
        convergent independent signals → BOT (act), because acting withholds money.
      </P>

      <H n="04">Why the economy is the real detector</H>
      <P>
        With a $5 entry, a $10 pot, and a 20% rake, the winner nets +$3 and the loser −$5. Break-even
        win rate is <span className="mono">3p − 5(1−p) = 0 → p = 62.5%</span>. A skill-matched
        population (opponents from a narrow band of the skill ladder, the way head-to-head seeding
        works) shows observed win rates with mean 50.0% and sd 3.8&nbsp;pp over 300 games each, against
        a binomial noise floor of 2.9&nbsp;pp. Sweeping the bot&apos;s win rate against it:
      </P>
      <Table
        head={["bot win rate", "EV / game", "z-score", "percentile"]}
        rows={[
          ["55%", "−$0.60", "1.3σ", "93.5 (loses money)"],
          ["60%", "−$0.20", "2.6σ", "99.25"],
          ["62.5%", "$0.00", "3.3σ", "99.5 (break-even)"],
          ["65%", "+$0.20", "3.9σ", "99.75"],
          ["70%", "+$0.60", "5.2σ", "99.75"],
          ["80%", "+$1.40", "7.8σ", "100"],
        ]}
        hot={(r) => r === 2}
      />
      <P>
        There is no profitable-and-hidden zone. The instant a bot clears the rake wall it is already a
        &gt; 3σ outlier, and every extra dollar pushes it further out; throttling the win rate to look
        human pushes it below break-even. This survives the T3 attacker that defeats every forensic
        signal, because it is enforced by the rake, not by forensics — the one thing an attacker cannot
        fake without giving up the profit motive. The design corollary: rank accounts by win-rate
        z-score against the population, then use the behavioral signals as corroboration before acting.
        That ordering keeps false-positive bans near zero.
      </P>
      <P>
        Session cadence is a cheap filter, not a defense. A naive 24/7 farm (13,438 games/wk, gap cv
        0.03, no sleep block) is trivially caught, but a scheduled bot mimicking a circadian curve and
        log-normal gaps (371 games/wk, cv 0.52, 23.6&nbsp;h longest idle) passes every cadence check.
        Mimicking a human schedule costs an attacker only throughput; only the economy binds the win
        rate.
      </P>

      <H n="05">Calibration, and its current state</H>
      <P>
        Every threshold is a prior until fitted to data. The pipeline (<span className="mono">pnpm calibrate</span>)
        loads a real human swipe corpus as the negative class, runs each attacker as the positive
        class, computes an ROC/AUC per feature, and picks each threshold at FPR ≤ 0.1% — because a
        false ban costs a real player. Its AUC matrix is built to expose, not hide, that the evasive
        and stealth attackers are not separable from humans on any swipe-level feature. The pipeline is
        built and unit-tested; no human corpus has been recorded yet, so the shipped thresholds remain
        priors and the bench labels them as such. This is the one open acceptance item.
      </P>

      <H n="06">What production needs that this cannot have</H>
      <ul style={{ ...serif, fontSize: 16, lineHeight: 1.7, color: "var(--ink)", maxWidth: "68ch", paddingLeft: 22, marginBottom: 16 }}>
        <li>Native touch-stack data — pressure, touch-major/minor, true hardware timestamps.</li>
        <li>Device attestation (Play Integrity / App Attest) to make OS-level injection expensive.</li>
        <li>Cross-account behavioral fingerprinting — a farm&apos;s accounts share swipe-shape structure.</li>
        <li>Payout-graph / collusion analysis — repeat-pairing far above matchmaking expectation.</li>
        <li>Server-authoritative game state — validate submitted runs against the deterministic engine.</li>
      </ul>

      <H n="07">Limitations</H>
      <P>
        No human corpus yet, so the ROC/AUC and FPR-calibrated cuts are unpopulated. The detector is
        demonstrated client-side (the design is server-side). The population and cadence models are
        simulations parameterized by plausible priors, not fitted to Triumph&apos;s real distribution —
        they argue a structural point robust to the parameters, but the specific percentiles would move
        on real data. The stealth attacker is a model, not a captured real-world bot; a real one would
        face device attestation this bench does not simulate. Collusion and farm fingerprinting are
        described, not built.
      </P>

      <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <Link href="/" className="mono" style={{ fontSize: 12 }}>← back to the bench</Link>
      </div>
    </main>
  );
}
