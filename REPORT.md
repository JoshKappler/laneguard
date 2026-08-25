# LaneGuard — behavioral anti-cheat for a skill-money lane game

An analysis of how a real-money mobile skill game gets attacked, what a
client-side behavioral detector can and cannot catch, and why the economics —
not the motor forensics — are what actually bind a bot.

> **Scope.** The game here is an *original simulation* of the "Drive" game in
> the Triumph Arcade app, frame-fitted to a screen recording of one full
> session played on my own phone, plus my own screenshots and Triumph's public
> marketing and App Store images (provenance in `references/MANIFEST.md`).
> Projection, speed ramp, traffic mix, lane-change dynamics, scoring, and the
> dollar payout curve are measured, not guessed. Nothing in this project
> reverse-engineers, decompiles, inspects, or runs against Triumph's real app
> or servers, and nothing here is usable as a cheat against it. Every number
> below is produced by code in this repo that actually ran; `pnpm batch`
> regenerates the tables. Where a threshold is a first-principles prior rather
> than a value fitted to measured data, it says so.

---

## 1. Threat model

A head-to-head skill game paying real money is attacked by a ladder of
adversaries, cheapest first. Each rung costs the attacker more and defeats more
of the defense:

| Tier | Capability | What it beats |
|---|---|---|
| **T0 scripted** | reads game state, emits perfect inputs | nothing subtle — but it's 90% of real attempts |
| **T1 replay** | records human swipes, replays them perturbed | jitter/kinematics checks |
| **T2 generative** | synthesizes fresh human-shaped swipes with injected noise | replay-similarity checks |
| **T2+ organic** | models the *structure* of human motor noise (pink 1/f + tremor + drift) | every swipe-level motor-forensics signal |
| **T3 stealth** | organic noise + ex-Gaussian reaction times gated to threat onset + deliberate imperfect play | every enforcement action the client-side detector can take |
| **T4 farm / collusion** | many accounts, shared trace corpus, or two accounts feeding each other wins | within-account analysis entirely |

The bench implements T0–T3 as switchable attackers driving the exact same input
pipeline a human uses; the detector never sees which is running. T4 is addressed
by the server-side economic and population models, not the live detector.

The defender's real constraint is asymmetric: **a false positive withholds a
real player's cash balance.** That makes false-positive rate the budget every
threshold is spent against, and it is why the strongest conclusion here is an
economic one that needs no per-player forensics at all.

---

## 2. What we built, and why it looks like the real thing

The left of the bench is an original re-implementation of the Drive game: four
lanes (a 5× rainbow lane, 2×, 1×, and a cash-out lane you hold to bank the run),
a near-top-down third-person camera, moving traffic at varied per-wave speeds
with follow logic, barrier-rail traps, a continuously ramping speed/density
curve, and real steering physics — the car banks to ~34° and its lateral
velocity comes from its heading, colliding via a rotated-rectangle SAT test
whose hitbox shrinks while angled. That physics is what makes the *reaction
times and dodge margins* the detector reads meaningful; a toy lane-swapper would
not produce a realistic behavioral signal.

The visual and physical work is measured against the reference material
(`references/`, with provenance in `references/MANIFEST.md`), primarily a
frame-by-frame pass over a full recorded session: the projection and its
speed-tracking zoom, the speed ramp, wave spacing and lane mix, near-constant
traffic closing speeds, the scoring rate, the dollar payout curve read off the
HUD point by point, the soft blurred rainbow shoulder, the green rotated
CASHOUT lettering, cartoon cars with a consistent light source, red barrier
blocks, the crash smoke plume, and the HUD. It is a model of a threat, not a
clone of a product.

The headline parity numbers, reference vs simulation:

| quantity | reference (recording) | simulation |
|---|---|---|
| countdown, tap to GO | 2.46 s | 2.40 s |
| score rate | 0.50 per z (per-badge medians 0.49-0.51) | 0.50 per z |
| traffic closing speed | 12-23 z/s, near-constant across the speed ramp | 14-24 z/s |
| barrier slabs in frame | 2.03 mean (blob count over the run) | 1.98 mean (same counter) |
| dollar payout | HUD dollar series, read point by point | the same series as the interpolation table |

