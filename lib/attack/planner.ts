import type { Engine } from "@/lib/sim/engine";

const TICK = 0.05;
const H_MAX = 400;
const CT_MAX = 33;
const TRANSIT = 5;
const STATES = 4 * CT_MAX;
const NEG = -1e18;

/** search margins, exported so the tuning sweep can vary them per process */
export const TUNE = {
  /** lookahead depth in ticks; 120 = 6 s. Deeper sees boxes forming earlier */
  horizon: 120,
  pad: 9,
  latBump: 0,
  clearHi: 36,
  clearLo: 18,
  loVal: 0.15,
  occ: 1.25,
  occT: 1.15,
  exitK: 20,
  deadline: 2.6,
  /** salvage-bank when the best route survives fewer ticks than this */
  duressDepth: 120,
  /** hold-timer budget (ticks) above which a non-banking dip is refused, so
   *  an escape into the cashout lane cannot accidentally complete the hold */
  dipMaxCt: 14,
};

/**
 * Receding-horizon route planner. Everything it reads is on the player's
 * screen: car positions and per-car closing speeds, barrier slabs, the road
 * speed ramp. It extrapolates that world ~6 s forward and searches lane/dip
 * routes for the one that survives with margin, then earns the most. Safety
 * pads (PAD ticks on every crossing, inflated hitboxes) are sized so the
 * humanized execution layer (reaction-time tail, gesture wander) can land
 * anywhere inside the window without turning a planned move into a crash.
 */
export class Planner {
  /** true when the last decide() found no route surviving the horizon */
  lastDoomed = false;
  /** deepest tick any route stayed alive to (the horizon = fully clear) */
  lastDepth = TUNE.horizon;

  private occ = new Int8Array(H_MAX);
  private occT = new Int8Array(H_MAX);
  private slab = new Int8Array(H_MAX);
  private guard = new Int8Array(H_MAX);
  private spd = new Float64Array(H_MAX);
  private val: Float64Array[] = [];
  private act: Int8Array[] = [];
  private mvT: Int16Array[] = [];
  private alive: number[][] = [];

  constructor(private engine: Engine) {
    for (let t = 0; t < H_MAX; t++) {
      this.val.push(new Float64Array(STATES).fill(NEG));
      this.act.push(new Int8Array(STATES));
      this.mvT.push(new Int16Array(STATES));
      this.alive.push([]);
    }
  }

