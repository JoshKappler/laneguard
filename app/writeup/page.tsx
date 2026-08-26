import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "LaneGuard analysis",
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
function P({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <p
      style={{
        ...serif,
        fontSize: dim ? 14.5 : 17,
        lineHeight: dim ? 1.6 : 1.7,
        color: dim ? "var(--ink-3)" : "var(--ink)",
        margin: dim ? "-8px 0 20px" : "0 0 16px",
        maxWidth: "68ch",
      }}
    >
      {children}
    </p>
  );
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
              <th key={i} style={{ textAlign: i === 0 ? "left" : "right", color: "var(--ink-3)", fontWeight: 500, padding: "6px 10px", borderBottom: "1px solid var(--line-strong)", whiteSpace: "nowrap" }}>{h}</th>
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
    <main style={{ maxWidth: 1500, margin: "0 auto", padding: "0 16px 16px" }}>
      <NavBar page="writeup" />
      <article style={{ maxWidth: 860, margin: "0 auto", padding: "24px 8px 96px" }}>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <span className="eyebrow">Analysis</span>
      </div>
      <h1 style={{ fontSize: 40, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "8px 0 12px" }}>
        Behavioral anti-cheat for a skill-money lane game
      </h1>
      <P>
        An analysis of how a real-money mobile skill game gets attacked, what a client-side
        behavioral detector can and cannot catch, and why the economics, not the motor forensics,
        are what actually bind a bot.
      </P>
      <Note>
        <strong>Scope.</strong> The game here is an <em>original simulation</em>, frame-fitted
        to a screen recording of one full session of the shipped &ldquo;Drive&rdquo; game played
        on my own phone, plus my own screenshots and Triumph&apos;s public marketing and App Store
        images: projection, speed ramp, traffic mix, lane-change dynamics, scoring, and the dollar
        payout curve are measured, not guessed.
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
          ["T0 scripted", "reads state, perfect inputs", "nothing subtle, but ~90% of attempts"],
          ["T1 replay", "records + replays human swipes", "jitter / kinematics"],
          ["T2 generative", "fresh synthetic swipe per dodge", "replay similarity"],
          ["T2+ organic", "models human motor-noise structure", "every swipe-level forensic"],
          ["T3 stealth", "organic + gated ex-Gaussian RT + imperfect play", "the whole client detector"],
          ["T4 farm / collusion", "many accounts, shared corpus, feeding wins", "within-account analysis"],
        ]}
      />
      <P>
        The defender&apos;s constraint is asymmetric: a false positive withholds a real player&apos;s cash
        balance. That makes false-positive rate the budget every threshold is spent against. It is
        also why the strongest conclusion here needs no per-player forensics at all.
      </P>

      <figure style={{ margin: "36px 0 8px" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Reference vs. simulation</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[
            { ref: "ref-start.png", ours: "ours-start.png", label: "start screen" },
            { ref: "ref-gameplay.png", ours: "ours-gameplay.png", label: "gameplay + HUD" },
          ].map((pair) => (
            <div key={pair.label}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}>
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/compare/${pair.ref}`} alt={`Triumph Drive ${pair.label} reference`} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--line)", display: "block" }} />
                  <div className="mono tiny muted" style={{ marginTop: 4, textAlign: "center" }}>reference</div>
                </div>
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/compare/${pair.ours}`} alt={`LaneGuard ${pair.label} render`} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--line)", display: "block" }} />
                  <div className="mono tiny" style={{ marginTop: 4, textAlign: "center", color: "var(--accent)" }}>mine</div>
                </div>
              </div>
              <div className="mono tiny muted" style={{ marginTop: 6, textAlign: "center" }}>{pair.label}</div>
            </div>
          ))}
        </div>
        <figcaption style={{ ...serif, fontSize: 14, color: "var(--ink-2)", marginTop: 14, maxWidth: "70ch" }}>
          The simulation is fitted to my own captures of the shipped game (left of each pair): the
          rainbow lane, the rotated green CASHOUT lettering, cartoon cars with a consistent light
          source, the HUD, and, from a frame-by-frame pass over a full recorded session, the speed
          ramp, traffic behavior, lane-change dynamics, scoring rate, and payout curve. It models
          the visual and physical feel that makes the behavioral signals meaningful. It is not a
          clone of the product and had no access to one. Full provenance in{" "}
          <span className="mono">references/MANIFEST.md</span>.
        </figcaption>
      </figure>

      <H n="02">Attacker vs detector, measured</H>
      <P>
        The main result: a competent attacker is never actioned by the client-side detector,
        and the bench demonstrates it. An anti-cheat pitch that overclaims is useless to a team
        that has thought about this problem longer than we have. The result below is neither
        &ldquo;the bot is invisible&rdquo; nor
        &ldquo;the detector wins&rdquo;. Each attacker ran 180&nbsp;s across 12 seeds. The verdict
        at the final tick and whether a tier was <em>ever</em> reached are different numbers; the
        second is the one enforcement acts on.
      </P>
      <Table
        head={["attacker", "verdict @180s", "ever SUSP", "ever BOT", "conf", "t→BOT", "jitter", "Δ⁴/Δ²", "RT floor"]}
        rows={[
          ["naive scripted", "BOT 100%", "0/12", "12/12", "0.75", "12 s", "0.00", "0.00", "125 ms"],
          ["replay farm (injected)", "BOT 100%", "0/12", "12/12", "0.75", "19 s", "1.82", "2.27", "61 ms"],
          ["evasive generative", "BOT 42%", "7/12", "9/12", "0.55", "63 s *", "1.64", "1.77", "74 ms"],
          ["stealth camouflage", "HUMAN 12/12", "0/12", "0/12", "0.08", "never", "1.63", "1.75", "239 ms"],
          ["route planner", "HUMAN 12/12", "3/12", "2/12", "0.10", "97 s", "1.64", "1.74", "187 ms"],
          ["modeled humans (control)", "HUMAN 24/24", "1/24", "0/24", "0.09", "never", "1.63", "1.75", "233 ms"],
        ]}
        hot={(r, c) => (r === 3 || r === 4) && c === 3}
      />
      <P dim>
        * median over the nine seeds that reached BOT at all, not over all twelve. The evasive bot
        touches BOT on nine of twelve seeds; reading the final verdict alone
        understates the detector. The stealth bot never touches SUSPECT or BOT on any seed. The
        route planner touches BOT on two seeds and decays back, at a mean confidence of 0.10
        against 0.09 for the human control, so the scalar the detector thresholds does not
        separate it from a real player.
        The replay row runs against the synthesized corpus, capped at 8 distinct traces, which
        keeps replay similarity saturated; replaying a large corpus of real recorded swipes
        starves that signal and is not measured here.
      </P>
      <P>
        The evasive generative bot defeats every swipe-level motor-forensics signal by modeling human
        motor noise correctly (pink 1/f noise, an 8-12&nbsp;Hz physiological tremor, and low-frequency
        drift) instead of the spectrally white iid noise a naive bot injects:
      </P>
      <Table
        head={["noise model", "Δ⁴/Δ² whiteness", "caught by motor forensics?"]}
        rows={[
          ["iid Gaussian (naive)", "2.21", "yes: injected noise is white"],
          ["pink + tremor + drift (organic)", "1.76", "no: looks like a human hand"],
        ]}
        hot={(r, c) => r === 1 && c === 2}
      />
      <P>
        The evasive bot still trips the <em>reaction-time floor</em>: with no RT model, a planner
        fires the instant a plan forms, and in dense traffic that gets credited sub-100&nbsp;ms
        &ldquo;reactions&rdquo; no human hand produces. The stealth rung closes that gap: it gates
        its reaction times to threat onset with an ex-Gaussian sampler that has a real lapse tail,
        enters contested space on purpose and sometimes genuinely crashes for it, and fakes
        aborted gestures.
      </P>
      <P>
        Three minutes is not long enough to separate those two attackers, so run both out to{" "}
        <strong>10 minutes across 12 seeds</strong> and compare them on equal terms:
      </P>
      <Table
        head={["attacker", "verdict @600s", "ever SUSP", "ever BOT", "conf", "t→BOT"]}
        rows={[
          ["evasive generative", "BOT 33%", "12/12", "9/12", "0.54", "63 s"],
          ["route planner", "HUMAN 12/12", "3/12", "2/12", "0.08", "97 s"],
          ["stealth camouflage", "HUMAN 12/12", "0/12", "0/12", "0.05", "never"],
        ]}
        hot={(r, c) => r === 2 && c === 3}
      />
      <P>
        This is the result worth reading. The detector gets the evasive bot inside a minute (a
        median 63&nbsp;s to the first BOT touch) and never lets go: every seed
        escalates and confidence parks at 0.54 for as long as the session runs, because the
        impossible-RT artifact keeps recurring. The stealth rung breaks that trend. It sits at
        0/12 ever-SUSPECT and 0/12 ever-BOT however long the session runs, with confidence flat
        at 0.05, because the session-level signals need volume and this attacker supplies
        human-shaped volume. The route planner gains no new exposure from the extra seven
        minutes either: the same two seeds touch BOT, and confidence falls to 0.08 as the
        longer session dilutes them. Below T3, time is the defender&apos;s ally; at T3 and above
        it stops helping.
      </P>
      <P>
        The wider 40-seed sweep separates the top two rungs, and twelve seeds had been hiding
        the difference. Stealth camouflage keeps its clean sheet: 1 of 40 brushes SUSPECT, 0 of
        40 ever reach BOT, mean confidence 0.08. The route planner does not: it reaches BOT on
        4 seeds, ends BOT on 1, and reads 0.12 against 0.09 for the modeled human control.
        &ldquo;Invisible&rdquo; was never the claim and is now measurably false for the planner.
        The precise statement is narrower and more interesting: the detector almost never gets
        enough to act on, and the rung that makes money is the rung it catches most. That is the
        ceiling of client-side behavioral detection.
      </P>
      <P>
        There is a harder version of the problem, and it is the one worth planning against.
        Every attacker above is a one-step dodger: it reads what threatens it now and picks a
        lane that is clear now. That is why all of them <em>lose money</em>. They survive a
        median 26 to 30&nbsp;s, and a forfeited run costs the full $3.01 entry however high the
        score climbed. A convincing disguise on a losing player is not yet a business.
      </P>
      <P>
        The <strong>route planner</strong> changes the planner instead of the disguise. Each
        decision extrapolates every on-screen car and barrier about six seconds forward and
        searches lane routes for one that survives with enough margin that its own humanized
        execution, the reaction-time tail and the gesture wander, cannot turn a planned move
        into a crash. The injected human error stays exactly where it was; it is what the
        detector measures, and it is no longer load-bearing on the road. Measured on 240
        holdout courses whose seeds it was never tuned against:
      </P>
      <Table
        head={["attacker", "banks", "avg bank", "solo net", "win rate", "EV per game"]}
        rows={[
          ["evasive generative", "1.7%", "$1.92", "-$2.98", "36.5%", "-$1.25"],
          ["stealth camouflage", "33.8%", "$0.60", "-$2.81", "55.9%", "-$0.32"],
          ["route planner", "45.8%", "$5.41", "-$0.53", "66.9%", "+$0.21"],
        ]}
        hot={(r, c) => r === 2 && (c === 4 || c === 5)}
      />
      <P>
        Read the last two columns. Solo play loses money for every attacker here and for the
        modeled humans too, because the payout curve pays a flat 1.289x from 5,582 to 8,497 and
        only reaches its 2.5x cap at 10,000: a run has to survive almost to the plateau before
        the $3.01 entry comes back. That is the game&apos;s economics, not an attacker weakness.
        The mode that pays is the one the game runs, a 1v1 pot with a 20% rake, where break-even
        is a 62.5% win rate. Only the planner clears it, at 66.9% over 1,440 shared-course
        pairings, worth +$0.21 a game, and it does so while reading HUMAN and never reaching BOT
        on any seed.
      </P>
      <P>
        The margin is thin, which is what makes the throw dial interesting. A bot that banks
        every run it can is detectable on win rate alone, whatever its input texture looks like,
        so <code>throwRate</code> sets the share of runs it loses on purpose: it picks a score in
        advance and stops dodging there, which reads as a missed turn. At 0.15 the win rate
        falls to 64.2% and EV to +$0.08; at 0.30 it is 58.4% and -$0.20. Camouflage is bought
        with EV, and the dial can only lower the win rate, never raise it.
      </P>

      <H n="03">The seven signals</H>
      <P>
        Each signal has a physical rationale and catches a specific tier. Thresholds are
        first-principles priors until fitted to a human corpus at a stated FPR (§05).
      </P>
      <ul style={{ ...serif, fontSize: 16, lineHeight: 1.7, color: "var(--ink)", maxWidth: "68ch", paddingLeft: 22, marginBottom: 16 }}>
        <li><strong>Reaction time</strong>: human RT is ex-Gaussian (a floor plus a heavy lapse tail); scripted play has a superhuman floor and a naive sampler is symmetric. <em>Catches T0.</em></li>
        <li><strong>Swipe kinematics</strong>: motor-noise magnitude; clean synthetic swipes have jitter ≈ 0. <em>Catches T0.</em></li>
        <li><strong>Noise character</strong>: Δ⁴/Δ² spectral whiteness; injected iid noise is white, human tremor is not. <em>Catches T2 iid; defeated by T2+ organic.</em></li>
        <li><strong>Replay similarity</strong>: near-duplicate swipes in shape and timing. <em>Catches T1.</em></li>
        <li><strong>Perfection</strong>: dodge-margin consistency and survival humans don&apos;t produce.</li>
        <li><strong>Behavior texture</strong>: aborts, entering contested space and paying for it, banking runs. <em>Catches T2+; defeated by T3.</em></li>
        <li><strong>Event integrity</strong>: synthetic-event provenance; corroborating only, zero under hardware injection.</li>
      </ul>
      <P>
        Aggregation is a weighted blend with escalation, so one smoking gun or several independent
        suspicions override the average. Enforcement is tiered: one strong signal queues a SUSPECT
        review, and convergent independent signals act as BOT, because acting withholds money.
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
        head={["bot win rate", "EV / game", "z-score", "players at or above (of 400)"]}
        rows={[
          ["55%", "−$0.60", "1.3σ", "26 (loses money)"],
          ["60%", "−$0.20", "2.6σ", "3"],
          ["62.5%", "$0.00", "3.3σ", "2 (break-even)"],
          ["65%", "+$0.20", "3.9σ", "1"],
          ["70%", "+$0.60", "5.2σ", "1"],
          ["80%", "+$1.40", "7.8σ", "0"],
        ]}
        hot={(r) => r === 2}
      />
      <P dim>
        The last column is a raw count, not a percentile: an empirical percentile against 400
        simulated players has 0.25&nbsp;pp resolution and pins at 100 the moment nobody beats the bot,
        which reads like precision the simulation does not have.
      </P>
      <P>
        Read that table for what it is: arithmetic <em>conditional</em> on a win rate, not a
        measurement of one. It answers how loud an account sustaining 70% would be; it does not show
        that any attacker can reach 70%. The design corollary still holds: rank accounts by win-rate
        z-score against the population, then use the behavioral signals as corroboration before
        acting, which keeps false-positive bans near zero. But the win rate itself deserved
        measuring rather than assuming.
      </P>

      <H n="04a">Measuring the win rate instead of assuming it</H>
      <P>
        So the bench plays the matches. <span className="mono">pnpm evo</span> puts the attacker and a
        modeled field into head-to-head games and lets the win rate emerge from play:{" "}
        <strong>1,196,000 simulated runs</strong> across 5 fields × 160 players × 1,000 shared
        courses, and 99 attacker policies × 4 seeds. Both players in a match drive the{" "}
        <em>same seeded course</em>, exactly: the wave sequence is a pure function of the world RNG
        and elapsed time, and nothing a player does feeds back into what spawns. That
        property is asserted in the test suite by driving one engine across every lane and diffing its
        spawn stream against a passive one frame by frame, and it is what lets one run per
        (player, course) yield every pairwise result.
      </P>
      <Note>
        The sweep numbers in this section were measured against the simulator as it stood on
        2026-08-21. On 2026-08-24 the physics, traffic, scoring, and payout curve were re-fitted
        frame-by-frame to a recorded session of the shipped game, and this 1.2M-run sweep has not
        yet been re-run against the re-fitted build. The structural findings (tie rule, scoring
        rule, field quality) are properties of the match rules, not of those constants; the exact
        percentages will move.
      </Note>
      <P>
        Three things had to be swept rather than picked, because each alone can decide the answer: how
        competent the field is, whether a crashed run still scores (a head-to-head pot you must bank to
        register, versus a leaderboard), and how double-forfeit ties settle. On this difficulty most
        matches end with neither player banking, so that last one is not a billing detail.
      </P>
      <Table
        head={["field", "attacker ceiling, must-bank rule", "attacker ceiling, leaderboard rule"]}
        rows={[
          ["casual", "64.0% (4.9σ)", "58.5% (1.0σ)"],
          ["typical", "59.3% (3.4σ)", "60.8% (1.2σ)"],
          ["learned", "56.9% (2.2σ)", "67.5% (1.7σ)"],
          ["sharp", "56.5% (2.0σ)", "71.0% (2.1σ)"],
          ["grinder", "58.9% (5.4σ)", "52.0% (0.4σ)"],
        ]}
        hot={(r) => r === 3 || r === 4}
      />
      <P dim>
        The number to quote in each column is the one against the strongest opposition for that
        rule, not the biggest one. Banking early is only correct when a forfeit scores nothing;
        under a leaderboard rule the right play is to never bank and grind, which is what the
        grinder field does. The eye-catching 71.0% is the attacker beating a field using the wrong
        strategy for the rule it is scored under, so quoting it would be measuring our own modeling
        error.
      </P>
      <P>
        Counting a policy as hidden if it stays under 3σ <em>and</em> the client-side detector never
        once reaches BOT:
      </P>
      <Table
        head={["match rule", "tie rule", "profitable", "of those, < 3σ", "never actioned"]}
        rows={[
          ["must-bank", "refund", "50", "30", "16"],
          ["must-bank", "split (raked)", "3", "0", "0"],
          ["must-bank", "loss", "0", "0", "0"],
          ["leaderboard", "refund", "93", "93", "51"],
          ["leaderboard", "split (raked)", "40", "40", "25"],
          ["leaderboard", "loss", "0", "0", "0"],
        ]}
        hot={(r) => r === 1}
      />
      <P>
        <strong>The tie rule is an anti-cheat control.</strong> Refunding double-forfeits creates 16
        policies that are profitable, statistically unremarkable, and never actioned; raking those
        same games leaves zero. Under the must-bank rule the attacker&apos;s entire margin lives in
        the games nobody won.
      </P>
      <P>
        <strong>The scoring rule sets how detectable a winner can be.</strong> Requiring a cash-out to
        register means two-thirds of matches tie at zero, which compresses the population&apos;s
        win-rate spread to 2.8-3.2&nbsp;pp, so any consistent winner is instantly loud. Letting
        crashed runs score widens the spread to 8.9-10.3&nbsp;pp, and a 71% bot reads as merely 2.1σ.
        Same detector, same attacker: the scoring rule alone moves it from unmissable to unremarkable.
        If win-rate z-score is the primary ranking signal, the scoring rule decides how much power it
        has.
      </P>
      <P>
        <strong>The attacker&apos;s profit is the field&apos;s mistakes, not a defeated detector.</strong>{" "}
        Every profitable-and-hidden row above is against a field that plays badly or plays the wrong
        strategy for its rule. Under the payout curve read off the recorded session the mechanism is
        sharper still: the curve pays $0 below a score cliff and a solo player only breaks even far
        above it, but head-to-head any banked run beats a forfeit, so the attacker&apos;s edge is
        banking discipline: it always banks at its target (a target sweep against the strongest
        field peaks at 4000, mid-curve) while human instinct chases break-even. That gap{" "}
        <em>is</em> the edge. Anything that teaches players to bank better narrows the exploitable
        margin, an unusual anti-cheat lever and a cheaper one than a detector.
      </P>
      <P>
        So the claim survives only conditionally: there
        is no profitable-and-hidden zone under a must-bank rule with raked ties, against opposition
        that plays its own scoring rule correctly. Change any of those and a hidden profitable
        attacker appears. The rake wall is real, but it is a wall the operator has to keep in repair.
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
        class, computes an ROC/AUC per feature, and picks each threshold at FPR ≤ 0.1%, because a
        false ban costs a real player. Its AUC matrix is built to expose, not hide, that the evasive
        and stealth attackers are not separable from humans on any swipe-level feature. The pipeline is
        built and unit-tested; no human corpus has been recorded yet, so the shipped thresholds remain
        priors and the bench labels them as such. This is the one open acceptance item.
      </P>

      <H n="06">What production needs that this cannot have</H>
      <ul style={{ ...serif, fontSize: 16, lineHeight: 1.7, color: "var(--ink)", maxWidth: "68ch", paddingLeft: 22, marginBottom: 16 }}>
        <li>Native touch-stack data: pressure, touch-major/minor, true hardware timestamps.</li>
        <li>Device attestation (Play Integrity / App Attest) to make OS-level injection expensive.</li>
        <li>Cross-account behavioral fingerprinting: a farm&apos;s accounts share swipe-shape structure.</li>
        <li>Payout-graph / collusion analysis: repeat-pairing far above matchmaking expectation.</li>
        <li>Server-authoritative game state: validate submitted runs against the deterministic engine.</li>
      </ul>

      <H n="07">Limitations</H>
      <P>
        No human corpus yet, so the ROC/AUC and FPR-calibrated cuts are unpopulated. The detector is
        demonstrated client-side (the design is server-side). The population and cadence models are
        simulations parameterized by plausible priors, not fitted to Triumph&apos;s real distribution.
        They argue a structural point that holds across those parameters, but the specific percentiles
        would move on real data. The stealth attacker is a model, not a captured real-world bot; a
        real one would face device attestation this bench does not simulate. Collusion and farm
        fingerprinting are described, not built.
      </P>
      <P>
        Two more worth stating plainly. <strong>The stealth no-action sheet is 40 seeds wide, not
        infinite</strong>: on the current reference-fitted build it never touches SUSPECT or BOT
        across all 40 seeds (earlier builds grazed SUSPECT on 1-2 of 40), which bounds the
        false-negative rate rather than proving invisibility against a review queue fed by more
        traffic. And every attacker number on this page is
        measured over 180 or 600&nbsp;s of a <em>single account</em>; nothing here models an
        adversary who tunes against the detector over weeks, which a real one would.
      </P>

      </article>
    </main>
  );
}
