# LaneGuard v2 — Agent Brief

You are taking over a working prototype and turning it into a deployed, defensible
research artifact. Read this whole file before touching anything. Then read
`README.md` and skim `index.html` (~2000 lines, single file) to understand current state.

---

## 0. Context you need

**Who this is for.** Josh Kappler is pitching Triumph Labs (triumpharcade.com /
triumphlabs.com, SF + Mountain View, ~$26M raised, General Catalyst Series A,
co-founders Jake Brooks & Jared Geller). They run real-money skill tournaments on mobile.
Josh cold-emailed them, got a reply ("how did u find me"), and this artifact is the
follow-up. Their engineering roles are all titled Senior, so this has to punch above a
"junior applicant" read — it is the argument that he operates at their level.

**They have a real anti-cheat team.** Assume the reader is a security engineer who has
thought about this problem longer than we have. Anything overclaimed will be spotted
instantly and will cost more credibility than the artifact gains. The current version
already leans into this: it demonstrates an attacker that *defeats* our own detector.
Preserve that intellectual honesty. It is the most valuable property of this project.

**The game being modeled** is "Drive" inside the Triumph Arcade app: 4 lanes, top-down
3rd-person camera, lane 0 is a rainbow lane worth 5x score, lane 1 = 2x, lane 2 = 1x,
lane 3 = cashout lane (hold it to bank the run). Speed and obstacle density ramp
continuously. Crashing forfeits the run's payout. Payout multiplier climbs to 2.5x.

**Current state (all committed, `git log` in this repo):**
- Single-file `index.html`, vanilla JS + canvas, no build step, no dependencies except
  the Luckiest Guy webfont.
- Original game simulation with real steering physics (heading-based lateral velocity,
  ~34° bank, rotated-rectangle SAT collision with a hitbox that shrinks while angled),
  moving traffic at varied per-wave speeds with follow logic, barrier rails, difficulty ramp.
- Three attacker models: `perfect` (scripted), `mirror` (perturbed replay of recorded
  traces), `generative` (fresh synthetic trace per swipe) with an **organic noise
  evasion** toggle (pink 1/f + 8-12Hz tremor + drift).
- Seven-signal client-side detector: reaction time (floor/variance/skew), swipe
  kinematics, noise character (Δ⁴/Δ² spectral whiteness), replay similarity (shape +
  timing), perfection, behavior texture, event integrity. Tiered enforcement:
  one strong signal → SUSPECT, convergent signals → BOT.
- Test-bench dashboard: live per-swipe path plot + velocity profile + metrics table,
  thumbnail gallery, RT/margin histograms, timestamped event log.
- Two server-side panels: $5 economy + skill-matched population sim (rake wall at 62.5%,
  bot at 70% = 5.2σ), and a 7-day session cadence model.

**Verified results so far (reproduce these; do not regress them):**
| scenario | verdict |
|---|---|
| perfect bot | BOT 0.75 |
| mirror bot, trusted events | BOT 0.73–0.75 |
| generative bot, iid noise | noise character 0.70 → SUSPECT/BOT |
| generative bot, **organic noise** | **HUMAN 0.21 — beats the whole client-side detector** |
| bot at 62.5% win rate (break-even) | already ~3.4σ population outlier |

---

## 1. Non-negotiable rules

These override any instinct to make the artifact look better than it is.

1. **Never invent a measurement.** Every number in the UI, README, or writeup must come
   from code that actually ran. If you state a threshold, state how it was derived.
2. **Label uncalibrated things as uncalibrated.** The current build does this; keep it.
3. **Never claim to have reverse-engineered, decompiled, inspected, or tested against
   Triumph's actual app.** Everything here is an original simulation built from public
   screenshots. Say so prominently. This matters legally and ethically — we are modeling
   a threat, not attacking a live money game. No part of this project should be usable
   as an actual cheat against their production app.
4. **Do not build anything that targets their real servers.** No network calls to
   Triumph, no API probing, no traffic capture. The value is in the analysis, not access.