---

## 3. Attacker vs detector, measured

The main result: **a competent attacker is never actioned by the client-side
detector**, and the bench demonstrates it. An anti-cheat pitch that overclaims
is useless to a team that has thought about this longer than we have. The
precise result below is neither "the bot is invisible" nor "the detector
wins", and both of those would have been easier to write.

Running each attacker for 180 s across 12 seeds (`pnpm batch`). Two columns
matter and they are not the same number: the verdict at the *end* of the
session, and whether a tier was *ever* reached during it — the second is the
enforcement question, because SUSPECT queues a review and BOT withholds a
balance the moment either fires.

| attacker | verdict at 180 s | ever SUSPECT | ever BOT | mean conf | median t→BOT | jitter | Δ⁴/Δ² | RT floor |
|---|---|---|---|---|---|---|---|---|
| naive scripted (T0) | **BOT 100%** | 0/12 | **12/12** | 0.75 | 16 s | 0.00 px | 0.00 | 60 ms |
| replay farm (T1, injected) | **BOT 100%** | 0/12 | **12/12** | 0.75 | 26 s | 1.82 px | 2.28 | 68 ms |
| evasive generative (T2+) | BOT 8% | 12/12 | **6/12** | 0.51 | 54 s *(of the 6)* | 1.63 px | 1.74 | 62 ms |
| **stealth camouflage (T3)** | HUMAN 11/12 | 1/12 | **0/12** | **0.10** | never | 1.62 px | 1.75 | 229 ms |

The two smoking-gun tiers skip SUSPECT entirely: escalation takes them straight
to BOT. The evasive bot is the interesting middle: it *ends* the session called
BOT on only 8% of seeds, but it touches SUSPECT on every seed and BOT on half,
so reading the final verdict alone understates the detector. Its median
54 s time-to-BOT is a median over the six seeds that got there, not over all
twelve. Its tell is the RT floor: a planner that moves the instant a plan forms
gets credited physically impossible sub-100 ms "reactions" in dense traffic.

The naive bot is caught in seconds by kinematics (machine-clean swipes, jitter
≈ 0) and event provenance. The replay farm survives provenance blinding (its
injected events arrive `isTrusted`) but is caught by replay similarity — its
swipes repeat in shape *and* timing. The evasive generative bot defeats every
swipe-level motor-forensics signal by modeling human motor noise correctly:

| noise model | Δ⁴/Δ² whiteness | caught by motor forensics? |
|---|---|---|
| iid Gaussian (naive) | 2.21 | yes — injected noise is spectrally white |
| pink 1/f + tremor + drift (organic) | 1.76 | **no** — indistinguishable from a band-limited human hand |

The evasive bot still trips the **reaction-time floor**: with no RT model, a
planner fires the instant a plan forms, and in dense traffic that gets credited
sub-100 ms "reactions" no human hand produces. The **stealth** rung closes that
gap: it gates its reaction times to threat onset with an ex-Gaussian sampler (a
real lapse tail), enters contested space on purpose and sometimes genuinely
crashes for it, and fakes aborted gestures.

Three minutes is not long enough to separate those two claims, so run both out
to **10 minutes × 12 seeds** (`pnpm batch --duration 600`) and compare them on
equal terms:

| attacker | verdict at 600 s | ever SUSPECT | ever BOT | mean conf | median t→BOT |
|---|---|---|---|---|---|
| evasive generative (T2+) | **SUSPECT 100%** | 12/12 | **6/12** | 0.50 | 54 s *(of the 6)* |
| **stealth camouflage (T3)** | **HUMAN 12/12** | 1/12 | **0/12** | **0.04** | never |

