# Reference Image Manifest

Public visual reference material for the Drive game inside the Triumph Arcade iOS app
(Triumph Labs / triumpharcade.com). All images below are either (a) screenshots the user
already had on their own device, or (b) images fetched from public marketing pages
(App Store listing, triumpharcade.com / triumphlabs.com, YouTube thumbnail CDN). No app
binary was downloaded, no server/API was probed, no login walls were crossed.

Retrieval date for every fetched item: **2026-08-22**.

---

## 1. Original device screenshots (source: user's own iPhone, provided locally)

These three have no public source URL — they are the user's own screen captures,
originally at `C:\Users\joshu\Downloads\IMG_1167/1168/1169.png`, copied into this repo.
Included here for completeness/cross-reference, not because they were "found" during
this research pass.

### triumph-drive-start.png
- **Source:** local file, `C:\Users\joshu\Downloads\IMG_1167.png` (not a web URL)
- **Retrieved:** 2026-08-22 (copied into repo)
- **Shows:** Drive's start/title screen. A blue sedan (rear 3/4 view, top-down chase
  camera) sits centered in the middle lane of a straight highway. Overlaid text reads
  "Swipe left/right to change lanes" (with a left/right swipe-arrow icon) and "Use
  cashout lane to keep your score" (with a highway-exit icon), plus Sound/Music/Haptics
  toggle icons along the top and "TAP TO START" in yellow outlined text at the bottom.
  A soft multi-color rainbow gradient (red-purple-blue-green-yellow-red) runs vertically
  down the far-left lane/shoulder. Green text reading "CASH…" (cut off, presumably
  "CASHOUT") runs along the right-hand guardrail.

### triumph-drive-gameplay.png
- **Source:** local file, `C:\Users\joshu\Downloads\IMG_1168.png` (not a web URL)
- **Retrieved:** 2026-08-22 (copied into repo)
- **Shows:** Mid-run gameplay. HUD displays a large "$0", "SCORE: 101", and a black
  "2X" multiplier badge. The blue player car is in the middle lane; a yellow car and a
  white car occupy adjacent lanes ahead, with a magenta/pink car further in the
  distance. The right guardrail repeats green "CASHOUT" text vertically; the same
  rainbow-gradient lane from the start screen runs down the left edge.

### triumph-drive-crash.png
- **Source:** local file, `C:\Users\joshu\Downloads\IMG_1169.png` (not a web URL)
- **Retrieved:** 2026-08-22 (copied into repo)
- **Shows:** Crash/game-over screen. Large white "CRASHED" headline; the blue player
  car is shown engulfed in fire and black smoke after hitting a red rectangular
  barrier/pylon in the left lane (the collision object is visible just above the
  wreck). "TAP TO CONTINUE" appears at the bottom. Rainbow-gradient lane visible at
  bottom-left; a green diagonal guardrail line is visible at top-right.

### triumph-drive-gameplay-hires.png / triumph-drive-crash-hires.png
- **Source:** local files, `IMG_1195.PNG` / `IMG_1196.PNG` (not web URLs)
- **Retrieved:** 2026-08-24 (copied into repo)
- **Shows:** A second pair of the user's own captures, same game, cleaner frames.
  The gameplay one is what the renderer's projection is fitted to: road lines in it
  converge on a point 0.170 frame-heights above the top edge, and a line one lane off
  the camera axis moves sideways 0.1097 px per px down the frame. The crash one shows
  the wreck, smoke plume, and "TAP TO CONTINUE" screen at higher fidelity than
  `triumph-drive-crash.png`.

---

## 2. App Store listing (source: https://apps.apple.com/us/app/triumph-arcade/id1608987929)