5. **Verify before claiming.** Run it headless, screenshot it, read the numbers back.
   The prior agent caught four separate physics regressions only because it instrumented
   and re-ran instead of assuming. Do the same.
6. **Keep the arms-race honesty.** The evasive bot must keep beating the client-side
   detector in the shipped version. Do not "fix" that by tuning thresholds until it
   fails — that would be dishonest and would destroy the project's thesis.

---

## 2. Phase 1 — Calibrate against a real human corpus (highest value, do first)

Right now every detector threshold is a first-principles prior. This phase replaces
priors with measurement and is what elevates this from demo to research.

1. Josh has a swipe recorder from the `swipebot` project
   (`~/OneDrive/Desktop/projects/swipebot`, recorder page + `tools/augment.py`, designed
   to be served over LAN and used on a real iPhone). Reuse or rebuild it here.
2. Have Josh record a corpus of real human swipes **playing this game** — target 300-500
   swipes across multiple sessions, ideally on a phone (touch) and desktop (mouse), and
   ideally including a second person so it is not a single-subject study.
3. Store as `corpus/*.json`, **gitignored by default** (it is personal biometric-ish
   data) with a small committed sample if needed for CI.
4. Compute the real human distribution for every feature: jitter, Δ⁴/Δ² whiteness,
   velocity-peak position, duration, RT mean/cv/skew, nearest-neighbor shape distance.
5. **Produce a real ROC curve** per signal and for the ensemble: human corpus as
   negatives, each bot mode as positives. Report AUC, and pick thresholds at a stated
   false-positive rate (suggest FPR ≤ 0.1% — a false ban withholds someone's money).
6. Replace every hardcoded threshold with a calibrated constant in one config module,
   annotated with the FPR it was chosen at and the sample size behind it.
7. Ship the ROC curves as a panel in the dashboard and a figure in the writeup.

**This is the single most impressive thing you can add.** "I measured 400 real swipes,
here is the ROC, here are thresholds at 0.1% FPR" reads as an engineer who ships
detection systems. "I picked 2.0 because white noise theory says so" does not.

---

## 3. Phase 2 — Visual fidelity

Get more reference material and close the gap to pixel-accurate.

1. **Gather references.** Josh has three screenshots (start screen, gameplay, crash) in
   `~/Downloads/IMG_1167.png`, `IMG_1168.png`, `IMG_1169.png`. Get more:
   - Ask Josh for screen recordings / more screenshots (cashout flow, tournament lobby,
     entry-fee screen, results screen, multiplier animation, barrier variants, other
     vehicle types, night/alt themes if any).
   - Search the App Store listing (`apps.apple.com/us/app/triumph-arcade/id1608987929`),
     their YouTube/TikTok ads, press kit, and review sites for gameplay footage stills.
   - Save every reference into `references/` with a short caption file noting what each
     one establishes. Cite them in the writeup as the provenance of the visual work.
2. **Close these known gaps** (measure against references, do not eyeball):
   - Car sprites: the real ones are 3D-rendered with proper shading, wheel arches, and
     distinct models. Ours are flat rounded rects. Consider building 3-4 distinct
     vehicle silhouettes with a consistent light source.
   - Road texture: theirs has subtle asphalt noise and tire-wear streaks.
   - The rainbow lane: theirs is a soft continuous hue sweep with a specific saturation
     and blur; ours is close but verify against the reference side by side.
   - CASHOUT lane typography: check the exact repeat spacing, letter weight, and outline.
   - Crash: theirs has a specific smoke silhouette and camera shake/zoom. Add shake.
   - Add the missing screens: tournament entry ($ entry fee), results/payout screen.
3. **Build a side-by-side comparison figure** (reference vs ours) for the writeup. This
   is a strong credibility artifact on its own — it shows deliberate observation.

---

## 4. Phase 3 — Design system (GT-quality bar)

The dashboard currently looks like a competent dev tool. It needs to look like a product.

1. **Study the target aesthetic first, do not guess:**
   - Kevin Liu's open-source asset studio (find the actual repo; read its tokens,
     spacing scale, typography, component structure).
   - The General Translation homepage (generaltranslation.com) and the comparison page
     Josh built — he works there as Founding DX Engineer and knows these intimately.
     **Ask Josh for the URLs/repos and look at the real thing.**
   - Josh's own portfolio (joshuakappler.com) for his personal visual language.