This is the result worth reading. The detector gets the evasive bot inside a
minute (a median 54 s to the first BOT touch) and never lets go: every seed
sits pinned at SUSPECT for as long as the session runs, because the
impossible-RT artifact keeps recurring. The stealth rung is what breaks that
trend: it sits at 0/12 ever-BOT no matter how long the session runs, with
confidence flat at 0.04; its one transient SUSPECT graze decays back to HUMAN,
because the session-level signals need volume and this attacker supplies
human-shaped volume. Against everything below T3 time is the defender's ally;
at T3 it stops helping.

On these batch seeds the stealth attacker grazes SUSPECT once in twelve, at
~143 s, on the behavior-texture signal; it never reaches BOT, and SUSPECT
queues a review rather than acting on the account. "Invisible" was never the
claim; the precise statement: *the detector never gets enough to act on.*

That is the ceiling of client-side behavioral detection. What survives it is
the economics, not a better forensic signal.

---

## 4. The signals, and what each is worth

Seven signals, each with a physical rationale. Every threshold is currently a
first-principles prior; the calibration pipeline (§6) replaces each with a value
fitted to a human corpus at a stated FPR, and reports the AUC that shows whether
the signal separates humans from a given attacker class at all.

1. **Reaction time** — human dodge RT is ex-Gaussian (a floor near ~200 ms plus
   a heavy right tail of attentional lapses). A scripted bot has a superhuman
   floor; a naive sampler produces a symmetric distribution with no lapse tail
   (skew < 0.15). Catches T0 and lazily-tuned samplers.
2. **Swipe kinematics** — motor-noise magnitude (jitter) and velocity-profile
   diversity. Clean synthetic swipes have jitter ≈ 0. Catches T0.
3. **Noise character** — the lag-structure of the micro-motion via a Δ⁴/Δ²
   spectral-whiteness ratio. Injected iid noise is white; human tremor and drift
   are not. Catches T2 with iid noise; **defeated by T2+ organic noise.**
4. **Replay similarity** — near-duplicate swipes in shape *and* timing. Catches
   T1 even when each replay is perturbed.
5. **Perfection** — dodge-margin consistency and survival rates humans don't
   produce (zero deaths over dozens of dodges; metronomic margins).
6. **Behavior texture** — session habits automation skips: aborted gestures,
   entering contested space and *paying* for it, actually banking runs. Catches
   T2+; **largely defeated by T3**, which manufactures all three. It keeps a
   thin residual grip: 1 of 40 seeds grazes SUSPECT on the video-fitted build
   (the pre-refit build grazed 2 of 40), and it never escalates past a review.
7. **Event integrity** — synthetic-event provenance (`isTrusted`), coordinate
   granularity. Cheap to spoof at the OS level, so corroborating only — it goes
   to zero the moment hardware injection is simulated.

Aggregation is a weighted blend with escalation: one smoking-gun signal, or
several independently suspicious ones, overrides the average so convergent
evidence isn't washed out. Enforcement is tiered — one strong signal →
SUSPECT (flag for review); convergent independent signals → BOT (act on the
account) — because acting withholds money and wants corroboration.

---

## 5. Why the economy is the real detector

With a \$5 entry, a \$10 head-to-head pot, and a 20% rake, the winner nets +\$3
and the loser −\$5. Break-even win rate is `3p − 5(1−p) = 0 → p = 62.5%`.

A bot is trapped by arithmetic: it must sustain **> 62.5%** to be worth running,
and a sustained 62.5%+ win rate over a few hundred games is a loud outlier in a
skill-matched population. The bench simulates that population directly — latent
skill ~ N(0,1), opponents drawn from a narrow band of the skill ladder the way
real head-to-head seeding works — producing observed win rates with **mean 50.0%
and sd 3.8 pp** over 300 games each, against a binomial noise floor of 2.9 pp
(so most of the visible spread is sampling noise, not skill).

Sweeping the bot's win rate against that population:

| bot win rate | EV / game | z-score | players at or above (of 400) | |
|---|---|---|---|---|
| 55% | −\$0.60 | 1.3σ | 26 | loses money, invisible |
| 60% | −\$0.20 | 2.6σ | 3 | still loses money |
| **62.5%** | **\$0.00** | **3.3σ** | **2** | **break-even — already an outlier** |
| 65% | +\$0.20 | 3.9σ | 1 | |
| 70% | +\$0.60 | 5.2σ | 1 | |
| 80% | +\$1.40 | 7.8σ | 0 | |

