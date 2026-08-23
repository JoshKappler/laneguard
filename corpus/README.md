# Human swipe corpus

Real human swipe traces recorded playing the LaneGuard game, used to calibrate
every detector threshold against a measured human distribution instead of a
first-principles prior.

**This data is gitignored by default.** Swipe kinematics are behavioral-biometric
adjacent — they can fingerprint an individual — so raw recordings are not
committed. Only `corpus/sample/` (a small, consented, anonymized slice) is
tracked, so CI and the ROC pipeline have something to run against.

## Format

Each file is one recording session, matching the `swipebot` recorder schema:

```json
{
  "meta": { "subject": "s1", "device": "iphone-13", "input": "touch", "date": "2026-08-22" },
  "swipes": [
    { "id": 1, "dir": "R", "dur": 180, "points": [ { "x": 121.0, "y": 540.2, "t": 0 }, ... ] }
  ]
}
```

- `input`: `touch` (phone) or `mouse` (desktop) — kept separate; motor noise differs.
- `subject`: opaque id, not a real name.
- `points`: raw pointer samples, `t` in ms from gesture start.

## Recording

Serve `recorder/index.html` over your LAN and open it on a phone (see
`docs/corpus.md`). Export produces one JSON per session; drop it in `corpus/`.
Then regenerate calibrated thresholds:

```
pnpm calibrate   # writes lib/detect/thresholds.generated.ts + docs/roc figures
```
