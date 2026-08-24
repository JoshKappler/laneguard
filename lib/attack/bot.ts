/*
 * Attacker models, all driven through the same input pipeline the human uses;
 * the detector never sees which one is running.
 *   perfect    — instant reaction, machine-clean synthetic swipes
 *   mirror     — perturbed replay of a small recorded-trace corpus
 *   generative — a fresh human-shaped trace per swipe, iid or organic noise,
 *                plus the stealth kit: ex-Gaussian RTs gated to threat onset,
 *                real contested-space risks, fake aborts. See REPORT.md §3.
 */
import type { BotConfig, PlayMode } from "@/lib/core/config";
import { mulberry32, gauss, type Rand } from "@/lib/core/rng";
import type { Car, Engine, TelemetryEvent } from "@/lib/sim/engine";

export interface TracePoint {
  x: number;
  y: number;
  t: number;
}

/*
 * Direction is re-derived at fire time (the road changes during a reaction
 * delay); only a deliberate risk keeps its original contested direction.
 */
type Intent = "react" | "bank" | "risk";

interface Pending {
  fireAt: number;
  dir: number;
  /** the RT this fire is scheduled to realize (for gating) */
  rt: number;
  intent: Intent;
  /** threat onset time this reaction is measured from (reactive dodges only) */
  threatAt: number;
}

interface SwipeRun {
  trace: TracePoint[];
  i: number;
  dir: number;
  startX: number;
  startY: number;
  t0: number;
  trusted: boolean;
}

export class Bot {
  engine: Engine;
  cfg: BotConfig;
  mode: PlayMode;
  hwInject: boolean;
  private rand: Rand;
  private pending: Pending | null = null;
  private swipeRun: SwipeRun | null = null;
  private baseTraces: TracePoint[][] = [];
  private nextAbortAt: number;
  private nextRiskAt: number;

  constructor(
    engine: Engine,
    cfg: BotConfig,
    mode: PlayMode,
    hwInject: boolean,
    seed: number
  ) {
    this.engine = engine;
    this.cfg = cfg;
    this.mode = mode;
    this.hwInject = hwInject;
    this.rand = mulberry32(seed);
    this.buildCorpus();
    this.nextAbortAt = this.scheduleNext(cfg.abortsPerMin);
    this.nextRiskAt = this.scheduleNext(cfg.riskPerMin);
  }

  /** replace the synthesized corpus with user-recorded traces (mirror mode) */
  setCorpus(traces: TracePoint[][]) {
    if (traces.length) this.baseTraces = traces;
  }

  private scheduleNext(perMin: number): number {
    if (perMin <= 0) return Infinity;
    // exponential inter-arrival with mean 60/perMin seconds
    const meanS = 60 / perMin;
    return this.engine.now + -Math.log(Math.max(this.rand(), 1e-9)) * meanS * 1000;
  }