(The last column is a raw count, not a percentile. An empirical percentile
against a 400-player simulation has 0.25 pp resolution and pins at 100.00 the
moment nobody beats the bot, which reads like false precision; the count says
the same thing without pretending to more.)

Read that table for what it is: **arithmetic conditional on a win rate, not a
measurement of one.** It answers "if an account sustained 70%, how loud would it
be" — it does not establish that any attacker can reach 70%. The next section
stops assuming and measures it.

**The corollary for detection design:** rank accounts by win-rate z-score
against the skill-matched population, then use the behavioral signals as
corroboration before acting. That ordering keeps false-positive bans near zero,
which is the whole game when a ban means withholding a cash balance.

### 5a. Measuring the win rate instead of assuming it

The sweep above has a hole an attacker could drive through: `botWR` is a knob. So
the bench also plays the matches. `pnpm evo` puts the attacker and a modeled
field into head-to-head games and lets the win rate *emerge* from play —
**1,196,000 simulated runs** across 5 fields × 160 players × 1,000 shared
courses, and 99 attacker policies × 4 independent seeds.

> Sweep measured 2026-08-21 against the pre-recording build of the simulator.
> The 2026-08-24 frame-fit to a recorded session (physics, traffic, scoring,
> payout curve) shifts the exact percentages, and this sweep is due a re-run;
> the structural findings are properties of the match rules, not of those
> constants.

Both players in a match drive the **same seeded course**. That is exact, not
approximate: the wave sequence is a pure function of the world RNG and elapsed
run time, and nothing a player does feeds back into what spawns (asserted in
`test/headtohead.test.ts` by driving one engine all over the road and diffing its
spawn stream against a passive one frame by frame). So one run per
(player, course) yields every pairwise result, which is what makes a study this
size cost a minute of wall-clock.

Three things had to be swept rather than chosen, because each one on its own can
decide the answer:

- **How competent the field is.** An attacker's edge is bounded by how badly the
  opposition plays. Fields run from `casual` (slow, greedy, banks 32% of runs) to
  `sharp` (fast, banks 52%).
- **What decides a match.** Public material does not settle whether a crashed run
  scores nothing (`banked`, a head-to-head pot you must bank to register) or still
  counts its score (`score`, a leaderboard). Both are measured.
- **How double-forfeits settle.** On this difficulty most matches end with
  *neither* player banking, so the tie rule is not a billing detail: `refund`
  returns entries, `split` pays the raked pot back (−$1 each), `loss` keeps both.

The attacker's measured ceiling — the best win rate any of the 99 policies reached:

| field | `banked` rule | `score` rule |
|---|---|---|
| casual | 64.0% (4.9σ) | 58.5% (1.0σ) |
| typical | 59.3% (3.4σ) | 60.8% (1.2σ) |
| learned | 56.9% (2.2σ) | 67.5% (1.7σ) |
| sharp | **56.5% (2.0σ)** | 71.0% (2.1σ) |
| grinder | 58.9% (5.4σ) | **52.0% (0.4σ)** |

The bolded cell in each column is the one to quote, and it is not the biggest
number — it is the strongest opposition for that rule. Banking early is correct
only when a forfeit scores nothing; under a leaderboard rule the right play is to
grind the score up and never bank, which is what the `grinder` field does. The
eye-catching 71.0% is the attacker beating a field using the *wrong strategy for
the rule it is being scored under*, and quoting it would be measuring our own
modeling mistake. Against opposition that plays the rule correctly the attacker
gets 52.0%, and loses $0.84 a game.

So, does a profitable-and-hidden policy exist? Counting a policy as hidden if it
stays under 3σ **and** the client-side detector never once reaches BOT:

| match rule | tie rule | profitable | of those, < 3σ | of those, never actioned |
|---|---|---|---|---|
| banked | refund | 50 | 30 | **16** |
| banked | split | 3 | 0 | **0** |
| banked | loss | 0 | 0 | 0 |
| score | refund | 93 | 93 | **51** |
| score | split | 40 | 40 | **25** |
| score | loss | 0 | 0 | 0 |

Three findings, in descending order of how much they should change what a
defender does:

**1. The tie rule is an anti-cheat control.** Refunding double-forfeits creates
16 profitable-and-invisible policies where raking them leaves 0. The attacker's
whole margin under the `banked` rule lives in the games nobody won. Rake every
seated game and the margin evaporates — no forensics required.

**2. The scoring rule sets how detectable a winner can be.** Under the `banked`
rule two-thirds of matches tie at zero, which crushes the population's win-rate
spread to **2.8–3.2 pp**, so any consistent winner is immediately a loud outlier.
Under the `score` rule skill shows in every game and the spread widens to
**8.9–10.3 pp** — wide enough that a 71% bot reads as only 2.1σ. Same detector,
same attacker; the scoring rule alone moves it from unmissable to unremarkable.
If win-rate z-score is going to be the primary ranking signal, the scoring rule
determines how much power it has.

**3. The attacker's profit comes from the field's mistakes, not from beating the
detector.** Every profitable-and-hidden row above is against a field that either
plays badly or plays the wrong strategy for the rule. The video-fitted payout
curve makes the mechanism sharp: it pays $0 below a score cliff and a solo
player only breaks even far above it, but head-to-head any banked run beats a
forfeit, so the attacker's optimum is banking just past the cliff while human
instinct chases break-even. The field is systematically too greedy, and that
gap *is* the attacker's edge. Anything that teaches players to bank better (UX
nudges, a visible expected-value hint, better onboarding) narrows the
exploitable margin. That is an unusual place to find an anti-cheat lever, and it
is cheaper than any detector.

**Bottom line.** The claim "there is no profitable-and-hidden zone"
survives, but conditionally, and the conditions are now stated: it holds under a
head-to-head rule where a forfeited run banks nothing *and* ties are raked, and it
holds against opposition that plays its scoring rule correctly. Change either and
a hidden profitable attacker appears. The rake wall is real, but it is a wall the
operator has to keep in repair, not a law of nature.

### Session cadence is a cheap filter, not a defense

A 7-day cadence simulation of three account profiles:

| | games/wk | in-session gap cv | active hours | longest idle |
|---|---|---|---|---|
| human | 182 | 0.62 | 13/24 | 22.7 h |
| naive farm | 13,438 | **0.03** | **24/24** | **0.0 h** |
| scheduled bot | 371 | 0.52 | 14/24 | 23.6 h |

The naive farm is trivially caught (rigid cadence, no sleep block). But the
**scheduled bot passes every cadence check**: mimicking a circadian curve and
log-normal session gaps costs an attacker almost nothing except throughput. Cadence analysis filters lazy farms; only the economy
closes the door on a competent one, because throttling to a human-looking 371
games/week is fine for the attacker, but throttling the *win rate* is not.

---

## 6. Calibration (the method, and its current state)

Every threshold above is a first-principles prior until fitted to measured data.
The calibration pipeline (`lib/detect/roc.ts`, `scripts/calibrate.ts`, run with
`pnpm calibrate`) works like this:

1. Load a real human swipe corpus (recorded with `recorder/index.html`) as the
   negative class.
2. Run each attacker as the positive class.
3. For every swipe-level feature, compute an ROC/AUC (human vs each attacker) and
   pick a threshold at **FPR ≤ 0.1%** — because a false ban costs a real player.
4. Emit the calibrated constants and an AUC matrix.

The pipeline is built and unit-tested (perfect-separation → AUC 1.0, identical
distributions → AUC 0.5, threshold-at-FPR holds its budget). Its AUC matrix is
designed to *expose*, not hide, that the evasive and stealth attackers are not
separable from humans on any swipe-level feature — that is the §3 result stated
quantitatively.

