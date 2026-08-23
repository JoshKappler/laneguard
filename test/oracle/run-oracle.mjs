/*
 * Oracle harness: executes the LEGACY single-file build (legacy/index.html)
 * headless in Node with a stubbed DOM and a fully controlled clock, so the
 * old sim runs deterministically. It emits golden fixtures under test/golden/
 * that the TypeScript port is tested against:
 *
 *   features.json   — exact featurize() outputs for fixed input traces
 *   econ.json       — exact Econ.sim / Cadence metrics (seeded, deterministic)
 *   sessions.json   — behavioral outcomes per attacker scenario (verdict,
 *                     per-signal suspicion, feature stats) after 60/120/180 s
 *
 * This is a test utility. It contains no production logic — all numbers come
 * from running the legacy code itself.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");

/* ------------------------- DOM / timing stubs ------------------------- */
let simNow = 0;
let rafCb = null;

const gradientStub = { addColorStop() {} };
const ctxStub = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient")
        return () => gradientStub;
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop in target) return target[prop];
      return () => undefined; // every canvas method becomes a no-op
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);

class El {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.checked = false;
    this.value = "0";
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.title = "";
    this.width = 0;
    this.height = 0;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.style = {};
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    return c;
  }
  get childElementCount() {
    return this.children.length;
  }
  get firstChild() {
    return this.children[0] || null;
  }
  getContext() {
    return ctxStub;
  }
  addEventListener() {}
  setPointerCapture() {}
}

const els = new Map();
function byId(id) {
  if (!els.has(id)) {
    const el = new El(id);
    if (id === "game") {
      el.width = 400;
      el.height = 860;
    }
    const defaults = { botWR: "70", popN: "400", popG: "300", rakePct: "20" };
    if (defaults[id]) el.value = defaults[id];
    els.set(id, el);
  }
  return els.get(id);
}

globalThis.document = {
  getElementById: byId,
  createElement: (tag) => new El("<" + tag + ">"),
};
globalThis.window = { addEventListener() {} };
Object.defineProperty(globalThis, "performance", {
  value: { now: () => simNow },
  configurable: true,
  writable: true,
});
globalThis.requestAnimationFrame = (cb) => {
  rafCb = cb;
  return 1;
};
globalThis.setInterval = () => 0;

