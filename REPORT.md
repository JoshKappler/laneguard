# LaneGuard — behavioral anti-cheat for a skill-money lane game

An analysis of how a real-money mobile skill game gets attacked, what a
client-side behavioral detector can and cannot catch, and why the economics —
not the motor forensics — are what actually bind a bot.

> **Scope and honesty.** The game here is an *original simulation* built from
> public App Store screenshots of the "Drive" game in the Triumph Arcade app.
> Nothing in this project reverse-engineers, decompiles, inspects, or runs
> against Triumph's real app or servers, and nothing here is usable as a cheat
> against it. Every number below is produced by code in this repo that actually
> ran; `pnpm batch` regenerates the tables. Where a threshold is a
> first-principles prior rather than a value fitted to measured data, it says so.

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

The visual work is deliberate observation against the reference screenshots
(`references/`, with provenance in `references/MANIFEST.md`): the soft blurred
rainbow shoulder, the green rotated CASHOUT lettering, cartoon cars with a
consistent light source, red barrier blocks, the crash smoke plume, and the HUD.
It is a model of a threat, not a clone of a product.

---

## 3. The arms race, measured (read this first)

The honest headline is that **a competent attacker is never actioned by the
client-side detector**, and the bench demonstrates it rather than hiding it.
This is the most important property of the project: an anti-cheat pitch that
overclaims is worse than useless to a team that has thought about this longer
than we have. It cuts both ways — the precise result below is neither "the bot
is invisible" nor "the detector wins", and both of those would have been easier
to write.

Running each attacker for 180 s across 12 seeds (`pnpm batch`). Two columns
matter and they are not the same number: the verdict at the *end* of the
session, and whether a tier was *ever* reached during it — the second is the
enforcement question, because SUSPECT queues a review and BOT withholds a
balance the moment either fires.

| attacker | verdict at 180 s | ever SUSPECT | ever BOT | mean conf | median t→BOT | jitter | Δ⁴/Δ² | RT floor |
|---|---|---|---|---|---|---|---|---|
| naive scripted (T0) | **BOT 100%** | 0/12 | **12/12** | 0.75 | 30 s | 0.00 px | 0.00 | 150 ms |
| replay farm (T1, injected) | **BOT 100%** | 0/12 | **12/12** | 0.75 | 52 s | 1.82 px | 2.29 | 260 ms |
| evasive generative (T2+) | BOT 17% | 9/12 | **5/12** | 0.33 | 80 s *(of the 5)* | 1.65 px | 1.76 | 236 ms |
| **stealth camouflage (T3)** | **HUMAN 12/12** | 3/12 | **0/12** | **0.09** | never | 1.62 px | 1.77 | 274 ms |

The two smoking-gun tiers skip SUSPECT entirely — escalation takes them straight
to BOT. The evasive bot is the interesting middle: it *ends* the session called
BOT on only 17% of seeds, but it touches BOT at some point on 42% and SUSPECT on
75%, so reading the final verdict alone understates the detector by more than
half. Its median 80 s time-to-BOT is a median over the five seeds that got
there, not over all twelve.

The naive bot is caught in seconds by kinematics (machine-clean swipes, jitter
≈ 0) and event provenance. The replay farm survives provenance blinding (its
injected events arrive `isTrusted`) but is caught by replay similarity — its
swipes repeat in shape *and* timing. The evasive generative bot defeats every
swipe-level motor-forensics signal by modeling human motor noise correctly:

| noise model | Δ⁴/Δ² whiteness | caught by motor forensics? |
|---|---|---|
| iid Gaussian (naive) | 2.21 | yes — injected noise is spectrally white |
| pink 1/f + tremor + drift (organic) | 1.76 | **no** — indistinguishable from a band-limited human hand |

The evasive bot still eventually trips **behavior texture** — it never enters
contested space, so lookahead-verified play shows up over a few minutes. The
**stealth** rung closes that gap: it enters contested space on purpose and
sometimes genuinely crashes for it, fakes aborted gestures, and gates its
reaction times to threat onset with an ex-Gaussian sampler (a real lapse tail).

