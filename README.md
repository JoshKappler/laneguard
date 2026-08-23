# LaneGuard

A behavioral anti-cheat **test bench** for skill-money mobile games, built around an
original simulation of a lane-change driving game (third-person camera, 4 lanes with a
cash-out lane, moving traffic at varied speeds, barrier traps, real steering physics —
the car banks to ~30° and its lateral velocity comes from the heading — with a rotated
hitbox that shrinks while angled, payout multiplier up to 2.5x).

Open `index.html` in any browser. No dependencies, no build step, no server required.
Designed for a full-width monitor: game on the left, live forensics in the middle,
verdict + event log on the right.

## The bench

- **Live swipe analysis** — every swipe is plotted the moment it lands: the raw path
  with per-segment speed coloring, the normalized velocity profile, and the full
  feature vector (duration, samples, path length, motor-noise jitter, Δ⁴/Δ² spectral
  whiteness, implied noise σ, velocity-peak position, coordinate granularity, event
  provenance, nearest-neighbor shape/timing distance, replay classification).
- **Recent-swipe gallery** — thumbnails of the last 24 swipes, click to inspect;
  red border = replay match, yellow = synthetic events.
- **Distributions** — reaction-time and dodge-margin histograms with running
  mean / cv / skew, updated per dodge.
- **Event log** — timestamped stream of everything: per-swipe measurements, dodge
  reaction times, contested-space entries and how they resolved, run endings with
  payout, flags the moment they fire, and verdict transitions.
- **Server-side analytics** — two offline models over account history rather than the
  live session: the $5 economy / population win-rate simulator, and the 7-day session
  cadence model. Both are interactive (entry rake, population size, games played, bot
  win rate).

## The game

4 lanes, scored by risk: **lane 0 is the rainbow lane at 5x**, lane 1 is 2x, lane 2 is
1x, and lane 3 is the cashout lane (no scoring — hold it to bank the run). Speed ramps
from 15 to 34 and obstacle density from 0.55 to 0.9 as a run continues, so the reaction
window shrinks the longer you survive. Traffic moves at varied per-wave speeds with
follow logic. Steering is real: a swipe sets a target lane, the car banks to ~34°, and
its lateral velocity comes from the heading, so it travels the angled path. Collision is
a rotated-rectangle SAT test whose box shrinks while the car is angled — toggle
**show hitboxes** to see the live geometry the physics actually uses.

## What it shows

The left side is the game. The right side is the detector. Play it yourself and the
verdict reads HUMAN. Then hand the wheel to any of three built-in attackers, ordered
by sophistication:

1. **Perfect bot** — scripted play: instant reactions, machine-clean synthetic swipes.
   The naive attack.
2. **Human-mirroring bot** — replays a corpus of recorded human swipe traces, perturbed
   per use, with sampled human-like reaction times. How real bots against swipe games
   actually work.
3. **Generative bot** — synthesizes a fresh human-shaped trace for every swipe with
   injected noise and randomized reaction times. Built specifically to beat replay
   detection and jitter checks. The attacker a serious anti-cheat team plans for.

The detector never knows which mode is running. It sees only the input stream and game
telemetry. The "simulate hardware-level injection" toggle delivers the bot's events as
trusted (the way a phone-farm rig or OS-level driver would), which blinds provenance
checks and forces the behavioral signals to carry the verdict.

## Signals

| Signal | What it measures | Primarily catches |
|---|---|---|
| reaction time | superhuman floor, impossibly low variance, and distribution SHAPE — human RT is ex-Gaussian with a heavy lapse tail; sampled Gaussians are symmetric | scripted play, tuned RT samplers |
| swipe kinematics | motor-noise magnitude (jitter), velocity-profile diversity | clean synthetic swipes |
| noise character | lag-1 autocorrelation of smoothing residuals — injected iid noise is statistically white; human tremor and drift are not | bots that add randomness to defeat jitter checks |
| replay similarity | near-duplicate swipes in shape AND timing | trace replay, even perturbed |
| perfection | dodge-margin consistency, survival humans don't produce | both scripted and tuned bots |
| behavior texture | session habits: aborted gestures, contested-space entries and whether they ever cost anything, cash-out patterns | lookahead-verified play, survivable injected "errors", farm accounts |
| event integrity | synthetic event provenance (`isTrusted`), coordinate granularity | in-browser bots; corroborating only |

Aggregation is a weighted blend with escalation: one smoking-gun signal, or several
independently suspicious ones, overrides the average — an ensemble mean must not wash
out convergent evidence.

## The arms race, measured

The generative bot has an **organic noise evasion** toggle. Off, it perturbs traces with
iid Gaussian noise — the naive choice. On, it synthesizes the actual structure of human
motor noise: pink (1/f) noise via Voss-McCartney, an 8-12 Hz physiological tremor, and
low-frequency drift. Measured over 40 synthesized swipes per model:

| noise model | Δ⁴/Δ² whiteness | jitter | caught by motor forensics? |
|---|---|---|---|
| iid Gaussian | 2.40 | 1.76 px | yes |
| pink + tremor + drift | 1.88 | 1.60 px | **no** |

That is the honest conclusion, and it is the reason this bench exists: **swipe-level
motor forensics are defeatable by an attacker who models human motor noise properly.**
They remain worth shipping (they catch the 90% of bots that don't bother), but they
cannot be the last line. What survives the evasion is the layer the attacker cannot fake
without giving up the profit motive:

- **behavior texture** — never aborting a gesture, never entering contested space,
  never banking a run
- **the economy** — see below

## Why the economy is the strongest detector

With a $5 entry, a $10 head-to-head pot, and a ~20% rake, the winner nets +$3 and the
loser −$5. Break-even win rate is `3p − 5(1−p) = 0 → p = 62.5%`.

A bot is therefore trapped: it must sustain **>62.5%** to be worth running at all, and a
sustained 62.5%+ win rate over a few hundred games sits far above the 99.9th percentile
of the real player distribution. Throttling down to look human pushes it below the rake
wall, where botting stops making money. Unlike every swipe-level signal, this one cannot
be spoofed by better trace synthesis — it is enforced by arithmetic, not by forensics.

The bench simulates this directly: a skill-matched population (opponents drawn from a
narrow band of the skill ladder, the way real head-to-head seeding works) produces
observed win rates with **mean 50.0% and sd 3.8pp** over 300 games each — against a
binomial noise floor of 2.9pp, so most of the visible spread is sampling noise, not
skill. Sweeping the bot's win rate against that population:

| bot win rate | EV / game | z-score | percentile | |
|---|---|---|---|---|
| 55% | −$0.60 | 1.3σ | 93.5 | loses money, invisible |
| 60% | −$0.20 | 2.6σ | 99.25 | still loses money |
| **62.5%** | **$0.00** | **~3.4σ** | **99.5** | **break-even — already an outlier** |
| 65% | +$0.20 | 3.9σ | 99.75 | |
| 70% | +$0.60 | 5.2σ | 99.75 | |
| 80% | +$1.40 | 7.8σ | 100 | |

**There is no profitable-and-hidden zone.** The instant a bot clears the rake wall it is
already a >3σ outlier, and every additional dollar of profit pushes it further out. That
is a structural property of the rake, not a tuning choice — which is why it survives
attackers who defeat every motor-forensics signal above.

The corollary for detection design: **rank accounts by win-rate z-score against the
population, then use the behavioral signals as corroboration** before acting. That
ordering keeps false-positive bans near zero, which matters a lot when a ban means
withholding someone's cash balance.

## Session cadence and scheduling

The second server-side panel simulates 7 days of account activity for three profiles and
measures what separates them:

| | games/wk | in-session gap cv | active hours | longest idle |
|---|---|---|---|---|
| human | 182 | 0.62 | 13/24 | 22.7 h |
| naive farm | 13,438 | **0.03** | **24/24** | **0.0 h** |
| scheduled bot | 371 | 0.52 | 14/24 | 23.6 h |

The naive farm is trivially caught: a rigid inter-game cadence (cv 0.03 vs a human's
0.62) and no sleep block anywhere in the week. But note the honest result — the
**scheduled bot passes every cadence check**, because mimicking a circadian curve and
log-normal session gaps costs an attacker almost nothing except throughput. Cadence
analysis is a cheap filter for lazy farms, not a defense against a competent one. It is
the economy that closes the door: throttling to a human-looking 371 games/week is fine
for the attacker, but throttling the *win rate* is not.

## Honest scope

- **Thresholds are first-principles priors.** No real human swipe corpus has been
  collected yet, so every cut-off here is set from motor-control literature and
  synthetic separation tests, not fitted data. A production deployment calibrates each
  signal on the real player distribution and replaces the linear blend with a trained
  model over the same features.
- **The demo detector runs client-side for visibility; the design is server-side.**
  Every feature is computed from telemetry a production game already uploads (touch
  paths, timestamps, game events). Nothing requires trusting the client.
- **What production adds that a demo can't:** native touch stack data (pressure,
  touch-major/minor axes, true hardware timestamps — far richer than browser pointer
  events), device attestation (Play Integrity / App Attest), cross-session and
  cross-account correlation (a phone farm's accounts share behavioral fingerprints),
  and payout-graph analysis on the economy side.

## Notes

The game is an original simulation written for this demo; it uses no third-party code
or assets. The detection layer is a few hundred lines of dependency-free JS.
