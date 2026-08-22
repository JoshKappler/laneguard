# LaneGuard

A working demo of behavioral anti-cheat for skill-money mobile games, built around an
original simulation of a lane-change driving game (third-person camera, 4 lanes, a
cash-out lane, barrier traps, angled-hitbox lane changes, payout multiplier up to 2.5x).

Open `index.html` in any browser. No dependencies, no build step, no server required.

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