2. **Build original tokens; do not copy proprietary GT code into this repo.** Match the
   quality bar and structural conventions (spacing rhythm, type scale, restraint in
   color, density of information, how panels are titled and separated) — not the assets.
   This project will be public and is going to a third party; keep it clean.
   *Flag for Josh:* consider whether shipping an external pitch artifact in his
   employer's exact visual identity is what he wants. Recommend deriving a distinct
   LaneGuard identity that is *as good*, rather than a GT clone.
3. Concretely, the dashboard needs:
   - A real type scale and one accent color used with discipline (the current build has
     five semantic colors competing).
   - Consistent card anatomy: title, optional subtitle/help, body, footer stats.
   - Proper empty/loading/warming-up states rather than "…".
   - Dark and light themes if the reference systems have both.
   - Responsive: it currently assumes ~1900px. Make it degrade gracefully to laptop.
   - Charts should follow one visual system (see the `dataviz` skill in this environment
     — read it before writing any chart code; it has a validated palette and rules).

---

## 5. Phase 4 — Real configuration surface

"Config dashboard stuff" means the reader can drive the whole system without editing code.

1. **A config panel with every meaningful parameter**, grouped and persisted to
   localStorage + encoded in the URL (shareable permalinks are a big credibility win):
   - *Game:* lane count, lane multipliers, base speed, speed ramp, density ramp, wave
     gap, barrier frequency, cashout hold time, steering rate, max steer angle, hitbox
     dimensions, hitbox shrink curve.
   - *Economy:* entry fee, rake %, players per match, payout curve, multiplier cap.
   - *Attackers:* reaction-time mean/sd/distribution family, noise model (iid / pink /
     tremor amplitude / drift), trace corpus size, error-injection rate, session
     scheduling profile.
   - *Detector:* every threshold, every signal weight, the escalation rules, and the
     SUSPECT/BOT cut points — with the calibrated default clearly marked so a reader can
     see when they have wandered off it.
2. **Preset scenarios** as one-click buttons: "naive scripted bot", "replay farm",
   "sophisticated evasive bot", "human baseline", "phone farm at scale". Each loads a
   full config + starts the run + annotates the log with what it is demonstrating.
3. **Reproducibility:** every run gets a seed. Same seed + same config = identical run.
   Show the seed in the UI and let the user set it. This is what makes the numbers
   checkable by a skeptic.
4. **Export:** download a run as JSON (config + seed + full event log + all per-swipe
   feature vectors + final verdict). Also a "copy summary for report" button. Consider
   an import path so a shared run can be replayed exactly.
5. **A headless batch mode:** run N sessions per attacker profile without rendering,
   aggregate detection rates, and emit the ROC/summary table. This should be runnable
   from CI so the README's numbers regenerate rather than rot.

---

## 6. Phase 5 — Engineering credibility

1. **Port to Next.js + TypeScript** for Vercel. Structure it so the valuable logic is
   framework-independent and testable:
   - `lib/sim/` — game physics, deterministic, pure.
   - `lib/attack/` — the three+ attacker models.
   - `lib/detect/` — feature extraction + signals + ensemble. No DOM access.
   - `lib/econ/` — economy and population models.
   - `app/` — the dashboard UI.
   Port carefully and verify parity against the current build at each step; the physics
   took several debugging rounds to get right (see git history) and is easy to break.
2. **Real tests (vitest):** golden-file tests on feature extraction, a test that each
   attacker is detected/not-detected as documented, determinism tests (same seed → same
   trace), and a regression test locking the calibrated thresholds.
3. **CI (GitHub Actions):** typecheck, lint, test, and the headless batch run.
4. Keep a `CHANGELOG` or keep commit hygiene high — the git history is itself evidence
   of method here, and a reviewer may look at it.

