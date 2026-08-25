/*
 * Deterministic game engine — a faithful port of the legacy build's frame()
 * physics with all constants lifted into GameConfig. No DOM, no wall clock:
 * the engine owns a simulated clock (ms) advanced by step(), and every input
 * method takes an explicit timestamp, so the same seed + config + input
 * reproduces the identical run anywhere (browser, tests, batch runner).
 *
 * Rendering, particles and camera effects live in the UI layer; nothing here
 * affects them and they affect nothing here.
 */
import type { GameConfig } from "@/lib/core/config";
import type { Rand } from "@/lib/core/rng";
import { rectHit } from "./collision";

export interface Car {
  lane: number;
  z: number;
  /** forward speed as a fraction of the player's */
  f: number;
  col: number;
  threatAt: number;
  rtLogged: boolean;
  passed: boolean;
}

export interface Barrier {
  boundary: number;
  z0: number;
  z1: number;
}

export type Phase = "idle" | "countdown" | "running" | "dead" | "cashed";

export interface TelemetryEvent {
  t: number;
  kind:
    | "swipe"
    | "abort"
    | "move"
    | "dodge"
    | "risk"
    | "key"
    | "death"
    | "runStart"
    | "runEnd"
    | "pass";
  cls: "info" | "metric" | "good" | "warn" | "flag";
  msg: string;
  data?: Record<string, unknown>;
}

export interface RawSwipe {
  points: { x: number; y: number; t: number }[];
  trusted: boolean;
  source: string;
  dur: number;
}

export interface EngineState {
  phase: Phase;
  lane: number;
  x: number;
  /** heading (rad); the sprite rotation IS the physics state */
  theta: number;
  cars: Car[];
  barriers: Barrier[];
  speed: number;
  runT: number;
  density: number;
  dist: number;
  score: number;
  deaths: number;
  gapJit: number;
  waveGap: number;
  zSinceWave: number;
  stateAt: number;
  cashTimer: number;
  banked: number;
  bankedTotal: number;
}

const CAR_COLOR_COUNT = 7;

export class Engine {
  cfg: GameConfig;
  rng: Rand;
  now = 0;
  state: EngineState;
  input: InputPipeline;
  /** bots restart runs on their own after end screens; humans tap */
  autoRestart = false;
  readonly laneCount: number;
  readonly cashLane: number;
  /** car half-length in z units */
  readonly HLZ: number;
  /** bumper-to-bumper center distance in z units */
  readonly COLL_Z: number;

  constructor(cfg: GameConfig, rng: Rand) {
    this.cfg = cfg;
    this.rng = rng;
    this.laneCount = cfg.laneMult.length;
    this.cashLane = this.laneCount - 1;
    this.HLZ = cfg.hitHalfLength / cfg.zPx;
    this.COLL_Z = 2 * this.HLZ;
    this.state = {
      phase: "idle",
      lane: 1,
      x: 1,
      theta: 0,
      cars: [],
      barriers: [],
      speed: cfg.baseSpeed,
      runT: 0,
      density: cfg.densityStart,
      dist: 0,
      score: 0,
      deaths: 0,
      gapJit: 1,
      waveGap: cfg.waveGapStart,
      zSinceWave: 0,
      stateAt: 0,
      cashTimer: 0,
      banked: 0,
      bankedTotal: 0,
    };
    this.input = new InputPipeline(this);
    // the reference start screen already shows traffic far up the road
    this.populateRoad();
  }

  /** spawn z, scaled with the ground-plane zoom so cars enter past the frame top */
  spawnHorizon(): number {
    const over = Math.max(0, this.state.speed - this.cfg.baseSpeed);
    return this.cfg.spawnZ * (1 + this.cfg.zoomK * over);
  }

  /** frozen pre-run traffic at mature-road density (road-frame wave spacing
      is waveGap scaled by closing/baseSpeed, roughly half the trigger gap) */
  private populateRoad() {
    const s = this.state;
    for (let z = this.spawnHorizon() - 6; z > 85; z -= s.waveGap * (0.25 + this.rng() * 0.55))
      this.spawnWave(z);
  }