Page fetched successfully (HTTP 200). Screenshot images live on the `mzstatic.com` CDN
as `srcset` entries; native resolution embedded in the filename was requested directly
(bypassing the smaller preview crops). The listing exposes 7 screenshots numbered 1-6
and 8 (no screenshot 5's numbering gap — a "_7" asset was searched for and does not
appear anywhere in the page source, so it was not skipped by us; it simply isn't in
this listing's markup).

**None of these 7 official App Store screenshots depict the Drive game.** They cover
other titles in the Triumph Arcade portfolio plus app-wide monetization/marketing
screens.

### appstore-01.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/b2/e1/a9/b2e1a925-a300-a4a9-8a72-92f3e3a5d1e3/1242x2688_1.jpg/1242x2688bb.jpg` (1242x2688)
- **Shows:** "PLAY GAMES & WIN CASH" headline over two phone mockups. Left phone: the
  Golf game (3rd-person golfer mid-swing, "Par 4 Stroke 6" HUD, putting-green minimap,
  "15.2 MPH" power readout). Right phone: the Chaos Cannon game (turret vs. falling
  numbered rocks against a mountain backdrop, score "407", timer "2:34", "TRIUMPH.GG"
  watermark).

### appstore-02.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/51/f4/d0/51f4d02d-e322-ed29-06ea-d2240a361017/1242x2688_2.jpg/1242x2688bb.jpg` (1242x2688)
- **Shows:** Pure marketing copy screen: "$400M+ IN PAYOUTS" over falling-cash imagery,
  with three claims — "WIN REAL MONEY", "WITHDRAW INSTANTLY", "ALWAYS REAL OPPONENTS" —
  each with an icon. No gameplay.

### appstore-03.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/2d/74/0e/2d740e41-f7e8-461b-1f80-861aff001a8b/1242x2688_3.jpg/1242x2688bb.jpg` (1242x2688)
- **Shows:** Stylized 3D orange-on-gray map of the continental US plus Alaska/Hawaii,
  "LIVE IN 38 STATES" caption. No gameplay.

### appstore-04.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/01/6f/68/016f6814-b189-c0ad-6b8b-8609898c9364/1242x2688_4.jpg/1242x2688bb.jpg` (1242x2688)
- **Shows:** "INSTANT, SECURE CASH OUT" — an actual results/cashout UI screenshot: a
  "Cash Out" panel ("Minimum withdrawal is $5"), a highlighted row of payment-method
  logos (PayPal, Venmo, Apple Pay, Visa, Mastercard), "Withdrawable cash $386.50",
  "Daily limit remaining $5,000", and a "Withdrawal history" list of three completed
  withdrawals dated Aug/Sept 2025 ($104.00, $86.34, $210.90). **This is the
  cashout/payout screen fact the research project needed; not present in the original
  3 screenshots.**

### appstore-05.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/dc/11/52/dc115277-54ba-9a84-6b73-ba69f76c97e2/1242x2688_5.jpg/1242x2688bb.jpg` (1242x2688)
- **Shows:** "EXCLUSIVE TITLES" collage of ~14 tilted game-screenshot tiles: a
  low-poly city/rooftop runner, Chaos Cannon, a basketball view, a
  word/keyboard tile game, 8 Ball Pool, a Solitaire card game, an American football
  play, a Tetris-style falling-block game, a space-shooter/asteroids scene, and a
  top-down road-and-stream **"Chicken Run"** crossing game (yellow taxi + red car in
  lanes, a duck/chicken character, trees, a stream, "CASH OUT" text). Note: this last
  tile is visually similar in theme (cars in lanes) to Drive but is confirmed a
  **different game** — see `triumphlabs-chickenrun-title-art.png` below. No tile in
  this collage shows Drive.

### appstore-06.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/72/59/2e/72592e4e-ed4a-2430-d6b8-b08db71b00e1/1242x2688_6.jpg/1242x2688bb.jpg` (1242x2688)
- **Shows:** "COMPETE & CLIMB THE RANKS" — a season-long ranked-league screen. Five
  tier-badge medallions across the top, then a phone mockup of "Platinum League"
  ("Prize pool: $100", progress bar "15/400" toward next league, wallet balance
  "$9.58"), and a "CURRENT RANKINGS" leaderboard listing three players with usernames,
  crown-point totals, and dollar prize amounts (1st $40, 2nd/"YOU" $30, 3rd $25). This
  is a persistent ranked ladder, not a single-match entry-fee screen — closest match
  found to a "tournament lobby" but not a literal buy-in/entry-fee UI.

### appstore-08.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/d3/74/c8/d374c8ac-6fa6-3ea3-3949-f295725bc241/1290x2796_8.jpg/1290x2796bb.jpg` — note: URL path names a 1290x2796 size class but the CDN delivered a 1242x2688 image for this request
- **Shows:** "REAL-TIME MULTIPLAYER" screen split diagonally between Hex.io
  (hex-grid territory game) and Snake Royale (multiplayer snake game where each of
  three visible snakes carries a live dollar tag: $0.52, $0.38, $0.49). Demonstrates
  the app's per-player cash-stake HUD convention used elsewhere in the app; not Drive.

### appstore-preview-video-poster.jpg
- **Source:** `https://is1-ssl.mzstatic.com/image/thumb/PurpleVideo221/v4/e7/1d/52/e71d521e-4e40-d75e-1118-bd91bb188ba1/e3db5e21d4f6a69cff769731383631ea_Preview_Image_Intermediate_nonvideo_451435110_2748955945.png/1242x2688bb.jpg` (delivered 886x1920)
- **Shows:** First frame (poster image) of the App Store listing's autoplaying
  "app preview" video. Depicts the **"Shapes"** game: neon-outlined 3D shapes (circles,
  squares, triangles, hexagons) falling toward a doorway-shaped bin on a glowing white
  grid floor, "NEXT" button top-right, pause button top-left. Not Drive. No video file
  was downloaded — only this static poster frame, which is a static image asset in the
  page, not the video itself.

---

## 3. Triumph Labs company website (source: https://triumpharcade.com and https://triumphlabs.com)

`https://triumpharcade.com` redirects (HTTP redirect, followed automatically) to
`https://www.triumphlabs.com/` — both fetched successfully, both resolve to the same
page. The page is a Next.js/Vercel app; images were located via `/v2/...` static asset
paths embedded in the server-rendered HTML (`alt` attributes identify each game by
name). A `/payments` sub-page was also checked and contains no images (text-only
payment-provider legal page).

### triumphlabs-drive-title-art.jpg
- **Source:** `https://www.triumphlabs.com/v2/arcade2/game-landing-drive.jpg` (linked from triumpharcade.com/triumphlabs.com home page, `alt="Drive"`), native resolution 786x600
- **Shows:** Official promotional title-card artwork for **Drive**, from the game
  carousel on Triumph Labs' own site. This is stylized illustration, not an in-game
  screenshot: a chunky 3D "DRIVE" wordmark in blue-to-red gradient lettering in front
  of a large speedometer-gauge graphic, flanked by an orange/yellow sedan (rear 3/4
  view, left) and a gray cargo van (rear view, right) on a sunlit highway, with a city
  skyline, trees, and clouds in the background. **Establishes two vehicle designs
  (orange sedan, gray van) not seen in the three original gameplay screenshots**
  (which show blue/yellow/white/magenta cars) — caveat: this is marketing key-art, so
  it is not confirmed to match the in-game 3D models exactly. Also establishes the
  game's official logo/typography treatment (3D beveled italic lettering, blue-red
  gradient).

