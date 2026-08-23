# Human swipe corpus

Real human swipe traces recorded playing the LaneGuard game, used to calibrate
every detector threshold against a measured human distribution instead of a
first-principles prior.

**This data is gitignored by default.** Swipe kinematics are behavioral-biometric
adjacent — they can fingerprint an individual — so raw recordings are not
committed. `corpus/sample/` is tracked and reserved for a small consented,
anonymized slice.

**Status: the directory is empty — no corpus has been recorded yet.** No
synthetic stand-in is committed either, deliberately: a fabricated corpus would
produce fitted-looking thresholds that mean nothing. Until a real recording
exists, `lib/detect/thresholds.generated.ts` says `basis: "prior"` and the bench
labels every cut as uncalibrated.

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

Serve `recorder/index.html` over your LAN and open it on a phone. Export
produces one JSON per session; drop it in `corpus/`. Then regenerate calibrated
thresholds:

```
pnpm calibrate   # writes lib/detect/thresholds.generated.ts + results/calibration.json
```

Aim for 300–500 swipes, ideally across both phone (touch) and desktop (mouse)
and more than one subject — `calibrate` needs ≥ 50 swipes before it will fit
anything, and separates by input type because motor noise differs between them.