  /** payout as a multiple of the entry fee, from the video-fitted curve */
  multiplier(): number {
    const t = this.cfg.payout,
      s = this.state.score;
    if (s <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) {
      if (s <= t[i][0]) {
        const [s0, m0] = t[i - 1], [s1, m1] = t[i];
        return m0 + ((s - s0) / (s1 - s0)) * (m1 - m0);
      }
    }
    return t[t.length - 1][1];
  }

  closing(car: Car): number {
    return this.state.speed * (1 - car.f);
  }

  private ev(
    kind: TelemetryEvent["kind"],
    cls: TelemetryEvent["cls"],
    msg: string,
    data?: Record<string, unknown>
  ): TelemetryEvent {
    return { t: this.now, kind, cls, msg, data };
  }

  resetRun(): TelemetryEvent[] {
    const s = this.state,
      cfg = this.cfg;
    s.cars = [];
    s.barriers = [];
    s.lane = 1;
    s.x = 1;
    s.theta = 0;
    s.gapJit = 1;
    s.speed = cfg.baseSpeed;
    s.waveGap = cfg.waveGapStart;
    s.runT = 0;
    s.density = cfg.densityStart;
    s.zSinceWave = s.waveGap;
    s.dist = 0;
    s.score = 0;
    s.cashTimer = 0;
    s.phase = this.cfg.introMs > 0 ? "countdown" : "running";
    s.stateAt = this.now;
    this.populateRoad();
    return [this.ev("runStart", "info", "run started")];
  }

  private spawnWave(zAt = this.spawnHorizon()) {
    const s = this.state,
      cfg = this.cfg,
      rng = this.rng;
    // Reference wave mix: ~90% one car, ~10% a two-lane pair, never a wall,
    // with traffic weighted toward the high-multiplier lanes. Closing speed
    // is near-constant across the run (video-fitted 12-23 z/s), so the f
    // fraction rises toward 1 as the road ramps.
    const cWave = 14 + rng() * 10;
    const mkCar = (lane: number): Car => ({
      lane,
      z: zAt + (rng() - 0.5) * 3,
      f: Math.min(0.95, Math.max(0.4, 1 - (cWave + (rng() - 0.5) * 4) / Math.max(s.speed, cfg.baseSpeed))),
      col: (rng() * CAR_COLOR_COUNT) | 0,
      threatAt: 0,
      rtLogged: false,
      passed: false,
    });
    // near-uniform lane weights with a mild tilt toward the 5X lane: the
    // reference player's ~0.9 moves/s and long unbroken 5X stints bound the
    // rainbow lane's traffic share at roughly 30%, not the mult-heavy skew.
    // The cashout lane never carries traffic, like the reference.
    const w = (l: number) => 1 + cfg.laneMult[l] * 0.08;
    const pick = (excl: number) => {
      let tot = 0;
      for (let l = 0; l < this.cashLane; l++) if (l !== excl) tot += w(l);
      let r = rng() * tot;
      for (let l = 0; l < this.cashLane; l++) {
        if (l === excl) continue;
        r -= w(l);
        if (r <= 0) return l;
      }
      return this.cashLane - 1;
    };
    if (rng() < s.density) {
      // The reference never queues a lane: at most two cars share a lane
      // anywhere in the approach field, so the field tops out around six.
      const load = new Map<number, number>();
      for (const c of s.cars)
        if (c.z > 20) load.set(c.lane, (load.get(c.lane) ?? 0) + 1);
      // bunched waves land close in z; track the distinct lanes blocked inside
      // a car-length window so bunching never assembles an undodgeable wall
      const nearWall = new Set<number>();
      for (const c of s.cars) if (c.z > zAt - 10) nearWall.add(c.lane);
      const canTake = (l: number) =>
        (load.get(l) ?? 0) < 2 && (nearWall.size < 2 || nearWall.has(l));
      let first = pick(-1);
      const spawnCar = canTake(first) || canTake((first = pick(first)));
      // headway floor: a spawn never lands closer than a car length of clear
      // air behind the newest car already in its lane
      const clearOf = (car: Car) => {
        for (const c of s.cars)
          if (c.lane === car.lane && c.z > zAt - 45 && car.z < c.z + 2 * this.COLL_Z)
            car.z = c.z + 2 * this.COLL_Z;
      };
      if (spawnCar) {
        const lead = mkCar(first);
        clearOf(lead);
        s.cars.push(lead);
        if (rng() < cfg.pairFreq && nearWall.size < 2) {
          const mate = mkCar(pick(first));
          if (canTake(mate.lane)) {
            clearOf(mate);
            s.cars.push(mate);
          }
        }
      }

      // Barrier trap on a lane boundary, never on the spawned car's escape
      // boundaries and never on the cashout boundary, so a dodge always exists.
      if (rng() < cfg.barrierFreq) {
        const options: number[] = [];
        for (let b = 0; b < this.laneCount - 2; b++)
          if (b !== first - 1 && b !== first) options.push(b);
        if (options.length) {
          const pickB = (rng() * options.length) | 0;
          // the reference drops short single slabs, not walls
          const len = 1.8 + rng() * 1.4;
          const z0 = zAt - s.waveGap * 0.55;
          s.barriers.push({ boundary: options[pickB], z0, z1: z0 + len });
          // the reference run shows flanking pairs on adjacent boundaries
          if (options.length > 1 && rng() < cfg.barrierPairFreq) {
            const other = options[(pickB + 1) % options.length];
            s.barriers.push({ boundary: other, z0, z1: z0 + 1.8 + rng() * 1.4 });
          }
        }
      }
    }
    // measured inter-wave spacing is ragged: p10 ≈ 0.45x, p90 ≈ 2.2x median
    s.gapJit = 0.45 + rng() * 1.75;
  }