  private buildCorpus() {
    const size = this.cfg.mirror.corpusSize;
    const seeds = [11, 23, 37, 53, 71, 89, 101, 113];
    const mk = (seed: number): TracePoint[] => {
      const r = mulberry32(seed);
      const n = 14,
        dur = 150 + r() * 70,
        len = 115 + r() * 30,
        arc = (r() - 0.5) * 18;
      const skew = 0.38 + r() * 0.18;
      const pts: TracePoint[] = [];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const p =
          u < skew
            ? (u / skew) * (u / skew) * 0.5
            : 0.5 + (1 - Math.pow(1 - (u - skew) / (1 - skew), 2)) * 0.5;
        pts.push({
          x: p * len + (r() - 0.5) * 2.6,
          y: Math.sin(u * Math.PI) * arc + (r() - 0.5) * 2.2,
          t: u * dur,
        });
      }
      return pts;
    };
    this.baseTraces = seeds.slice(0, size).map(mk);
  }

  private sampleRt(): number {
    const R = this.cfg.rt;
    if (R.family === "exgaussian") {
      // Normal(mean,sd) + Exponential(tau): a right-skewed lapse tail no
      // symmetric Gaussian sampler produces.
      const g = gauss(this.rand, R.mean, R.sd);
      const e = -R.tau * Math.log(Math.max(this.rand(), 1e-9));
      return Math.max(R.floor, g + e);
    }
    return Math.max(R.floor, gauss(this.rand, R.mean, R.sd));
  }

  /* ------------------------- planning (ported) ------------------------- */

  private laneClear(l: number, threatCar: Car | null): boolean {
    const e = this.engine,
      s = e.state;
    if (e.barrierBlocks(s.lane, l, s.speed * 0.9)) return false;
    for (const bar of s.barriers) {
      if (bar.boundary !== l - 1 && bar.boundary !== l) continue;
      if (bar.z1 > -e.HLZ - 3 && bar.z0 < e.HLZ + s.speed * 0.6) return false;
    }
    for (const car of s.cars) {
      if (car === threatCar || car.passed || car.lane !== l) continue;
      const lead = e.closing(car) * 0.55 + e.COLL_Z;
      if (car.z > -e.COLL_Z - 1 && car.z < lead) return false;
    }
    return true;
  }

  private firstObs(l: number): number {
    const e = this.engine;
    let m = 99;
    for (const car of e.state.cars) {
      if (car.passed || car.lane !== l || car.z <= -e.COLL_Z) continue;
      const t = Math.max(0, (car.z - e.COLL_Z) / e.closing(car));
      if (t < m) m = t;
    }
    return m;
  }

  private crossOk(from: number, dir: number): boolean {
    return !this.engine.barrierBlocks(from, from + dir, this.engine.state.speed * 0.9);
  }

  private safeDir(): number {
    const e = this.engine,
      s = e.state,
      cfg = e.cfg;
    const here = s.lane;
    const tHere = this.firstObs(here);
    const clamp = (t: number) => Math.min(t, 4);
    const dying = tHere < 0.7;
    const val = (l: number) => (dying ? 0 : cfg.laneMult[l] * 0.3);
    const margin = dying ? 0.05 : 0.6;
    let best = here,
      bestU = clamp(tHere) + val(here);
    for (let l = 0; l < e.laneCount; l++) {
      if (l === here) continue;
      const dir = Math.sign(l - here);
      let ok = true;
      for (let m = here; m !== l; m += dir) {
        if (!this.crossOk(m, dir)) {
          ok = false;
          break;
        }
        const step = m + dir;
        if (step !== l && this.firstObs(step) < 0.9) {
          ok = false;
          break;
        }
      }
      if (!ok || !this.laneClear(l, null)) continue;
      const u = clamp(this.firstObs(l)) + val(l) - 0.35 * Math.abs(l - here);
      if (u > bestU + margin) {
        best = l;
        bestU = u;
      }
    }
    if (best === here) return 0;
    const urgent = tHere < (this.mode === "perfect" ? cfg.threatWindow * 0.826 : cfg.threatWindow);
    if (!urgent) {
      if (s.x !== s.lane) return 0;
      if (tHere > 2.2 && bestU - clamp(tHere) < 1.0) return 0;
    }
    return Math.sign(best - here);
  }

  /** the car laneChange() would credit with the RT if we leave `from` now */
  private creditedThreat(from: number): Car | null {
    let best: Car | null = null;
    for (const car of this.engine.state.cars) {
      if (car.passed || car.rtLogged || !car.threatAt) continue;
      if (car.lane !== from) continue;
      if (!best || car.z < best.z) best = car;
    }
    return best;
  }

  /**
   * The smallest reaction time the detector could credit if we left `from`
   * right now, in ms. Considers every un-logged threat in the lane (the engine
   * credits the nearest by depth, which may not be the oldest) and treats cars
   * about to enter the threat window as age-0 threats — because a car that
   * becomes a threat DURING the brief swipe would be credited with a near-zero
   * RT. Returns Infinity if nothing could be credited.
   */
  private minCreditAge(from: number, now: number): number {
    const e = this.engine;
    let min = Infinity;
    for (const car of e.state.cars) {
      if (car.passed || car.rtLogged || car.lane !== from) continue;
      let age: number;
      if (car.threatAt) age = now - car.threatAt;
      else {
        const tti = (car.z - e.COLL_Z) / e.closing(car);
        if (tti <= 0 || tti >= e.cfg.threatWindow + 0.15) continue;
        age = 0; // imminent: will become a fresh threat mid-swipe
      }
      if (age < min) min = age;
    }
    return min;
  }

  /** true once the run has banked enough score that the player should stop
   *  seeking value and go cash out. null target = never (legacy behavior). */
  private wantBank(): boolean {
    const t = this.cfg.cashout.target;
    return t != null && this.engine.state.score >= t;
  }

  /** one safe step toward the cashout lane, or 0 to hold/wait. Never crosses
   *  into a contested or barrier-blocked lane — banking yields to safety. */
  private bankStep(): number {
    const e = this.engine,
      s = e.state;
    if (s.lane === e.cashLane) return 0; // already here: hold to bank
    const dir = Math.sign(e.cashLane - s.lane);
    const next = s.lane + dir;
    if (!this.crossOk(s.lane, dir)) return 0;
    if (this.firstObs(next) < 0.9) return 0;
    if (!this.laneClear(next, null)) return 0;
    return dir;
  }

  /** an adjacent lane that is contested (a car inside the threat window) but
   *  not certain death — for a deliberate risky move. */
  private contestedDir(): number {
    const e = this.engine,
      s = e.state;
    for (const dir of this.rand() < 0.5 ? [-1, 1] : [1, -1]) {
      const l = s.lane + dir;
      if (l < 0 || l >= e.laneCount) continue;
      if (e.barrierBlocks(s.lane, l, s.speed * 0.9)) continue;
      for (const car of s.cars) {
        if (car.passed || car.lane !== l) continue;
        const tti = (car.z - e.COLL_Z) / e.closing(car);
        // inside the threat window but not already overlapping: survivable-ish
        if (tti > 0.15 && tti < e.cfg.threatWindow) return dir;
      }
    }
    return 0;
  }

  /* ------------------------------- tick ------------------------------- */

  tick(now: number): TelemetryEvent[] {
    const e = this.engine;
    const out: TelemetryEvent[] = [];
    if (this.mode === "human") return out;
    if (e.state.phase !== "running") {
      this.pending = null;
      this.swipeRun = null;
      return out;
    }

    // Stealth camouflage actions (fake aborts, deliberate risks) only happen
    // when the current lane is not under threat, so they never delay a real
    // reaction or corrupt the credited-RT distribution.
    const laneCalm = this.firstObs(e.state.lane) > 1.5;

    // fake aborted gesture (stealth texture): begin, wander below threshold,
    // release — the detector logs an abort, which humans produce and bots
    // usually do not.
    if (
      laneCalm &&
      !this.swipeRun &&
      !this.pending &&
      !e.input.active &&
      now >= this.nextAbortAt
    ) {
      this.nextAbortAt = this.scheduleNext(this.cfg.abortsPerMin);
      const sx = 200 + (this.rand() - 0.5) * 40,
        sy = 560 + (this.rand() - 0.5) * 30;
      e.input.begin(sx, sy, this.hwInject, "bot", now);
      const wob = e.cfg.swipeThreshold * 0.6;
      e.input.move(sx + (this.rand() - 0.5) * wob, sy + (this.rand() - 0.5) * 6, now + 30);
      out.push(...e.input.move(sx + (this.rand() - 0.5) * wob, sy + 2, now + 60));
      out.push(...e.input.end(now + 90));
      return out;
    }

    if (this.swipeRun) {
      const sr = this.swipeRun;
      const el = now - sr.t0;
      while (sr.i < sr.trace.length && sr.trace[sr.i].t <= el) {
        const p = sr.trace[sr.i++];
        out.push(...e.input.move(sr.startX + p.x * sr.dir, sr.startY + p.y, now));
      }
      if (sr.i >= sr.trace.length) {
        this.swipeRun = null;
        out.push(...e.input.end(now));
      }
      return out;
    }

    if (this.pending) {
      const pend = this.pending;
      if (now < pend.fireAt) return out;
      // RT gating: the credited reaction time the detector will measure is
      // (now - threatAt) for the nearest un-logged threat in the lane we leave.
      // A planner otherwise produces impossibly-short "reactions" when a threat
      // appears just before it happens to move. Hold the fire until that
      // credited RT has reached the sampled human value — so what the detector
      // measures IS a human RT, not a decision-latency artifact.
      if (this.cfg.gateRtToThreat) {
        // reactive fires realize their sampled RT; risky/proactive must still
        // never realize a sub-floor credited RT. Gate on the YOUNGEST creditable
        // threat so no car — nearest or not — can be credited below the floor.
        const gate =
          pend.intent !== "react" || pend.threatAt === 0
            ? this.cfg.rt.floor
            : pend.rt;
        if (this.minCreditAge(e.state.lane, now) < gate) return out;
      }
      this.pending = null;
      // Re-derive the direction against the road as it is NOW. A bank-step
      // yields to safety: if the lane became threatened during the delay, dodge
      // instead and try to bank again once it is calm.
      let dir: number;
      if (pend.intent === "risk") dir = pend.dir;
      else if (pend.intent === "bank")
        dir = this.creditedThreat(e.state.lane) ? this.safeDir() : this.bankStep();
      else dir = this.safeDir();
      if (dir) this.startSwipe(dir, now);
      return out;
    }

    // perfect: scripted, instant reaction, no RT model at all
    if (this.mode === "perfect") {
      const dir =
        this.wantBank() && this.firstObs(e.state.lane) > this.cfg.cashout.calm
          ? this.bankStep()
          : this.safeDir();
      if (dir) this.startSwipe(dir, now);
      return out;
    }

    // deliberate contested-space entry (stealth texture): sometimes step into
    // a lane with live traffic. Some of these will genuinely crash — which is
    // the entire point, because "risks that never cost anything" is itself a
    // detection signal. Only when no reactive dodge is owed, so it can't
    // corrupt a credited RT.
    if (
      laneCalm &&
      this.cfg.riskPerMin > 0 &&
      now >= this.nextRiskAt &&
      !this.creditedThreat(e.state.lane)
    ) {
      this.nextRiskAt = this.scheduleNext(this.cfg.riskPerMin);
      const rdir = this.contestedDir();
      if (rdir) {
        const rt = this.sampleRt();
        this.pending = { fireAt: now + rt, dir: rdir, rt, intent: "risk", threatAt: 0 };
        return out;
      }
    }

    // Reactive dodge: if a threat car is live in the current lane, schedule the
    // dodge relative to its ONSET (threatAt + sampled RT), not to when planning
    // noticed it. This is what makes the credited RT distribution human — a real
    // floor and an ex-Gaussian lapse tail — instead of a decision-latency mess.
    const credit = this.creditedThreat(e.state.lane);
    if (credit) {
      const rt = this.sampleRt();
      const fireAt = this.cfg.gateRtToThreat
        ? Math.max(now, credit.threatAt + rt)
        : now + rt;
      this.pending = { fireAt, dir: 0, rt, intent: "react", threatAt: credit.threatAt };
      return out;
    }

    // Proactive reposition toward open road / higher-value lanes — unless the
    // run has banked enough score to go cash out, in which case steer to the
    // cashout lane instead. No un-logged threat in the current lane here, so no
    // RT is credited for this move.
    const banking =
      this.wantBank() && this.firstObs(e.state.lane) > this.cfg.cashout.calm;
    const dir = banking ? this.bankStep() : this.safeDir();
    if (!dir) return out;
    const rt = this.sampleRt();
    this.pending = {
      fireAt: now + rt,
      dir,
      rt,
      intent: banking ? "bank" : "react",
      threatAt: 0,
    };
    return out;
  }

  /**
   * Execution error. A weaker player does not plan worse so much as fail to
   * carry out what they planned: the swipe never lands, or it goes the wrong
   * way. Applied at fire time so the decision itself stays sound and only the
   * execution degrades. Returns 0 to drop the move entirely.
   */
  private fumble(dir: number): number {
    const p = this.cfg.skill.errorRate;
    if (p <= 0) return dir;
    if (this.rand() >= p) return dir;
    // two thirds of fumbles are a missed input, one third is a wrong-way swipe
    return this.rand() < 0.667 ? 0 : -dir;
  }

  private startSwipe(dirIn: number, now: number) {
    const e = this.engine;
    const dir = this.fumble(dirIn);
    if (!dir) return;
    const trusted = this.hwInject;
    const startX = 200 + (this.rand() - 0.5) * 10;
    const startY = 560 + (this.rand() - 0.5) * 24;
    e.input.begin(startX, startY, trusted, "bot", now);
    let trace: TracePoint[];
    if (this.mode === "perfect") {
      trace = [];
      for (let i = 1; i <= 8; i++) trace.push({ x: (i / 8) * 110, y: 0, t: (i / 8) * 90 });
    } else if (this.mode === "mirror") {
      const M = this.cfg.mirror;
      const base = this.baseTraces[(this.rand() * this.baseTraces.length) | 0];
      const scale = 1 - M.scaleVar / 2 + this.rand() * M.scaleVar;
      const tScale = 1 - M.scaleVar / 2 + this.rand() * M.scaleVar;
      trace = base.map((p) => ({
        x: p.x * scale + (this.rand() - 0.5) * M.perturbPx,
        y: p.y * scale + (this.rand() - 0.5) * M.perturbPx,
        t: p.t * tScale,
      }));
    } else {
      trace = this.generativeTrace();
    }
    this.swipeRun = { trace, i: 0, dir, startX, startY, t0: now, trusted };
  }

  private generativeTrace(): TracePoint[] {
    const r = this.rand;
    const N = this.cfg.noise;
    const n = 14,
      dur = 130 + r() * 110,
      len = 95 + r() * 55,
      arc = (r() - 0.5) * 26;
    const skew = 0.32 + r() * 0.3;
    const organic = N.model === "organic";
    // pink noise via Voss-McCartney: summed octave-rate random sources give
    // 1/f power, so successive samples are correlated instead of independent
    const octaves = 5,
      srcX: number[] = [],
      srcY: number[] = [];
    for (let k = 0; k < octaves; k++) {
      srcX.push(r() - 0.5);
      srcY.push(r() - 0.5);
    }
    const tremHz = N.tremorHzMin + r() * N.tremorHzVar,
      tremPh = r() * 6.283,
      tremAmp = N.tremorAmpMin + r() * N.tremorAmpVar;
    const driftX = (r() - 0.5) * N.driftX,
      driftY = (r() - 0.5) * N.driftY;
    const trace: TracePoint[] = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p =
        u < skew
          ? (u / skew) * (u / skew) * 0.5
          : 0.5 + (1 - Math.pow(1 - (u - skew) / (1 - skew), 2)) * 0.5;
      let nx: number, ny: number;
      if (organic) {
        for (let k = 0; k < octaves; k++) {
          if (i % (1 << k) === 0) {
            srcX[k] = r() - 0.5;
            srcY[k] = r() - 0.5;
          }
        }
        const pinkX = srcX.reduce((a, b) => a + b, 0) / Math.sqrt(octaves);
        const pinkY = srcY.reduce((a, b) => a + b, 0) / Math.sqrt(octaves);
        const tSec = (u * dur) / 1000;
        const trem = Math.sin(tremPh + 6.283 * tremHz * tSec) * tremAmp;
        nx = pinkX * N.pinkAmp + trem * 0.5 + driftX * u;
        ny = pinkY * N.pinkAmp + trem * 0.8 + driftY * u;
      } else {
        nx = (r() - 0.5) * N.iidAmpX;
        ny = (r() - 0.5) * N.iidAmpY;
      }
      trace.push({
        x: p * len + nx,
        y: Math.sin(u * Math.PI) * arc + ny,
        t: u * dur,
      });
    }
    return trace;
  }
}