---

## 7. Phase 6 — Deploy + the writeup

1. **Deploy to Vercel** (Josh has the Vercel MCP tools available in this environment and
   a Vercel account). Get a clean production URL. Add OG meta tags + a preview image so
   the link unfurls well in email/Slack — this matters because the link is the pitch.
2. **Write the analysis page** (`/writeup`, also as `REPORT.md`). This is what the
   security engineer actually reads. Structure:
   - **Threat model.** Who attacks a real-money skill game, with what capability tiers
     (scripted → replay → generative → hardware-injected phone farm → collusion).
   - **What we built and why**, with the reference-vs-ours comparison figure.
   - **Signals, each with its physical rationale**, its measured human distribution, its
     ROC/AUC, and its chosen threshold + FPR.
   - **The arms race, honestly:** the organic-noise evasion, with the measurement showing
     it defeating our own detector. Lead with this, do not bury it.
   - **The economic argument:** the rake wall, the sweep table, "no profitable-and-hidden
     zone", and the recommendation to rank by win-rate z-score with behavioral
     corroboration.
   - **What a production system needs that this cannot have:** native touch pressure and
     touch-major/minor, true hardware timestamps, device attestation (Play Integrity /
     App Attest), cross-account behavioral fingerprinting for farms, payout-graph
     analysis for collusion, and server-authoritative game state.
   - **Limitations**, in a real section, unhedged.
3. **A 60-90 second screen recording** of the bench in action (mode switching, flags
   firing, the evasion beating the detector, the economy sweep). Embed it. Josh runs a
   2.1M-subscriber channel — the production quality of this video is a differentiator no
   other applicant will match, and it makes the artifact consumable in 90 seconds by
   someone who will not clone a repo.

---

## 8. Stretch ideas (pick by value, not by novelty)

- **Collusion modeling:** two accounts feeding each other wins; detect via the
  head-to-head graph (repeat-pairing rate far above random matchmaking expectation).
- **Multi-account farm fingerprinting:** N bot accounts sharing a trace corpus, detected
  by cross-account swipe-shape similarity that within-account analysis would miss.
- **A live "detector vs attacker" ladder:** let the reader tune the attacker to try to
  beat the detector themselves. Interactive adversarial play is memorable.
- **Cost-of-attack analysis:** device cost, per-account throughput, expected $/day at a
  given win rate vs the ban rate — the number that tells Triumph whether to care.
- **Server-authoritative replay validation:** simulate verifying a submitted run against
  the deterministic engine, showing which cheat classes that alone kills.

---

## 9. Acceptance criteria

Ship when all of these are true:

- [ ] Live Vercel URL, loads fast, looks like a product, degrades to laptop widths.
- [ ] Thresholds calibrated on a real human corpus, with ROC/AUC shown and FPR stated.
- [ ] The evasive attacker still visibly defeats the client-side detector.
- [ ] Every parameter is configurable in-UI; presets work; runs are seeded and shareable.
- [ ] Run export produces a JSON a third party could analyze independently.
- [ ] Tests + CI green; README numbers regenerate from the batch runner.
- [ ] Writeup reads like an engineer's report, with a real limitations section.
- [ ] Side-by-side reference comparison figure exists.
- [ ] Nothing in the repo claims access to, or works against, Triumph's real app.

---

## 10. Working agreement with Josh

- He is direct and dislikes filler; skip preamble, show working results.
- He commits and pushes without asking once things build and tests pass, on `main`.
- **No AI attribution** in commits or PRs (no Co-Authored-By, no "Generated with").
- Spawn subagents on Opus or lower, never Fable — pass an explicit `model`.
- Windows 11, PowerShell primary, Bash available; repos live in
  `~/OneDrive/Desktop/projects`.
- Ask him for: more game references/recordings, the GT comparison-page and asset-studio
  URLs, a swipe corpus recording session, and a decision on the visual-identity question
  in Phase 3. Everything else, decide and proceed.