Run out to **10 minutes × 12 seeds**, the stealth attacker:

- ends the session **HUMAN on 12/12 seeds**, mean confidence **0.06**
- **never reaches BOT on any seed** — it is never actioned
- but does **transiently trip SUSPECT on 3/12 seeds** (at 68 s, 75 s and 91 s),
  falling back to HUMAN as more evidence accumulates

So the honest headline is not "invisible". It is: *the detector never gets
enough to act on, and on three seeds in twelve it gets just enough to ask a
human to look.* Note the direction of travel — mean confidence **falls** from
0.09 at 3 minutes to 0.06 at 10, because the session-level signals need volume
and this attacker supplies human-shaped volume. Time is on the attacker's side.

The residual grip is a single signal: on the seeds that flagged, it was
"never enters contested space across N moves" — the stealth bot's deliberate
risk-taking rate (0.7/min) is sometimes too low for the detector's window. An
attacker who noticed that would raise it and pay a few more crashes.

That is the ceiling of client-side behavioral detection. What survives it is not
a better forensic signal — it is the economics.

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
   T2+; **mostly defeated by T3**, which manufactures all three — this is the
   one signal that still lands on T3 at all, flagging on 3 of 12 seeds when its
   contested-space rate happens to fall short of the detector's window.
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

**There is no profitable-and-hidden zone.** The instant a bot clears the rake
wall it is already a > 3σ outlier, and every extra dollar of profit pushes it
further out. Throttling the win rate to look human pushes it below break-even,
where botting stops making money. This survives the T3 attacker that defeats
every forensic signal above, because it is enforced by the rake, not by
forensics — the one thing the attacker cannot fake without giving up the profit
motive.

**The corollary for detection design:** rank accounts by win-rate z-score
against the skill-matched population, then use the behavioral signals as
corroboration before acting. That ordering keeps false-positive bans near zero,
which is the whole game when a ban means withholding a cash balance.

### Session cadence is a cheap filter, not a defense

A 7-day cadence simulation of three account profiles:

| | games/wk | in-session gap cv | active hours | longest idle |
|---|---|---|---|---|
| human | 182 | 0.62 | 13/24 | 22.7 h |
| naive farm | 13,438 | **0.03** | **24/24** | **0.0 h** |
| scheduled bot | 371 | 0.52 | 14/24 | 23.6 h |

The naive farm is trivially caught (rigid cadence, no sleep block). But the
honest result is that the **scheduled bot passes every cadence check** —
mimicking a circadian curve and log-normal session gaps costs an attacker almost
nothing except throughput. Cadence analysis filters lazy farms; only the economy
closes the door on a competent one, because throttling to a human-looking 371
games/week is fine for the attacker, but throttling the *win rate* is not.

---

## 6. Calibration (the method, and its current state)

Every threshold above is a first-principles prior until fitted to measured data.
The calibration pipeline (`lib/detect/roc.ts`, `scripts/calibrate.ts`, run with
`pnpm calibrate`) does the honest version:

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
- **The stealth attacker is a model**, not a captured real-world bot. It
  demonstrates that the client-side signals are defeatable in principle by an
  attacker who models motor noise and reaction timing correctly; a real one
  would face device attestation this bench does not simulate.
- **"Never actioned" is not "never noticed."** The stealth attacker trips the
  SUSPECT review tier on 3 of 12 seeds. A defender who staffs a review queue —
  rather than only auto-banning at the BOT tier — recovers some signal from
  exactly those seeds. That is a real, if narrow, defensive foothold and the
  measurement is reported rather than rounded away.
- **Every attacker/detector number here is measured at 180 s or 600 s of a
  single account.** Nothing in this bench models an attacker who tunes against
  the detector over weeks, which is the realistic adversary.
- **Collusion and multi-account farm fingerprinting are described, not built.**

---

*Reproduce every number here with `pnpm test` (parity + behavior), `pnpm batch`
(the tables), and `pnpm calibrate` (the ROC pipeline). The git history is part of
the method: the physics took several instrumented debugging rounds to get right.*