### triumphlabs-chaoscannon-title-art.png
- **Source:** `https://www.triumphlabs.com/v2/arcade2/game-1.png` (`alt="Chaos Cannon"`), 684x520
- **Shows:** Title card for "Chaos Cannon" (snow-capped mountain, floating boulders,
  metallic beveled "CHAOS CANNON" logo). Saved for disambiguation only: this is the
  game featured in nearly all Triumph-Arcade-related YouTube content found (see
  section 4), confirming those videos are **not** about Drive.

### triumphlabs-chickenrun-title-art.png
- **Source:** `https://www.triumphlabs.com/v2/arcade2/game-4.png` (`alt="Chicken Run"`), 922x706
- **Shows:** Title card for "Chicken Run" (cartoon tree, rolling green hills, a road,
  scattered feathers, red/tan "CHICKEN RUN" logo). Saved to confirm that the
  cars-in-lanes tile visible in `appstore-05.jpg`'s collage is this separate game, not
  Drive.

Full game roster named on triumphlabs.com (for context, images not all saved since
they're unrelated to Drive/tournament/cashout): 8 Ball Pool, Block Party, Brick
Breaker, Chaos Cannon, Chicken Run, Color Smash, **Drive**, Galaxy, Golf, Hockey, Obby,
Pool, Shapes, Touchdown, Tumble Guys.

---

## 4. YouTube search (web search + official channel review)

**No YouTube video was found that clearly shows Drive gameplay — no thumbnails were
downloaded as a result**, per the task instruction to only save thumbnails for videos
that clearly show Drive. This was checked thoroughly, not just a single search:

- Searched YouTube (both via web search and directly in a browser) for combinations of
  "Triumph Arcade Drive game gameplay", "Triumph Arcade Drive lane change car crash",
  and general "Triumph Arcade ad/review" queries.
- Identified the real official channel — **youtube.com/@TriumphArcade** ("Triumph
  Arcade is America's #1 skill-based cash gaming app... Paid out over $600M to real
  players", 22 subscribers) — and enumerated its full 5-video catalog: "The Setup.",
  "First Date.", "Wedding Day.", "Poker Game.", "The Interview." (all ~1:30 live-action
  narrative ad vignettes with no in-app UI visible in their thumbnails; no game footage,
  let alone Drive). Note: an earlier search result had pointed to a different, now
  dead/renamed channel ID (`UC9FXhcm69ZnaeXVbXYoiZJQ`, "This channel does not exist")
  — that was a dead end, not the real channel.
- Checked thumbnails (via YouTube's public oEmbed endpoint + `i.ytimg.com` thumbnail
  CDN) for 11 third-party review/challenge videos surfaced by search. All that actually
  showed in-app footage showed **Chaos Cannon** or **Brick Breaker**, e.g.:
  - "Triumph Honest Review 2026 - SCAM or LEGIT??" — youtube.com/watch?v=xM3brBIdPGw
  - "Triumph Arcade Review 2026 – Legit or Scam?" — youtube.com/watch?v=YKy1y2z-zxU
  - "30 Day Chaos Cannon Challenge" (several videos) — channel TDSheridan Lab
  - "🎮💰 Triumph's Story: From Brick Breaker to the $100Mil" — youtube.com/watch?v=P0RWFqHfJhQ
  - "Triumph Review - All Roads Lead To..." (youtube.com/watch?v=QR-nTsmJfDY) looked
    promising by title but is confirmed **unrelated** — it's a board-game reviewer
    (BoardGameCo) reviewing a Roman-themed board game called "Triumph", not the app.
  - Other channel content found in passing: a "Rips" (trading-card-break) challenge
    series, a "Doodle Jump on Triumph" video, and a video titled "Triumph arcade the
    new penguins game is a scam" (indicates a "penguins" game exists that isn't in the
    triumphlabs.com roster captured above — likely added after that page's last
    deploy, or named differently there).
- Also checked the App Store listing's own autoplaying preview-video poster frame
  (saved above as `appstore-preview-video-poster.jpg`) — shows the "Shapes" game, not
  Drive.

**Candidate URLs for a human to manually watch** (in case Drive appears mid-video even
though it's absent from the thumbnail — not verified by us):
- Official channel: https://www.youtube.com/@TriumphArcade/videos
- https://www.youtube.com/watch?v=P0RWFqHfJhQ ("Triumph's Story: From Brick Breaker to
  the $100Mil" — retrospective, may contain a montage of multiple games)
- https://www.youtube.com/watch?v=xM3brBIdPGw and
  https://www.youtube.com/watch?v=YKy1y2z-zxU (general app review videos that show
  more than one in-app screen)

---

## 5. Gameplay screen recording (source: user's own device, NOT in this repo)

On **2026-08-24** the user recorded one full Drive session on their own iPhone
(`ScreenRecording_08-24-2026 17-41-00_1.MP4`, 1206x2622, ~59.17 fps variable,
67.7 s: lobby, one $3.01-entry run to a crash at score 7,871). The file stays on
the user's machine and is deliberately not committed (it contains a personal
notification overlay partway through). Every motion, scoring, and layout constant
in the simulator was re-fitted frame-by-frame against it:

- projection (vanishing point, depth constant, lane pitch) and the ground-plane
  zoom-out that tracks road speed while car sprites keep constant pixel width
- road speed ramp (~50 + 0.9/s), lane-change S-curve and the camera's
  underdamped spring, wave spacing/mix, per-lane traffic weights, traffic
  forward speed (~half road speed), barrier placement
- continuous lane-scaled scoring (0.50 per z in a 1x lane) and the dollar payout
  curve read off the HUD point by point, break-even ~5,430, flat 1.29x tier at
  5,582, lobby tiers to 3.0x
- HUD geometry (dollar/score/badge sizes and baselines, slashed zeros, the READY
  1X placeholder), READY/GO sequence timing, and the crash screen roll-down

The fitted values live in `lib/core/config.ts` (game physics/payout) and
`lib/ui/renderer.ts` (projection and drawing constants).

The two reference stills published in `public/compare/` (`ref-start.png`,
`ref-gameplay.png`) are single frames from this recording, at 3.55 s (settled
start screen) and 10.12 s (early gameplay). Both frames were checked
before publishing; the personal notification visible elsewhere in the
recording is in neither.

---

## Summary of files in this directory

| File | Origin |
|---|---|
| triumph-drive-start.png | user's own device (local) |
| triumph-drive-gameplay.png | user's own device (local) |
| triumph-drive-crash.png | user's own device (local) |
| triumph-drive-gameplay-hires.png | user's own device (local) |
| triumph-drive-crash-hires.png | user's own device (local) |
| appstore-01.jpg through appstore-06.jpg, appstore-08.jpg | apps.apple.com listing |
| appstore-preview-video-poster.jpg | apps.apple.com listing (app-preview video poster) |
| triumphlabs-drive-title-art.jpg | triumphlabs.com |
| triumphlabs-chaoscannon-title-art.png | triumphlabs.com |
| triumphlabs-chickenrun-title-art.png | triumphlabs.com |
