# LaneGuard

A working demo of behavioral anti-cheat for skill-money mobile games, built around an
original simulation of a lane-change driving game (third-person camera, 4 lanes, a
cash-out lane, barrier traps, angled-hitbox lane changes, payout multiplier up to 2.5x).

Open `index.html` in any browser. No dependencies, no build step, no server required.

## What it shows

The left side is the game. The right side is the detector. Play it yourself and the
verdict reads HUMAN. Then hand the wheel to either built-in attacker:

- **Perfect bot** — scripted play: instant reactions, machine-clean synthetic swipes.
- **Human-mirroring bot** — the sophisticated attack: replays a small corpus of
  recorded human swipe traces, perturbed per use, with sampled human-like reaction
  times. This is how real bots against swipe games actually work.

The detector never knows which mode is running. It sees only the input stream and the
game telemetry, and it flags both attackers as BOT:

| Signal | What it measures | Catches |
|---|---|---|
| reaction time | dodge RT distribution: superhuman floor, impossibly low variance | scripted play |
| swipe kinematics | motor noise (jitter), velocity-profile diversity | synthetic swipes |
| replay similarity | near-duplicate normalized swipe shapes across the session | trace replay, even perturbed |
| perfection | dodge-margin consistency, survival rates humans don't produce | both |
| event integrity | synthetic event provenance (`isTrusted`), coordinate granularity | in-browser bots |

Key design point: the "simulate hardware-level injection" toggle makes the bot's
events arrive trusted, the way a phone-farm rig or an OS-level driver delivers them.
Provenance checks go blind, and the behavioral signals still convict — replay
similarity alone catches the mirroring bot. A single high-confidence signal escalates
the verdict rather than being averaged away by signals the attacker legitimately passes.

## Verified results (headless run)

- Perfect bot, untrusted events: **BOT, 75% confidence**, 5 flags, 0 deaths across 17 dodges.
- Mirroring bot, trusted (injected) events: **BOT, 75% confidence**, convicted on
  39% near-duplicate swipe-shape pairs alone.

## Notes

The game is an original simulation written for this demo; it uses no third-party code
or assets. The detector is ~200 lines of plain JS and would run server-side against
the same telemetry a production game already collects (touch paths, timings, game
events) — nothing here requires client trust.