  barrierBlocks(fromLane: number, toLane: number, zLead: number): boolean {
    const b = Math.min(fromLane, toLane);
    for (const bar of this.state.barriers) {
      if (bar.boundary !== b) continue;
      if (bar.z1 > -this.HLZ && bar.z0 < zLead) return true;
    }
    return false;
  }

  /** the keyboard path: an immediate lane change with no gesture attached */
  keyLaneChange(dir: number, trusted: boolean, atMs: number): TelemetryEvent[] {
    if (this.state.phase !== "running") return [];
    const out = this.laneChange(dir, atMs);
    out.push(this.ev("key", "info", "keyboard lane change", { trusted }));
    return out;
  }

  laneChange(dir: number, atMs: number): TelemetryEvent[] {
    const s = this.state;
    if (s.phase !== "running") return [];
    const out: TelemetryEvent[] = [];
    const from = s.lane;
    const to = Math.max(0, Math.min(this.laneCount - 1, from + dir));
    if (to === from) return [];
    s.lane = to;
    // Reaction time: nearest un-logged threat car that was in the lane we left.
    let best: Car | null = null;
    for (const car of s.cars) {
      if (car.passed || car.rtLogged || !car.threatAt) continue;
      if (car.lane !== from) continue;
      if (!best || car.z < best.z) best = car;
    }
    if (best) {
      best.rtLogged = true;
      const rt = atMs - best.threatAt;
      const margin = Math.max(0.01, (best.z - this.COLL_Z) / this.closing(best));
      out.push(
        this.ev("dodge", "metric", "", { rt, margin, speed: s.speed })
      );
    }
    // contested move: entering a lane with a car close enough to matter
    for (const car of s.cars) {
      if (car.passed || car.lane !== to) continue;
      if (
        car.z > -this.COLL_Z &&
        (car.z - this.COLL_Z) / this.closing(car) < 1.0
      ) {
        out.push(this.ev("risk", "warn", "contested-space entry"));
        break;
      }
    }
    out.push(this.ev("move", "info", "", { from, to }));
    return out;
  }