/* --------------------------- load legacy code --------------------------- */
const html = readFileSync(path.join(repo, "legacy", "index.html"), "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error("could not extract <script> from legacy/index.html");
const script =
  m[1] +
  "\n;globalThis.__oracle = { AC, Bot, Econ, Cadence, game, Input, mulberry32, gauss, resetRun };\n";
eval(script);
const { AC, Bot, Econ, Cadence, game, mulberry32 } = globalThis.__oracle;

function pump(frames) {
  for (let i = 0; i < frames; i++) {
    simNow += 1000 / 60;
    const cb = rafCb;
    rafCb = null;
    cb(simNow);
  }
}

const round = (x, d = 6) =>
  x === null || Number.isNaN(x) ? null : +x.toFixed(d);

/* --------------------- 1. feature-extraction goldens --------------------- */
function makeTrace(kind, seed) {
  const r = mulberry32(seed);
  const pts = [];
  const push = (x, y, t) => pts.push({ x: round(x), y: round(y), t: round(t) });
  if (kind === "clean-line") {
    for (let i = 0; i <= 8; i++) push(100 + (i / 8) * 110, 500, i * 11.25);
  } else if (kind === "curved-noisy") {
    for (let i = 0; i <= 13; i++) {
      const u = i / 13;
      push(
        90 + u * 130 + (r() - 0.5) * 3,
        480 + Math.sin(u * Math.PI) * 14 + (r() - 0.5) * 3,
        u * 180
      );
    }
  } else if (kind === "iid-noise") {
    for (let i = 0; i <= 13; i++) {
      const u = i / 13;
      push(80 + u * 120 + (r() - 0.5) * 2.4, 520 + (r() - 0.5) * 2.2, u * 150);
    }
  } else if (kind === "integer-coords") {
    for (let i = 0; i <= 9; i++)
      push(Math.round(120 + (i / 9) * 100), Math.round(510 + i), i * 14);
  } else if (kind === "short") {
    for (let i = 0; i <= 4; i++) push(100 + i * 12, 500 + i, i * 10);
  } else if (kind === "slow-arc") {
    for (let i = 0; i <= 19; i++) {
      const u = i / 19;
      const eased = u * u * (3 - 2 * u);
      push(
        60 + eased * 150 + (r() - 0.5) * 1.2,
        530 - Math.sin(u * Math.PI) * 22 + (r() - 0.5) * 1.4,
        u * 340
      );
    }
  }
  return pts;
}

const featureGoldens = [];
for (const kind of [
  "clean-line",
  "curved-noisy",
  "iid-noise",
  "integer-coords",
  "short",
  "slow-arc",
]) {
  const points = makeTrace(kind, 424242);
  const dur = points[points.length - 1].t - points[0].t;
  const f = AC.featurize({ points, trusted: true, source: "test", dur });
  featureGoldens.push({
    kind,
    points,
    dur: round(dur),
    expected: {
      jitter: round(f.jitter),
      white: round(f.white),
      wamp: round(f.wamp),
      peakT: round(f.peakT),
      len: round(f.len),
      intFrac: round(f.intFrac),
      profile: f.profile.map((v) => round(v)),
      res: f.res.map((p) => ({ x: round(p.x), y: round(p.y) })),
    },
  });
}

/* distance helpers golden: shapeDist / profileDist between two fixtures */
const fa = AC.featurize({
  points: makeTrace("curved-noisy", 1),
  trusted: true,
  dur: 180,
});
const fb = AC.featurize({
  points: makeTrace("curved-noisy", 2),
  trusted: true,
  dur: 180,
});
const distGolden = {
  aSeed: 1,
  bSeed: 2,
  shapeDist: round(AC.shapeDist(fa.res, fb.res)),
  profileDist: round(AC.profileDist(fa.profile, fb.profile)),
};

/* stats/skewness goldens */
const statsInput = [210, 260, 240, 300, 520, 233, 251, 247, 268, 244];
const statsGolden = {
  input: statsInput,
  stats: (() => {
    const s = AC.stats(statsInput);
    return { mean: round(s.mean), sd: round(s.sd), min: s.min, cv: round(s.cv) };
  })(),
  skewness: round(AC.skewness(statsInput)),
};

/* ------------------------ 2. econ/cadence goldens ------------------------ */
const econScenarios = [];
for (const wr of [0.55, 0.6, 0.625, 0.65, 0.7, 0.8]) {
  const s = Econ.sim(400, 300, wr);
  econScenarios.push({
    nPlayers: 400,
    nGames: 300,
    botWR: wr,
    mean: round(s.mean),
    sd: round(s.sd),
    z: round(s.z),
    pctile: round(s.pctile),
    noise: round(s.noise),
  });
}
const econGolden = {
  breakEven: { entry: 5, rake: 0.2, value: 0.625 },
  scenarios: econScenarios,
};

const cad = Cadence.sim();
const cadGolden = {};
for (const k of ["human", "farm", "sched"]) {
  const met = Cadence.metrics(cad[k]);
  cadGolden[k] = {
    n: met.n,
    cv: round(met.cv),
    activeHours: met.activeHours,
    longestIdle: round(met.longestIdle),
  };
}

/* ------------------------ 3. behavioral scenarios ------------------------ */
function snapshotAnalysis() {
  const r = AC.analyze();
  const swipes = AC.swipes;
  const ws = swipes.filter((s) => !Number.isNaN(s.white));
  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  return {
    overall: round(r.overall, 4),
    ready: r.ready,
    verdict: !r.ready
      ? "WARMING UP"
      : r.overall < 0.33
        ? "HUMAN"
        : r.overall < 0.58
          ? "SUSPECT"
          : "BOT",
    signals: Object.fromEntries(
      r.signals.map((s) => [s.name, { sus: round(s.sus, 4), ready: s.ready }])
    ),
    flags: r.flags,
    counters: {
      dodges: AC.dodges,
      deaths: AC.deaths,
      moves: AC.moves,
      swipes: swipes.length,
      aborts: AC.aborts,
      risks: AC.risks.length,
      runEnds: AC.runEnds.length,
      cashouts: AC.runEnds.filter((k) => k === "cashout").length,
    },
    featureStats: {
      meanJitter: round(avg(swipes.map((s) => s.jitter)), 4),
      meanWhite: round(avg(ws.map((s) => s.white)), 4),
      meanWamp: round(avg(ws.map((s) => s.wamp)), 4),
      rtMean: round(avg(AC.rts), 2),
      rtMin: AC.rts.length ? round(Math.min(...AC.rts), 2) : null,
      rtCv: AC.rts.length
        ? round(AC.stats(AC.rts).cv, 4)
        : null,
      marginCv: AC.margins.length
        ? round(AC.stats(AC.margins).cv, 4)
        : null,
    },
  };
}

const scenarios = [
  { name: "perfect-untrusted", mode: "perfect", hw: false, organic: false },
  { name: "perfect-trusted", mode: "perfect", hw: true, organic: false },
  { name: "mirror-untrusted", mode: "mirror", hw: false, organic: false },
  { name: "mirror-trusted", mode: "mirror", hw: true, organic: false },
  { name: "generative-iid-trusted", mode: "generative", hw: true, organic: false },
  { name: "generative-organic-trusted", mode: "generative", hw: true, organic: true },
  { name: "generative-organic-untrusted", mode: "generative", hw: false, organic: true },
];

const sessionGoldens = [];
for (const sc of scenarios) {
  AC.reset();
  // Dash.reset touches only display state; AC.reset covers detector state.
  byId("hwInject").checked = sc.hw;
  byId("organicNoise").checked = sc.organic;
  Bot.set(sc.mode);
  const snaps = {};
  pump(60 * 60);
  snaps["60s"] = snapshotAnalysis();
  pump(60 * 60);
  snaps["120s"] = snapshotAnalysis();
  pump(60 * 60);
  snaps["180s"] = snapshotAnalysis();
  sessionGoldens.push({ scenario: sc, snapshots: snaps });
  Bot.set(null);
}

/* --------------------------------- emit --------------------------------- */
const outDir = path.join(repo, "test", "golden");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "features.json"),
  JSON.stringify({ traces: featureGoldens, dist: distGolden, stats: statsGolden }, null, 1)
);
writeFileSync(path.join(outDir, "econ.json"), JSON.stringify({ econ: econGolden, cadence: cadGolden }, null, 1));
writeFileSync(path.join(outDir, "sessions.json"), JSON.stringify(sessionGoldens, null, 1));

/* human-readable summary so the oracle itself can be sanity-checked against
   the README's verified-results table */
console.log("=== econ ===");
for (const s of econScenarios)
  console.log(
    `botWR ${(s.botWR * 100).toFixed(1)}%  z=${s.z.toFixed(2)}  pctile=${s.pctile.toFixed(2)}  (pop mean ${(s.mean * 100).toFixed(1)}% sd ${(s.sd * 100).toFixed(2)}pp)`
  );
console.log("=== cadence ===");
for (const k of Object.keys(cadGolden))
  console.log(k, JSON.stringify(cadGolden[k]));
console.log("=== sessions (180s snapshot) ===");
for (const g of sessionGoldens) {
  const s = g.snapshots["180s"];
  console.log(
    `${g.scenario.name.padEnd(28)} ${s.verdict.padEnd(8)} overall=${s.overall}  jitter=${s.featureStats.meanJitter}  white=${s.featureStats.meanWhite}  swipes=${s.counters.swipes} dodges=${s.counters.dodges} deaths=${s.counters.deaths}`
  );
}
console.log("golden fixtures written to test/golden/");
