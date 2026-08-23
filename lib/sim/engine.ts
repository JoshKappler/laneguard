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

export type Phase = "idle" | "running" | "dead" | "cashed";

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
  lastOpen: number;
  waveGap: number;
  zSinceWave: number;
  stateAt: number;
  cashTimer: number;
  banked: number;
  bankedTotal: number;
}

const CAR_COLOR_COUNT = 4;

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
      lastOpen: 1,
      waveGap: cfg.waveGapStart,
      zSinceWave: 0,
      stateAt: 0,
      cashTimer: 0,
      banked: 0,
      bankedTotal: 0,
    };
    this.input = new InputPipeline(this);
  }

  multiplier(): number {
    return Math.min(this.cfg.multCap, 1 + this.state.score * this.cfg.multRate);
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
    s.lastOpen = 1;
    s.speed = cfg.baseSpeed;
    s.waveGap = cfg.waveGapStart;
    s.runT = 0;
    s.density = cfg.densityStart;
    s.zSinceWave = s.waveGap;
    s.dist = 0;
    s.score = 0;
    s.cashTimer = 0;
    s.phase = "running";
    s.stateAt = this.now;
    return [this.ev("runStart", "info", "run started")];
  }

  private spawnWave() {
    const s = this.state,
      cfg = this.cfg,
      rng = this.rng;
    const trafficLanes = this.laneCount - 1;
    // The open traffic lane walks by at most one step, so a correct dodge is
    // always reachable. The cashout lane gets its own occasional traffic.
    const r = rng();
    let open = s.lastOpen;
    if (r < 0.38) open = Math.max(0, open - 1);
    else if (r < 0.76) open = Math.min(trafficLanes - 1, open + 1);
    const needCross = open !== s.lastOpen ? Math.min(open, s.lastOpen) : -1;
    s.lastOpen = open;

    // each wave drives at its own forward speed (fraction of the player's)
    const fWave = 0.12 + rng() * 0.12;
    const mkCar = (lane: number): Car => ({
      lane,
      z: cfg.spawnZ + (rng() - 0.5) * 3,
      f: Math.max(0.08, Math.min(0.3, fWave + (rng() - 0.5) * 0.04)),
      col: (rng() * CAR_COLOR_COUNT) | 0,
      threatAt: 0,
      rtLogged: false,
      passed: false,
    });
    for (let l = 0; l < trafficLanes; l++) {
      if (l === open) continue;
      if (rng() < s.density) s.cars.push(mkCar(l));
    }
    if (rng() < cfg.cashTrafficFreq) s.cars.push(mkCar(this.cashLane));

    // Barrier trap: red blocks on a lane boundary, never on the boundary the
    // guaranteed path needs to cross for this wave.
    if (rng() < cfg.barrierFreq) {
      const options: number[] = [];
      for (let b = 0; b < trafficLanes; b++) if (b !== needCross) options.push(b);
      const b = options[(rng() * options.length) | 0];
      const len = 5 + rng() * 4;
      s.barriers.push({
        boundary: b,
        z0: cfg.spawnZ - s.waveGap * 0.55,
        z1: cfg.spawnZ - s.waveGap * 0.55 + len,
      });
    }
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
    const forfeited = this.cfg.entryFee * this.multiplier();
    return [
      this.ev("death", "flag", "", {}),
      this.ev("runEnd", "flag", "", {
        endKind: "crash",
        score: s.score,
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
      s.zSinceWave += dz;
      if (s.zSinceWave >= s.waveGap) {
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
      // the car ahead of it instead of rear-ending it
      for (const a of s.cars) {
        for (const b of s.cars) {
          if (a === b || a.lane !== b.lane || a.passed || b.passed) continue;
          if (b.z > a.z && b.z - a.z < this.COLL_Z + 1.5 && b.f < a.f) b.f = a.f;
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
          // score is multiplied by the lane you were in when you passed
          const mult = cfg.laneMult[s.lane];
          s.score += mult;
          out.push(this.ev("pass", "info", "", { mult, score: s.score }));
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
              4,
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
                score: s.score,
                banked: s.banked,
                mult: this.multiplier(),
              })
            );
          }
        } else {
          s.cashTimer = Math.max(0, s.cashTimer - dt * 2);
        }
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