  private crash(): TelemetryEvent[] {
    const s = this.state;
    s.phase = "dead";
    s.stateAt = this.now;
    s.deaths++;
    const forfeited = this.cfg.entryFee;
    return [
      this.ev("death", "flag", "", {}),
      this.ev("runEnd", "flag", "", {
        endKind: "crash",
        score: Math.floor(s.score),
        banked: 0,
        forfeited,
        mult: this.multiplier(),
      }),
    ];
  }

  step(dtMs: number): TelemetryEvent[] {
    const dt = dtMs / 1000;
    this.now += dtMs;
    const s = this.state,
      cfg = this.cfg;
    const out: TelemetryEvent[] = [];

    if (s.phase === "running") {
      // difficulty ramps continuously with distance: the road speeds up and
      // the waves pack tighter, so the reaction window shrinks over a run
      s.runT += dt;
      s.speed = Math.min(cfg.maxSpeed, cfg.baseSpeed + s.runT * cfg.speedRamp);
      s.waveGap = Math.max(cfg.waveGapMin, cfg.waveGapStart - s.runT * cfg.waveGapRamp);
      s.density = Math.min(cfg.densityMax, cfg.densityStart + s.runT * cfg.densityRamp);

      const dz = s.speed * dt;
      s.dist += dz;
      // wave clock runs in base-speed distance: the reference spawner holds a
      // steady wave RATE while the road ramps (visible density stays flat)
      s.zSinceWave += cfg.baseSpeed * dt;
      // score accrues with distance, scaled by the committed lane's multiplier
      s.score += dz * cfg.laneMult[s.lane] * cfg.scorePerZ;
      if (s.zSinceWave >= s.waveGap * s.gapJit) {
        s.zSinceWave = 0;
        this.spawnWave();
      }

      // steering: the swipe sets a target lane; the car banks and its lateral
      // velocity comes from the heading — it travels the angled path
      const dxLane = s.lane - s.x;
      let steerTarget = 0;
      if (Math.abs(dxLane) > 0.012) {
        steerTarget =
          Math.sign(dxLane) * cfg.maxSteer * Math.min(1, Math.abs(dxLane) / 0.22);
      }
      s.theta += (steerTarget - s.theta) * Math.min(1, dt * cfg.steerRate);
      const latSpeed = (Math.tan(s.theta) * (s.speed * cfg.zPx)) / cfg.lanePx;
      s.x += latSpeed * dt;
      if (Math.abs(s.lane - s.x) < 0.04 && Math.abs(s.theta) < 0.1) {
        s.x = s.lane;
        s.theta = 0;
      }
      const pcx = s.x * cfg.lanePx;

      // traffic drives forward at its own speed; a faster follower matches
      // the car ahead well before contact, holding a visible following gap
      for (const a of s.cars) {
        for (const b of s.cars) {
          if (a === b || a.lane !== b.lane || a.passed || b.passed) continue;
          if (b.z > a.z && b.z - a.z < this.COLL_Z * 1.6 && b.f < a.f) b.f = a.f;
        }
      }
      let crashed = false;
      for (const car of s.cars) {
        const cl = this.closing(car);
        car.z -= cl * dt;
        if (!car.passed && car.lane === s.lane && !car.threatAt) {
          const tti = (car.z - this.COLL_Z) / cl;
          if (tti > 0 && tti < cfg.threatWindow) car.threatAt = this.now;
        }
        if (!car.passed && car.z < -this.COLL_Z) {
          car.passed = true;
          const mult = cfg.laneMult[s.lane];
          out.push(this.ev("pass", "info", "", { mult, score: Math.floor(s.score) }));
        }
        if (
          !crashed &&
          !car.passed &&
          Math.abs(car.z) < this.COLL_Z + 2 &&
          rectHit(
            pcx,
            0,
            s.theta,
            car.lane * cfg.lanePx,
            car.z * cfg.zPx,
            cfg.hitHalfWidth,
            cfg.hitHalfLength,
            cfg.hitHalfWidth,
            cfg.hitHalfLength,
            cfg.hitboxShrinkMax,
            cfg.hitboxShrinkAngle
          )
        ) {
          crashed = true;
          out.push(...this.crash());
        }
      }
      if (s.phase === "running") {
        for (const bar of s.barriers) {
          bar.z0 -= dz;
          bar.z1 -= dz; // rails are parked on the road: full closing speed
          if (
            bar.z1 > -this.HLZ - 1 &&
            bar.z0 < this.HLZ + 1 &&
            rectHit(
              pcx,
              0,
              s.theta,
              (bar.boundary + 0.5) * cfg.lanePx,
              ((bar.z0 + bar.z1) / 2) * cfg.zPx,
              3,
              ((bar.z1 - bar.z0) / 2) * cfg.zPx,
              cfg.hitHalfWidth,
              cfg.hitHalfLength,
              cfg.hitboxShrinkMax,
              cfg.hitboxShrinkAngle
            )
          ) {
            out.push(...this.crash());
            break;
          }
        }
      }
      s.cars = s.cars.filter((c) => c.z > -10);
      s.barriers = s.barriers.filter((b) => b.z1 > -10);

      // cashout: hold the lane
      if (s.phase === "running") {
        if (s.lane === this.cashLane && Math.abs(s.x - this.cashLane) < 0.1) {
          s.cashTimer += dt;
          if (s.cashTimer >= cfg.cashHold) {
            s.banked = cfg.entryFee * this.multiplier();
            s.bankedTotal += s.banked;
            s.phase = "cashed";
            s.stateAt = this.now;
            out.push(
              this.ev("runEnd", "good", "", {
                endKind: "cashout",
                score: Math.floor(s.score),
                banked: s.banked,
                mult: this.multiplier(),
              })
            );
          }
        } else {
          s.cashTimer = Math.max(0, s.cashTimer - dt * 2);
        }
      }
    } else if (s.phase === "countdown") {
      if (this.now - s.stateAt >= this.cfg.introMs) {
        s.phase = "running";
        s.stateAt = this.now;
      }
    } else if (
      (s.phase === "dead" || s.phase === "cashed") &&
      this.autoRestart &&
      this.now - s.stateAt > 900
    ) {
      out.push(...this.resetRun());
    }

    return out;
  }
}