  /** best route's first lane move: its direction and the tick it happens */
  decide(wantBank: boolean, lat = 1): { dir: number; at: number } {
    const e = this.engine,
      s = e.state,
      cfg = e.cfg;
    const H = Math.min(H_MAX, TUNE.horizon);
    const holdTicks = Math.round(cfg.cashHold / TICK);
    const cash = e.cashLane;
    const { occ, occT, slab, guard, spd, val, act, mvT, alive } = this;

    const cars = [];
    for (const c of s.cars) if (!c.passed) cars.push({ lane: c.lane, z: c.z, f: c.f });
    const bars = [];
    for (const b of s.barriers) bars.push({ b: b.boundary, z0: b.z0, z1: b.z1 });

    let speed = s.speed;
    let runT = s.runT;
    for (let t = 0; t < H; t++) {
      // traffic couples: followers match leaders and a third lane never
      // closes into a two-lane band (same rules the engine applies)
      for (const a of cars) {
        if (a.z < -e.COLL_Z) continue;
        for (const b of cars) {
          if (a === b || a.lane !== b.lane || b.z < -e.COLL_Z) continue;
          if (b.z > a.z && b.z - a.z < e.COLL_Z * 1.6 && b.f < a.f) b.f = a.f;
        }
      }
      for (const b of cars) {
        if (b.z < -e.COLL_Z) continue;
        let fmax = -1;
        let lanes = 0;
        for (const a of cars) {
          if (a === b || a.lane === b.lane || a.z > b.z || a.z < -e.COLL_Z) continue;
          if (b.z - a.z < 12) {
            lanes |= 1 << a.lane;
            if (a.f > fmax) fmax = a.f;
          }
        }
        if ((lanes & (lanes - 1)) !== 0 && b.f < fmax) b.f = fmax;
      }
      let o = 0,
        oT = 0,
        sl = 0,
        gd = 0;
      for (const c of cars) {
        const cl = speed * (1 - c.f);
        c.z -= cl * TICK;
        const az = Math.abs(c.z);
        if (az < e.COLL_Z * TUNE.occ) o |= 1 << c.lane;
        if (az < e.COLL_Z * TUNE.occT) oT |= 1 << c.lane;
        // a swipe committing just after threat onset would credit a
        // sub-floor RT and the fire gate defers there; block departures in
        // that band only (later flights credit a fast-but-legal reaction)
        const tti = (c.z - e.COLL_Z) / cl;
        if (tti > 1.02 && tti < 1.32) gd |= 1 << c.lane;
      }
      for (const b of bars) {
        b.z0 -= speed * TICK;
        b.z1 -= speed * TICK;
        if (b.z0 < e.HLZ + 1.5 && b.z1 > -e.HLZ - 1.5) sl |= 1 << b.b;
      }
      occ[t] = o;
      occT[t] = oT;
      slab[t] = sl;
      guard[t] = gd;
      spd[t] = speed;
      runT += TICK;
      speed = Math.min(cfg.maxSpeed, cfg.baseSpeed + runT * cfg.speedRamp);
    }

    // a lane pays only while comfortably clear ahead, so routes leave doomed
    // lanes seconds early instead of at the last survivable tick
    const nextOcc = new Int16Array(4 * H);
    for (let l = 0; l < 4; l++) {
      let nxt = H + 40;
      for (let t = H - 1; t >= 0; t--) {
        if (occ[t] & (1 << l)) nxt = t;
        nextOcc[l * H + t] = Math.min(40, nxt - t);
      }
    }
    // a lane is worth standing in only while an exit boundary stays
    // rail-free for the next second, so the box can never close
    const K = TUNE.exitK;
    const nextFlag = new Int16Array(3 * H);
    for (let b = 0; b < 3; b++) {
      let nxt = H + K;
      for (let t = H - 1; t >= 0; t--) {
        if (slab[t] & (1 << b)) nxt = t;
        nextFlag[b * H + t] = nxt;
      }
    }
    const exitOk = (l: number, t: number) => {
      if (l >= 2) return true;
      if (nextFlag[l * H + t] >= t + K) return true;
      return l > 0 && nextFlag[(l - 1) * H + t] >= t + K;
    };
    const clear = (l: number, t: number) => {
      if (!exitOk(l, t)) return 0;
      const n = nextOcc[l * H + t];
      return n >= TUNE.clearHi ? 1 : n >= TUNE.clearLo ? TUNE.loVal : 0;
    };

    for (let t = 0; t < H; t++) {
      for (const st of alive[t]) val[t][st] = NEG;
      alive[t].length = 0;
    }
    const push = (t: number, st: number, v: number, a: number, mt: number) => {
      if (v > val[t][st]) {
        if (val[t][st] === NEG) alive[t].push(st);
        val[t][st] = v;
        act[t][st] = a;
        mvT[t][st] = mt;
      }
    };
    const ct0 = Math.min(CT_MAX - 1, Math.round((s.cashTimer / cfg.cashHold) * holdTicks));
    push(0, s.lane * CT_MAX + ct0, 0, 0, 0);

    let bankedBest = NEG;
    let bankedAct = 0;
    let bankedAt = 0;
    const fb = new Float64Array(3).fill(NEG);
    const fbAt = new Int16Array(3);

    let depth = 0;
    for (let t = 0; t + 1 < H; t++) {
      if (alive[t].length) depth = t;
      for (const st of alive[t]) {
        const v = val[t][st];
        if (v <= NEG) continue;
        const l = (st / CT_MAX) | 0;
        const ct = st % CT_MAX;
        const a = act[t][st];
        const mt = mvT[t][st];
        const idx = a + 1;
        const rank = t * 1e6 + v * 1e-6;
        if (rank > fb[idx]) {
          fb[idx] = rank;
          fbAt[idx] = mt;
        }

        // banking mode swaps the objective: march toward the cashout lane
        const gain = wantBank
          ? (3 - Math.abs(cash - l)) * spd[t]
          : cfg.laneMult[l] * spd[t] * clear(l, t);
        if (!(occ[t + 1] & (1 << l))) {
          const ct2 = l === cash ? ct + 1 : Math.max(0, ct - 2);
          if (ct2 >= holdTicks) {
            if (wantBank && v + 1e9 > bankedBest) {
              bankedBest = v + 1e9;
              bankedAct = a;
              bankedAt = mt;
            }
          } else if (wantBank || ct2 < holdTicks - 2) {
            push(t + 1, l * CT_MAX + Math.min(ct2, CT_MAX - 1), v + gain, a, mt);
          }
        }
        if (t + TRANSIT >= H) continue;
        for (const m of [l - 1, l + 1]) {
          if (m < 0 || m > cash) continue;
          // the empty cashout lane is a usable escape, but only with enough
          // hold budget left to get back out before the 1.6 s banks the run
          if (m === cash && !wantBank && ct > TUNE.dipMaxCt) continue;
          // a rail reaches ~0.45 lanes past its boundary, so entering a lane
          // is unsafe while a slab passes on EITHER of its boundaries
          let bb = 1 << Math.min(l, m);
          if (m - 1 >= 0) bb |= 1 << (m - 1);
          if (m < cash) bb |= 1 << m;
          // only the horizon's first move pays the full decision latency;
          // later transits execute as pre-booked fires (~2 ticks)
          const L = t === 0 ? lat : 2;
          if (guard[Math.min(H - 1, t + L)] & (1 << l)) continue;
          // the source lane only matters until the fire latency has passed
          // (the car vacates it early); the destination from entry onward
          const end = Math.min(H - 1, t + TRANSIT + TUNE.pad);
          const srcEnd = Math.min(H - 1, t + L + 4);
          let ok = true;
          for (let j = t + 1; j <= end; j++) {
            if (slab[j] & bb) { ok = false; break; }
            if (j <= srcEnd && occT[j] & (1 << l)) { ok = false; break; }
            if (j >= t + L && occT[j] & (1 << m)) { ok = false; break; }
          }
          if (!ok) continue;
          const na = a === 0 ? (m > l ? 1 : -1) : a;
          const nmt = a === 0 ? t : mt;
          const mg = wantBank
            ? (3 - Math.abs(cash - m)) * spd[t]
            : cfg.laneMult[m] * spd[t] * clear(m, Math.min(H - 1, t + TRANSIT));
          push(t + TRANSIT, m * CT_MAX + Math.max(0, ct - 2 * TRANSIT), v + mg * TRANSIT, na, nmt);
        }
      }
    }

    this.lastDepth = alive[H - 1].length ? H : depth;
    if (wantBank && bankedBest > NEG) {
      this.lastDoomed = false;
      return { dir: bankedAct, at: bankedAt };
    }
    let best = NEG;
    let bestAct = 0;
    let bestAt = 0;
    for (const st of alive[H - 1]) {
      if (val[H - 1][st] > best) {
        best = val[H - 1][st];
        bestAct = act[H - 1][st];
        bestAt = mvT[H - 1][st];
      }
    }
    this.lastDoomed = best <= NEG;
    if (best > NEG) return { dir: bestAct, at: bestAt };
    for (let a = 0; a < 3; a++)
      if (fb[a] > best) {
        best = fb[a];
        bestAct = a - 1;
        bestAt = fbAt[a];
      }
    return { dir: bestAct, at: bestAt };
  }
}