**Current state: no human corpus has been recorded yet**, so the shipped
thresholds remain priors and the UI labels them as such. This is the one
acceptance item that requires a recording session; everything downstream of it
is ready and regenerates with a single command.

---

## 7. What a production system needs that this cannot have

- **Native touch-stack data** — pressure, touch-major/minor axes, and true
  hardware timestamps, far richer than browser pointer events.
- **Device attestation** — Play Integrity / App Attest to make OS-level input
  injection expensive rather than free.
- **Cross-account behavioral fingerprinting** — a phone farm's accounts share
  swipe-shape structure that within-account analysis cannot see.
- **Payout-graph / collusion analysis** — repeat-pairing rate far above random
  matchmaking expectation catches two accounts feeding each other wins.
- **Server-authoritative game state** — validate a submitted run against the
  deterministic engine, which alone kills every state-manipulation cheat class.

---

## 8. Limitations

- **No human corpus yet.** Thresholds are priors; the ROC/AUC and FPR-calibrated
  cuts are not populated until a corpus is recorded. The pipeline is ready; the
  data is not.
- **The detector is demonstrated client-side** for visibility. Every feature is
  computed from telemetry a production game already uploads, so the design is
  server-side, but this build does not implement the server.
- **The population and cadence models are simulations**, parameterized by
  plausible priors, not fitted to Triumph's real player distribution. They argue
  a structural point (the rake wall) that is robust to the exact parameters, but
  the specific percentiles would move on real data.
- **The head-to-head field is surrogate, and this is §5a's biggest weakness.**
  The "players" it measures the attacker against are the *same planner* with
  degraded reaction times, injected execution error, and varied banking
  discipline — so strictly, §5a measures a bot beating worse bots, not a bot
  beating humans. Three things are worth knowing about how far that goes. It is
  a real ordering: the modeled skill axis is monotone (a strong draw banks more
  often than a weak one, asserted in `test/headtohead.test.ts`), so the field is
  a genuine ladder rather than noise. It is deliberately conservative in one
  place — all-play-all rather than skill-banded matchmaking, which widens the
  population's win-rate spread and therefore *shrinks* the attacker's z-score.
  And it is load-bearing in the direction that matters least: the headline
  conclusions are about the *shape* of the surface (raking ties removes the
  hidden-profitable region; the scoring rule sets the population spread), which
  is driven by the rules and the tie structure, not by how human the field is.
  What a real corpus would change is the absolute win-rate ceilings — 56.5% and
  52.0% are the numbers to distrust first. Humans also have strategy modes this
  planner has none of: tilt, learning within a session, and quitting while
  ahead.
- **The stealth attacker is a model**, not a captured real-world bot. It
  demonstrates that the client-side signals are defeatable in principle by an
  attacker who models motor noise and reaction timing correctly; a real one
  would face device attestation this bench does not simulate.
- **The stealth no-action sheet is 40 seeds wide, not infinite.** On the
  video-fitted build the stealth attacker grazes SUSPECT on 1 of 40 seeds and
  never reaches BOT (the pre-refit build grazed 2 of 40). A claim built on 40
  deterministic seeds bounds the detector's false-negative rate; it does not
  prove invisibility against a review queue fed by more traffic.
- **Every attacker/detector number here is measured at 180 s or 600 s of a
  single account.** Nothing in this bench models an attacker who tunes against
  the detector over weeks, which is the realistic adversary.
- **Collusion and multi-account farm fingerprinting are described, not built.**

---

*Reproduce every number here with `pnpm test` (parity + behavior), `pnpm batch`
(the attacker/economy/cadence tables), `pnpm evo` (§5a — the 1.2M-run
head-to-head sweep, about a minute on 14 workers) and `pnpm calibrate` (the ROC
pipeline). All four are deterministic: same seeds in, same tables out, so a
skeptic re-running them gets these figures and not merely similar ones. The git
history is part of the method: the physics took several instrumented debugging
rounds to get right, and so did the planner bug §5a turned up.*