/* ========================= INPUT PIPELINE =========================
 * Humans and bots feed the exact same pipeline. The detector only ever sees
 * what comes out of it. Callers supply timestamps: the UI passes wall-clock
 * ms, bots pass sim-clock ms — features only ever use them relatively. */
interface ActiveGesture {
  points: { x: number; y: number; t: number }[];
  trusted: boolean;
  source: string;
  applied: boolean;
}

export class InputPipeline {
  private engine: Engine;
  active: ActiveGesture | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  begin(x: number, y: number, trusted: boolean, source: string, atMs: number) {
    this.active = { points: [{ x, y, t: atMs }], trusted, source, applied: false };
  }

  move(x: number, y: number, atMs: number): TelemetryEvent[] {
    const s = this.active;
    if (!s) return [];
    s.points.push({ x, y, t: atMs });
    if (!s.applied) {
      const dx = x - s.points[0].x;
      if (Math.abs(dx) >= this.engine.cfg.swipeThreshold) {
        s.applied = true;
        return this.engine.laneChange(dx > 0 ? 1 : -1, atMs);
      }
    }
    return [];
  }

  end(atMs: number): TelemetryEvent[] {
    const s = this.active;
    this.active = null;
    if (!s) return [];
    if (!s.applied) {
      const d = Math.hypot(
        s.points[s.points.length - 1].x - s.points[0].x,
        s.points[s.points.length - 1].y - s.points[0].y
      );
      if (d > 3 || s.points.length <= 3)
        return [
          {
            t: atMs,
            kind: "abort",
            cls: "info",
            msg: "gesture aborted — released with no lane change committed",
          },
        ];
      return [];
    }
    const swipe: RawSwipe = {
      points: s.points,
      trusted: s.trusted,
      source: s.source,
      dur: s.points[s.points.length - 1].t - s.points[0].t,
    };
    return [
      { t: atMs, kind: "swipe", cls: "metric", msg: "", data: { swipe } },
    ];
  }
}
