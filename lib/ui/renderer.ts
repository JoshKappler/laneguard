/*
 * Canvas renderer for the game, a pure function of Engine state plus a small
 * view-effects bag (particles, tilt). Rendering never touches physics.
 * All geometry constants are frame-tracked from a 60 fps device capture of
 * the shipped game (2026-08-24): the ground plane zooms out with road speed
 * while car sprites keep a constant on-screen width, and the camera follows
 * the player laterally through an underdamped spring.
 */
import type { Engine, Car, Barrier } from "@/lib/sim/engine";
import { hitboxShrink } from "@/lib/sim/collision";

const FONT = "'Luckiest Guy', 'IBM Plex Sans', 'Arial Black', sans-serif";

// proj(z) = D0/(D0 + z*zoom); screenY = YH + (AMP - h*px-per-metre) * proj.
const YH = -148; // vanishing point, above the frame
const AMP = 778; // player row sits at YH + AMP
const D0 = 45;
const LANE_W0 = 174.5; // px per lane at the player row, at base speed
const Z0 = -18; // near clip: past the frame bottom at every zoom

const CAR_W_PX = 87; // constant on-screen car width at the player row
const CAR_HALF_L = 3.42; // world z units
const CAR_H = 0.5; // metres
const CAR_TAPER = 0.78; // nose width as a fraction of body width

const ROAD_L = -0.5, ROAD_R = 4.15;
const RAIL_W = 0.09, RAIL_H = 0.87;
const DASH_PERIOD = 8.4, DASH_LEN = 4.0, DASH_HW = 0.016;
// the neon cashout edge is road-parallel paint: lat 2.60 with a barely-there
// drift, measured across 12 reference frames (its screen lean is perspective)
const GREEN_LAT0 = 2.6, GREEN_SLOPE = -0.0004, GREEN_HW = 0.017;

const BAR_HALF_W = 0.068, BAR_HALF_L = 0.9, BAR_H = 1.0, BAR_PERIOD = 8.8;

const ASPHALT = "#736d6c";
const GROUND = "#bdaf83";
const GREEN = "#0edb0c";

// camera spring fitted to the capture's lane-change trajectories
const CAM_OMEGA = 14, CAM_ZETA = 0.5;

const GOLD = { body: "#cda21a", dark: "#8a6c09", roof: "#ecc746", glass: "#0b0c10" };

// road-space texture for the flat CASHOUT lettering
const CASH = { word: "CASHOUT", slot: 4.8, period: 62, latHalf: 0.48, latC: 3.0, texW: 200, texH: 640, em: 126 };

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; grow: number; age: number; life: number; kind: string;
}

export interface ViewFx {
  particles: Particle[];
  tilt: number;
  emitAcc: number;
  showHitbox: boolean;
}

export function makeViewFx(): ViewFx {
  return { particles: [], tilt: 0, emitAcc: 0, showHitbox: false };
}

interface CarCol { body: string; dark: string; roof: string; glass: string }

const CAR_COLORS: CarCol[] = [
  { body: "#d8d8dc", dark: "#9fa0a8", roof: "#ecedf2", glass: "#221d4e" },
  { body: "#f05a10", dark: "#b83f06", roof: "#ff8b3c", glass: "#221d4e" },
  { body: "#b13ee0", dark: "#7f28a8", roof: "#cf72f2", glass: "#221d4e" },
  { body: "#e8c811", dark: "#a68d08", roof: "#f7dd4a", glass: "#221d4e" },
  { body: "#23252b", dark: "#131418", roof: "#3c3f47", glass: "#15161a" },
  { body: "#4fc22f", dark: "#2f8a18", roof: "#7ada5e", glass: "#221d4e" },
  { body: "#8a5a2e", dark: "#5e3b1a", roof: "#a97946", glass: "#221d4e" },
];
const PLAYER_COLOR: CarCol = { body: "#37c1ff", dark: "#1585c8", roof: "#76dbff", glass: "#0b0c10" };

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

type Pt = { x: number; y: number };

export class Renderer {
  ctx: CanvasRenderingContext2D;
  W = 400;
  H = 860;
  e: Engine;
  fx: ViewFx;
  private puffSeed = 0xf1a2;
  private playerScreenY = YH + AMP;
  private cashTex: HTMLCanvasElement | null = null;
  private cashTexSmall: HTMLCanvasElement | null = null;
  private cashTexReal = false;
  private camX = 1;
  private camV = 0;
  private gold = 0;
  private sparkAcc = 0;
  private zm = 1;
  private lw = LANE_W0;
  private zf = 200; // far clip: past the frame top at the current zoom
  private nowMs = 0;
  private lastPhase = "";

  constructor(ctx: CanvasRenderingContext2D, e: Engine, fx: ViewFx) {
    this.ctx = ctx;
    this.e = e;
    this.fx = fx;
    this.camX = e.state.x;
  }

  private rand() {
    let s = (this.puffSeed = (this.puffSeed + 0x6d2b79f5) | 0);
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private proj(z: number) {
    return D0 / (D0 + Math.max(z * this.zm, -D0 * 0.7));
  }
  private sy(z: number, hM = 0) {
    return YH + (AMP - hM * (this.lw / 3.5)) * this.proj(z);
  }
  private sx(lat: number, p: number) {
    return this.W / 2 + (lat - this.camX) * this.lw * p;
  }
  private pt(lat: number, z: number, hM = 0): Pt {
    return { x: this.sx(lat, this.proj(z)), y: this.sy(z, hM) };
  }

  emitPuff(kind: string) {
    const r = () => this.rand();
    const px = this.W / 2,
      py = this.playerScreenY - 42;
    if (kind === "smoke")
      this.fx.particles.push({ x: px + (r() - 0.5) * 56, y: py - 24 - r() * 40, vx: (r() - 0.5) * 14, vy: -48 - r() * 50, r: 15 + r() * 16, grow: 9, age: 0, life: 1.9 + r() * 1.1, kind });
    else if (kind === "ember")
      this.fx.particles.push({ x: px + (r() - 0.5) * 48, y: py - 6 - r() * 26, vx: (r() - 0.5) * 12, vy: -36 - r() * 36, r: 12 + r() * 12, grow: 6, age: 0, life: 1.3 + r() * 0.8, kind });
    else
      this.fx.particles.push({ x: px + (r() - 0.5) * 34, y: py + 8 - r() * 20, vx: (r() - 0.5) * 10, vy: -22 - r() * 30, r: 10 + r() * 12, grow: 4, age: 0, life: 0.7 + r() * 0.5, kind: "fire" });
  }

  burst() {
    for (let i = 0; i < 14; i++) this.emitPuff("smoke");
    for (let i = 0; i < 8; i++) this.emitPuff("ember");
    for (let i = 0; i < 8; i++) this.emitPuff("fire");
  }

  private goWord(alpha: number) {
    const g = this.ctx;
    g.save();
    g.globalAlpha = alpha;
    g.font = "56px " + FONT;
    g.textAlign = "center";
    g.fillStyle = "rgba(45,45,45,0.35)";
    g.fillText("GO!", this.W / 2 + 3, 452 + 4);
    this.otext("GO!", this.W / 2, 452, 56, "#ffffff", "#e0dedb", 4);
    g.restore();
  }

  private otext(txt: string, x: number, y: number, size: number, fill: string, stroke?: string, strokeW?: number, align?: CanvasTextAlign) {
    const g = this.ctx;
    g.font = size + "px " + FONT;
    g.textAlign = align || "center";
    g.textBaseline = "alphabetic";
    g.lineJoin = "round";
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = strokeW || Math.max(3, size * 0.14);
      g.strokeText(txt, x, y);
    }
    g.fillStyle = fill;
    g.fillText(txt, x, y);
  }

  private poly(pts: Pt[], fill: string) {
    const g = this.ctx;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fill();
  }

  draw(now: number, dt: number) {
    const g = this.ctx,
      s = this.e.state;
    this.nowMs = now;
    // a fresh run starts visually clean: no smoke from the last crash
    if (s.phase !== this.lastPhase && s.phase === "countdown") this.fx.particles.length = 0;
    this.lastPhase = s.phase;
    // ground-plane zoom, spring camera and the gold rainbow-lane skin all
    // follow engine state at frame rate
    this.zm = 1 / (1 + this.e.cfg.zoomK * Math.max(0, s.speed - this.e.cfg.baseSpeed));
    this.lw = LANE_W0 * this.zm;
    this.zf = 200 / this.zm;
    if (s.phase === "running") {
      const cdt = Math.min(dt, 0.05);
      this.camV += (CAM_OMEGA * CAM_OMEGA * (s.x - this.camX) - 2 * CAM_ZETA * CAM_OMEGA * this.camV) * cdt;
      this.camX += this.camV * cdt;
    } else {
      this.camX = s.x;
      this.camV = 0;
    }
    this.gold += ((s.phase === "running" && Math.abs(s.x) < 0.5 ? 1 : 0) - this.gold) * Math.min(1, dt * 5);
    if (s.phase === "running" && this.gold > 0.6) {
      this.sparkAcc += dt;
      while (this.sparkAcc > 0.05) {
        this.sparkAcc -= 0.05;
        const lat = (this.rand() - 0.5) * 0.8;
        const z = -1.2 - this.rand() * 3.2;
        const at = this.pt(lat, z);
        this.fx.particles.push({ x: at.x, y: at.y, vx: 0, vy: s.speed * 7 * this.zm, r: 5 + this.rand() * 8, grow: 0, age: -this.rand() * 0.1, life: 0.6, kind: "spark" });
      }
    }
    g.save();
    g.clearRect(0, 0, this.W, this.H);

    const targetTilt = s.phase === "dead" ? -0.17 : 0;
    this.fx.tilt += (targetTilt - this.fx.tilt) * Math.min(1, dt * 4);
    if (Math.abs(this.fx.tilt) > 0.002) {
      g.translate(this.W / 2, this.H * 0.55);
      g.rotate(this.fx.tilt);
      g.scale(1.12, 1.12);
      g.translate(-this.W / 2, -this.H * 0.55);
    }

    this.drawGround();
    this.drawRoad();
    this.drawRainbow();
    this.drawMarkings();
    this.drawCashoutText();
    this.wall(ROAD_L, ROAD_L - RAIL_W);
    this.wall(ROAD_R, ROAD_R + RAIL_W);
    this.drawRainbowGlow();

    // far-to-near painter's order over cars, barrier blocks, and the player
    const hz = this.e.spawnHorizon();
    const items: { z: number; kind: "car" | "bar" | "me"; o?: Car | Barrier }[] = [];
    for (const c of s.cars) if (c.z > -8 && c.z < hz + 4) items.push({ z: c.z, kind: "car", o: c });
    for (const b of s.barriers) {
      for (let z = b.z0; z < b.z1; z += BAR_PERIOD) {
        const zEnd = Math.min(b.z1, z + BAR_HALF_L * 2);
        const zMid = (z + zEnd) / 2;
        if (zEnd < -6 || z > hz + 4) continue;
        items.push({ z: zMid, kind: "bar", o: { ...b, z0: z, z1: zEnd } });
      }
    }
    items.push({ z: 0, kind: "me" });
    items.sort((a, b2) => b2.z - a.z);
    for (const it of items) {
      if (it.kind === "car") this.drawTraffic(it.o as Car);
      else if (it.kind === "bar") this.drawBarrierBlock(it.o as Barrier);
      else this.drawPlayer();
    }

    if (this.fx.showHitbox) this.drawHitboxes();
    this.drawParticles(dt);
    g.restore();

    if (s.phase === "dead") {
      this.fx.emitAcc = (this.fx.emitAcc || 0) + dt;
      while (this.fx.emitAcc > 0.11) {
        this.fx.emitAcc -= 0.11;
        this.emitPuff("smoke");
        if (this.rand() < 0.5) this.emitPuff("ember");
        if (this.rand() < 0.9) this.emitPuff("fire");
      }
    }

    if (s.phase === "idle") {
      // measured off the settled reference start screen: the scene multiplies
      // to roughly a third of its live brightness under the menu
      g.fillStyle = "rgba(0,0,0,0.78)";
      g.fillRect(0, 0, this.W, this.H);
      // the reference menu furniture is itself dimmed: white text peaks at
      // 181/255 and yellow at 70% of its live value, so the UI rides at 0.7
      g.save();
      g.globalAlpha = 0.7;
      this.drawStartScreen();
      g.restore();
    } else if (s.phase === "countdown") {
      // the reference READY: HUD fades in over ~1 s, then GO! fades in ahead
      // of the road starting to move; there is no separate READY word
      const tRel = this.e.now - s.stateAt;
      g.save();
      g.globalAlpha = Math.min(1, tRel / 1000);
      this.drawHUD();
      g.restore();
      const goA = Math.min(1, Math.max(0, (tRel - 0.3 * this.e.cfg.introMs) / (0.7 * this.e.cfg.introMs)));
      if (goA > 0.02) this.goWord(goA);
    } else if (s.phase === "dead") {
      // the reference crash: numbers roll down and fade for ~1.6 s, then the
      // CRASHED screen lands at ~2 s
      const tRel = this.e.now - s.stateAt;
      if (tRel < 1600) {
        const f = 1 - tRel / 1600;
        g.save();
        g.globalAlpha = 0.25 + 0.75 * f;
        this.drawHUD(f);
        g.restore();
      }
      if (tRel > 1900) {
        g.fillStyle = "rgba(10,10,14,0.35)";
        g.fillRect(0, 0, this.W, this.H);
        this.otext("CRASHED", this.W / 2, 152, 72, "#ffffff", "#1c1c1c", 12);
        this.otext("TAP TO CONTINUE", this.W / 2, this.H - 70, 36, "#ffffff", "#1c1c1c", 8);
      }
    } else if (s.phase === "cashed") {
      g.fillStyle = "rgba(10,10,14,0.35)";
      g.fillRect(0, 0, this.W, this.H);
      this.otext("CASHED OUT", this.W / 2, 180, 58, "#3ede6a", "#123a1c", 10);
      this.otext("$" + s.banked.toFixed(2), this.W / 2, 250, 54, "#ffffff", "#1c1c1c", 10);
      this.otext("TAP TO CONTINUE", this.W / 2, this.H - 70, 36, "#ffffff", "#1c1c1c", 8);
    } else {
      this.drawHUD();
      const goT = this.e.now - s.stateAt;
      // the reference GO! is gone within a quarter second of the road moving
      if (goT < 250) this.goWord(1 - goT / 250);
    }

    // phone notch
    g.fillStyle = "#000";
    g.beginPath();
    g.roundRect(this.W / 2 - 62, 17, 124, 29, 14.5);
    g.fill();
  }

  // Tan desert in sparse low-contrast cells (~0.22 lanes by 0.55 z), keyed to
  // world position so they scroll. Lat bounds come from the visible x range.
  private drawGround() {
    const g = this.ctx;
    g.fillStyle = GROUND;
    g.fillRect(0, 0, this.W, this.H);
    const cellZ = 2.6,
      cellLat = 0.5;
    const cam = this.camX;
    const off = this.e.state.dist % cellZ;
    for (let zi = -10; zi < 180; zi++) {
      const z = zi * cellZ - off;
      const p = this.proj(z);
      if (p < 0.055) break;
      const row = Math.round((z + this.e.state.dist) / cellZ);
      const span = (this.W / 2 + 30) / (this.lw * p);
      const sides: [number, number][] = [
        [cam - span, ROAD_L - RAIL_W - 0.06],
        [ROAD_R + RAIL_W + 0.06, cam + span],
      ];
      for (const [lo, hi] of sides) {
        if (hi <= lo) continue;
        for (let k = Math.floor(lo / cellLat); k <= Math.floor(hi / cellLat); k++) {
          const r = seedRand(row * 7919 + k * 131)();
          if (r > 0.62) continue;
          const tint = r < 0.3 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.075)";
          const latA = Math.max(lo, k * cellLat);
          const latB = Math.min(hi, k * cellLat + cellLat * (0.75 + r * 0.6));
          if (latB > latA) this.quad(latA, latB, z, z + cellZ * 0.92, tint);
        }
      }
    }
  }

  // Roadside wall: brown block face with a darker base and sparse seams, light
  // gray top. Faces are planar, so one quad each projects correctly.
  private wall(latIn: number, latOut: number) {
    const zF = this.zf;
    const iA = this.pt(latIn, Z0, 0), iB = this.pt(latIn, zF, 0);
    const mA = this.pt(latIn, Z0, RAIL_H * 0.32), mB = this.pt(latIn, zF, RAIL_H * 0.32);
    const tA = this.pt(latIn, Z0, RAIL_H), tB = this.pt(latIn, zF, RAIL_H);
    const oA = this.pt(latOut, Z0, RAIL_H), oB = this.pt(latOut, zF, RAIL_H);
    this.poly([iA, iB, mB, mA], "#493f35");
    this.poly([mA, mB, tB, tA], "#635a4c");
    const seamZ = 7.5;
    const off = this.e.state.dist % seamZ;
    for (let k = 0; k < 80; k++) {
      const z = k * seamZ - off + Z0;
      if (z > this.zf || this.proj(z) < 0.07) break;
      const a = this.pt(latIn, z, 0), b = this.pt(latIn, z + 0.12, 0);
      const c = this.pt(latIn, z + 0.12, RAIL_H), d = this.pt(latIn, z, RAIL_H);
      this.poly([a, b, c, d], "#3a352e");
    }
    this.poly([tA, tB, oB, oA], "#838383");
  }

  private quad(latA: number, latB: number, z1: number, z2: number, fill: string) {
    const g = this.ctx;
    const pa = this.proj(z1),
      pb = this.proj(z2);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(this.sx(latA, pa), this.sy(z1));
    g.lineTo(this.sx(latA, pb), this.sy(z2));
    g.lineTo(this.sx(latB, pb), this.sy(z2));
    g.lineTo(this.sx(latB, pa), this.sy(z1));
    g.closePath();
    g.fill();
  }

  private drawRoad() {
    this.quad(ROAD_L, ROAD_R, Z0, this.zf, ASPHALT);
  }

  // Boundary dashes plus the neon cashout edge, which runs slightly diagonal
  // (nearer the player at low z) the way the capture's exit edge does.
  private drawMarkings() {
    const g = this.ctx;
    // world-straight, so it projects screen-straight with no kink
    const latG = (z: number) => GREEN_LAT0 + GREEN_SLOPE * z;
    const seg = (hw: number, fill: string) => {
      for (let z = Z0; z < this.zf; z += 5) {
        const z2 = z + 5.3;
        if (this.proj(z) < 0.08) break;
        this.poly(
          [this.pt(latG(z) - hw, z), this.pt(latG(z) + hw, z), this.pt(latG(z2) + hw, z2), this.pt(latG(z2) - hw, z2)],
          fill
        );
      }
    };
    g.save();
    g.globalAlpha = 0.2;
    seg(GREEN_HW * 2.4, GREEN);
    g.globalAlpha = 1;
    seg(GREEN_HW * 0.8, "#5aff28");
    g.restore();
    // starting line: two pale bands parked at world z ≈ 25, gone after GO
    for (const zl of [26.6, 24.9]) {
      const z = zl - this.e.state.dist;
      if (z > Z0 && z < 60) this.quad(ROAD_L, ROAD_R, z, z + 0.85, "rgba(235,235,235,0.5)");
    }
    const off = this.e.state.dist % DASH_PERIOD;
    for (const b of [0.5, 1.5, 2.5]) {
      for (let zi = -3; zi < 60; zi++) {
        const z = zi * DASH_PERIOD - off;
        const za = Math.max(Z0, z),
          zb = z + DASH_LEN;
        if (zb < Z0) continue;
        if (this.proj(za) < 0.1) break;
        this.quad(b - DASH_HW, b + DASH_HW, za, zb, "#ffffff");
      }
    }
  }

  // Painted in the cashout lane reading far-to-near, glyph tops toward the
  // road, each letter sized at its own depth.
  private zOf(y: number) {
    return (D0 * (AMP / (y - YH) - 1)) / this.zm;
  }

  /*
   * CASHOUT lies flat on the asphalt like the reference. The word is
   * rasterized once into a road-space texture (x across the lane, y along z
   * toward the viewer) and blitted in 2 px horizontal strips, each sampled at
   * its own depth, so the glyphs foreshorten with the road.
   */
  private buildCashTex() {
    const C = CASH;
    const real = typeof document !== "undefined" && !!document.fonts?.check?.("40px 'Luckiest Guy'");
    if (this.cashTex && (this.cashTexReal || !real)) return;
    const cv = document.createElement("canvas");
    cv.width = C.texW;
    cv.height = C.texH;
    const t = cv.getContext("2d")!;
    const wordLen = C.word.length * C.slot;
    const pxPerLat = C.texW / (C.latHalf * 2);
    t.fillStyle = "#37f213";
    t.textAlign = "center";
    t.textBaseline = "middle";
    t.font = (C.em / LANE_W0) * pxPerLat + "px " + FONT;
    for (let i = 0; i < C.word.length; i++) {
      const zc = (i + 0.5) * C.slot;
      t.save();
      t.translate(C.texW / 2, ((wordLen - zc) / wordLen) * C.texH);
      // readable from the car's side of the road
      t.rotate(Math.PI / 2);
      t.fillText(C.word[C.word.length - 1 - i], 0, 0);
      t.restore();
    }
    this.cashTex = cv;
    // quarter-res mip, shrunk in two stages: Chrome's drawImage skips proper
    // filtering at extreme ratios, which shatters the far letter repeats
    const half = document.createElement("canvas");
    half.width = C.texW / 2;
    half.height = C.texH / 2;
    half.getContext("2d")!.drawImage(cv, 0, 0, half.width, half.height);
    const quarter = document.createElement("canvas");
    quarter.width = C.texW / 4;
    quarter.height = C.texH / 4;
    quarter.getContext("2d")!.drawImage(half, 0, 0, quarter.width, quarter.height);
    this.cashTexSmall = quarter;
    this.cashTexReal = real;
  }

  private drawCashoutText() {
    if (typeof document === "undefined") return;
    this.buildCashTex();
    const tex = this.cashTex;
    if (!tex) return;
    const C = CASH;
    const g = this.ctx;
    const wordLen = C.word.length * C.slot;
    const off = this.e.state.dist % C.period;
    const lat0 = C.latC - C.latHalf;
    const lat1 = C.latC + C.latHalf;
    for (let zi = 0; zi < 8; zi++) {
      const z0 = zi * C.period - off + 4;
      if (z0 > this.zf) break;
      const z1 = z0 + wordLen;
      const zNear = Math.max(z0, this.zOf(this.H));
      const zFar = Math.min(z1, this.zf - 2);
      if (zFar <= zNear) continue;
      const yA = Math.max(0, Math.ceil(this.sy(zFar)));
      const yB = Math.min(this.H, Math.floor(this.sy(zNear)));
      // a distant repeat spans few rows; one smoothed blit of the mip beats
      // per-strip sampling there. Sheared so it keeps the road's convergence
      // instead of arriving screen-vertical and snapping when it nears.
      if (yB - yA < 28 && this.cashTexSmall) {
        const pF = this.proj(zFar), pN = this.proj(zNear);
        const xTop = this.sx(lat0, pF), xBot = this.sx(lat0, pN);
        const w = ((this.sx(lat1, pF) - xTop) + (this.sx(lat1, pN) - xBot)) / 2;
        const sy0 = ((z1 - zFar) / wordLen) * this.cashTexSmall.height;
        const sh = ((zFar - zNear) / wordLen) * this.cashTexSmall.height;
        g.save();
        g.translate(xTop, yA);
        g.transform(1, 0, (xBot - xTop) / (yB - yA), 1, 0, 0);
        g.drawImage(this.cashTexSmall, 0, sy0, this.cashTexSmall.width, sh, 0, 0, w, yB - yA);
        g.restore();
        continue;
      }
      for (let y = yA; y < yB; y += 2) {
        const za = this.zOf(y);
        const zb = this.zOf(Math.min(y + 2, yB));
        const sy0 = ((z1 - za) / wordLen) * tex.height;
        const sh = Math.max(((za - zb) / wordLen) * tex.height, 0.5);
        const p = this.proj((za + zb) / 2);
        const x0 = this.sx(lat0, p);
        g.drawImage(tex, 0, sy0, tex.width, sh, x0, y, this.sx(lat1, p) - x0, 2);
      }
    }
  }

  /*
   * Lane 0 is the rainbow lane. The reference sweep runs ~one full hue cycle
   * over the visible depth and the whole gradient cycles hue with TIME
   * (~96°/s), even while the road is frozen at READY; it is not locked to
   * distance travelled. A wide soft glow spills over the rail onto the desert.
   */
  private rainbowGrad(): { grad: CanvasGradient; yBot: number; yTop: number } {
    const g = this.ctx;
    const zTop = this.zf * 0.97,
      zBot = Z0;
    const yBot = this.sy(zBot),
      yTop = this.sy(zTop);
    const grad = g.createLinearGradient(0, yBot, 0, yTop);
    const stops = 44;
    for (let k = 0; k <= stops; k++) {
      const y = yBot + (yTop - yBot) * (k / stops);
      const z = this.zOf(y);
      const hue = ((20 + 2.6 * z + 0.096 * this.nowMs) % 360 + 360) % 360;
      grad.addColorStop(k / stops, "hsl(" + hue + ",90%,55%)");
    }
    return { grad, yBot, yTop };
  }

  private rainbowBand(latA: number, latB: number, blur: number, alpha: number) {
    const g = this.ctx;
    const { grad, yBot, yTop } = this.rainbowGrad();
    const pa = this.proj(this.zOf(yBot)),
      pb = this.proj(this.zOf(yTop));
    g.save();
    g.filter = "blur(" + blur + "px)";
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(this.sx(latA, pa), yBot);
    g.lineTo(this.sx(latA, pb), yTop);
    g.lineTo(this.sx(latB, pb), yTop);
    g.lineTo(this.sx(latB, pa), yBot);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawRainbow() {
    this.rainbowBand(ROAD_L, 0.44, 2, 1);
  }

  // painted after the walls so the glow tints the rail and the desert beyond
  private drawRainbowGlow() {
    this.rainbowBand(-1.9, 0.66, 22, 0.3);
    this.rainbowBand(-0.7, 0.47, 4, 0.2);
  }

  /**
   * projected 3D box on the road plane; returns the top-face corners.
   * taper < 1 narrows the front corners (car noses). col.side overrides the
   * default shaded side face.
   */
  private box(
    latC: number,
    zC: number,
    yaw: number,
    halfWlat: number,
    halfLz: number,
    hM: number,
    col: { body: string; dark: string; side?: string },
    taper = 1,
    hBase = 0
  ): Pt[] {
    // rotate in the VISUAL aspect (screen px per lane vs per z unit), not the
    // engine's collision aspect, or the yawed sprite shears into a pancake
    const lpx = this.lw,
      zpx = (AMP * this.zm) / D0;
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    const corner = (dxLat: number, dzZ: number) => {
      const dx = dxLat * lpx,
        dz = dzZ * zpx;
      return { lat: latC + (dx * cs + dz * sn) / lpx, z: zC + (-dx * sn + dz * cs) / zpx };
    };
    // 0 front-right, 1 front-left, 2 rear-left, 3 rear-right
    const c4 = [
      corner(halfWlat * taper, halfLz),
      corner(-halfWlat * taper, halfLz),
      corner(-halfWlat, -halfLz),
      corner(halfWlat, -halfLz),
    ];
    const G = c4.map((c) => this.pt(c.lat, c.z, hBase));
    const T = c4.map((c) => this.pt(c.lat, c.z, hM));

    const pc = this.pt(latC, zC);
    const sideCol = col.side || shade(col.dark, 0.82);
    if (pc.x < this.W / 2) this.poly([G[3], G[0], T[0], T[3]], sideCol);
    else this.poly([G[1], G[2], T[2], T[1]], sideCol);
    this.poly([G[2], G[3], T[3], T[2]], col.dark);
    this.poly([T[0], T[1], T[2], T[3]], col.body);
    return T;
  }

  /** bilinear point on a top face: u across width (0=left), v along length (0=rear) */
  private topPt(T: Pt[], u: number, v: number): Pt {
    const rear = { x: T[2].x + (T[3].x - T[2].x) * (1 - u), y: T[2].y + (T[3].y - T[2].y) * (1 - u) };
    const front = { x: T[1].x + (T[0].x - T[1].x) * (1 - u), y: T[1].y + (T[0].y - T[1].y) * (1 - u) };
    return { x: rear.x + (front.x - rear.x) * v, y: rear.y + (front.y - rear.y) * v };
  }

  private drawCar(latC: number, zC: number, yaw: number, col: CarCol, plate: boolean) {
    const g = this.ctx;
    const p = this.proj(zC);
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    const { lanePx, zPx } = this.e.cfg;
    const at = (dxLat: number, dzZ: number) => ({
      lat: latC + (dxLat * lanePx * cs + dzZ * zPx * sn) / lanePx,
      z: zC + (-dxLat * lanePx * sn + dzZ * zPx * cs) / zPx,
    });
    // the capture's cars hold a constant on-screen width while the ground
    // plane zooms, so lateral size is fixed in pixels, length in world z
    const chw = CAR_W_PX / 2 / this.lw;
    // wheels first; the body floats just above them, so they only show in the
    // gap under the side faces the way the reference cars read
    if (p > 0.3) {
      const wx = chw * 0.9;
      for (const [dx, dz] of [[-wx, CAR_HALF_L * 0.58], [wx, CAR_HALF_L * 0.58], [-wx, -CAR_HALF_L * 0.62], [wx, -CAR_HALF_L * 0.62]]) {
        const w = at(dx, dz);
        this.box(w.lat, w.z, yaw, chw * 0.15, 0.5, 0.26, { body: "#191b1f", dark: "#101216" });
      }
    }
    const T = this.box(latC, zC, yaw, chw, CAR_HALF_L, CAR_H, col, CAR_TAPER, 0.14);
    if (p < 0.3) return;

    const quadOf = (u0: number, u1: number, v0: number, v1: number, fill: string) =>
      this.poly([this.topPt(T, u0, v0), this.topPt(T, u1, v0), this.topPt(T, u1, v1), this.topPt(T, u0, v1)], fill);
    const polyUV = (uv: [number, number][], fill: string) =>
      this.poly(uv.map(([u, v]) => this.topPt(T, u, v)), fill);

    // rear window is a single pane, slightly narrower at the roof end
    polyUV([[0.09, 0.13], [0.91, 0.13], [0.85, 0.35], [0.15, 0.35]], col.glass);
    polyUV([[0.28, 0.14], [0.42, 0.14], [0.66, 0.34], [0.52, 0.34]], "rgba(255,255,255,0.42)");
    quadOf(0.045, 0.155, 0.13, 0.68, col.glass); // side glass bands
    quadOf(0.845, 0.955, 0.13, 0.68, col.glass);
    quadOf(0.155, 0.845, 0.35, 0.64, col.roof);
    polyUV([[0.3, 0.37], [0.42, 0.37], [0.7, 0.61], [0.58, 0.61]], "rgba(255,255,255,0.3)");
    polyUV([[0.13, 0.64], [0.87, 0.64], [0.8, 0.745], [0.2, 0.745]], col.glass); // windshield
    if (p > 0.45) {
      quadOf(-0.085, 0.01, 0.6, 0.66, "#cfd6dd"); // wing mirrors
      quadOf(0.99, 1.085, 0.6, 0.66, "#cfd6dd");
      for (let i = 0; i < 6; i++) {
        const u = 0.3 + i * 0.075;
        quadOf(u, u + 0.038, 0.775, 0.83, "#101215"); // hood vents
      }
    }
    // rear face: shadow strip at the foot, taillights, plate
    const rearAt = (u: number, hFrac: number) => {
      const top = this.topPt(T, u, 0);
      return { x: top.x, y: top.y + (CAR_H - 0.14) * (this.lw / 3.5) * p * (1 - hFrac) };
    };
    const rQuad = (u0: number, u1: number, h0: number, h1: number, fill: string) =>
      this.poly([rearAt(u0, h0), rearAt(u1, h0), rearAt(u1, h1), rearAt(u0, h1)], fill);
    rQuad(0.02, 0.98, 0.06, -0.09, "#14161a");
    rQuad(0.03, 0.18, 0.5, 0.16, "#7a2015");
    rQuad(0.82, 0.97, 0.5, 0.16, "#7a2015");
    if (plate) {
      const a = rearAt(0.5, 0.34);
      g.fillStyle = "#f4f2e8";
      const pw = 24 * p,
        ph = 9 * p;
      g.fillRect(a.x - pw / 2, a.y - ph / 2, pw, ph);
      g.fillStyle = "#333";
      g.font = 6.5 * p + "px Georgia, serif";
      g.textAlign = "center";
      g.fillText("GBE-86", a.x, a.y + 2.5 * p);
    }
  }

  private drawTraffic(c: Car) {
    const g = this.ctx;
    const col = CAR_COLORS[c.col || 0];
    const fade = Math.min(1, Math.max(0, (this.e.spawnHorizon() - c.z) / 6));
    g.save();
    g.globalAlpha = fade;
    this.drawCar(c.lane, c.z, 0, col, false);
    g.restore();
  }

  // The player runs blue and turns gold while riding the rainbow lane.
  private drawPlayer() {
    const s = this.e.state;
    const yaw = s.phase === "dead" ? 0.5 : s.theta;
    const mix = (a: string, b: string) => {
      const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16), f = this.gold;
      const ch = (sh: number) => Math.round(((na >> sh) & 255) * (1 - f) + ((nb >> sh) & 255) * f);
      return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
    };
    const col = this.gold < 0.02
      ? PLAYER_COLOR
      : { body: mix(PLAYER_COLOR.body, GOLD.body), dark: mix(PLAYER_COLOR.dark, GOLD.dark), roof: mix(PLAYER_COLOR.roof, GOLD.roof), glass: PLAYER_COLOR.glass };
    this.drawCar(s.x, 0, yaw, col, true);
  }

  // Red block measured off the reference: bright top face, a light band at
  // the top of the near face, dark lower near face.
  private drawBarrierBlock(b: Barrier) {
    const lat = b.boundary + 0.5;
    const zMid = (b.z0 + b.z1) / 2;
    const halfL = (b.z1 - b.z0) / 2;
    if (halfL <= 0) return;
    const T = this.box(lat, zMid, 0, BAR_HALF_W, halfL, BAR_H, { body: "#970304", dark: "#a30303", side: "#8a0303" });
    const p = this.proj(zMid);
    if (p < 0.25) return;
    const rearAt = (u: number, hFrac: number) => {
      const top = this.topPt(T, u, 0);
      return { x: top.x, y: top.y + BAR_H * (this.lw / 3.5) * p * (1 - hFrac) };
    };
    this.poly([rearAt(0, 0.7), rearAt(1, 0.7), rearAt(1, 0), rearAt(0, 0)], "#5e0303");
  }

  private drawHitboxes() {
    const g = this.ctx,
      cfg = this.e.cfg,
      s = this.e.state;
    const th = s.theta;
    const shrink = hitboxShrink(th, cfg.hitboxShrinkMax, cfg.hitboxShrinkAngle);
    const hw = cfg.hitHalfWidth * shrink,
      hl = cfg.hitHalfLength * shrink;
    const c = Math.cos(th),
      sn = Math.sin(th);
    g.save();
    g.strokeStyle = "#35c46b";
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath();
    const corners = [[hw, hl], [-hw, hl], [-hw, -hl], [hw, -hl]];
    corners.forEach((q, i) => {
      const lat = s.x + (q[0] * c + q[1] * sn) / cfg.lanePx;
      const z = (-q[0] * sn + q[1] * c) / cfg.zPx;
      const pnt = this.pt(lat, z);
      i ? g.lineTo(pnt.x, pnt.y) : g.moveTo(pnt.x, pnt.y);
    });
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#35c46b";
    g.font = "10px var(--font-mono), monospace";
    g.textAlign = "center";
    const pl = this.pt(s.x, -this.e.HLZ);
    g.fillText((shrink * 100).toFixed(0) + "% · " + (th * 57.3).toFixed(0) + "°", pl.x, pl.y + 14);

    const rect = (lat: number, hwLat: number, z0: number, z1: number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      const q = [this.pt(lat - hwLat, z0), this.pt(lat + hwLat, z0), this.pt(lat + hwLat, z1), this.pt(lat - hwLat, z1)];
      g.beginPath();
      g.moveTo(q[0].x, q[0].y);
      for (let i = 1; i < 4; i++) g.lineTo(q[i].x, q[i].y);
      g.closePath();
      g.stroke();
    };
    for (const car of s.cars) {
      if (car.passed || car.z > cfg.spawnZ || car.z < -8) continue;
      rect(car.lane, cfg.hitHalfWidth / cfg.lanePx, car.z - this.e.HLZ, car.z + this.e.HLZ, "#f0555e");
    }
    for (const bar of s.barriers) {
      if (bar.z1 < -8 || bar.z0 > cfg.spawnZ) continue;
      rect(bar.boundary + 0.5, 4 / cfg.lanePx, bar.z0, bar.z1, "#e8a93b");
    }
    g.restore();
  }

  private drawParticles(dt: number) {
    const g = this.ctx;
    for (const p of this.fx.particles) {
      p.age += dt;
      if (p.age < 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.grow * dt;
      const u = p.age / p.life;
      if (u >= 1) continue;
      if (p.kind === "spark") {
        g.save();
        g.fillStyle = "rgba(255,255,255," + (0.9 * (1 - u)).toFixed(2) + ")";
        g.translate(p.x, p.y);
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const rr = k % 2 === 0 ? p.r : p.r * 0.28;
          const a = (k / 8) * Math.PI * 2;
          k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0);
        }
        g.closePath();
        g.fill();
        g.restore();
        continue;
      }
      if (p.kind === "smoke") {
        const sh = Math.round(40 + u * 26);
        g.fillStyle = "rgba(" + (sh + 12) + "," + sh + "," + sh + "," + (0.5 * (1 - u * 0.75)).toFixed(2) + ")";
      } else if (p.kind === "ember") {
        g.fillStyle = "rgba(118,36,20," + (0.6 * (1 - u)).toFixed(2) + ")";
      } else {
        const grad = g.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r);
        grad.addColorStop(0, "rgba(255,236,120," + 0.95 * (1 - u) + ")");
        grad.addColorStop(0.5, "rgba(248,142,30," + 0.9 * (1 - u) + ")");
        grad.addColorStop(1, "rgba(180,50,10,0)");
        g.fillStyle = grad;
      }
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    this.fx.particles = this.fx.particles.filter((p) => p.age < p.life);
  }

  /*
   * The reference HUD, top to bottom, all screen-centered: the live payout in
   * dollars (large, white, soft shadow), a small "SCORE: N,NNN" line whose
   * zeros carry a slash, and the current lane's multiplier badge (dark with a
   * white outline; riding the rainbow lane adds a hue-cycling glow). rollF<1
   * rolls both numbers down toward zero for the crash animation.
   */
  private drawHUD(rollF = 1) {
    const g = this.ctx,
      s = this.e.state,
      cfg = this.e.cfg;
    const shadow = (txt: string, x: number, y: number, size: number) => {
      g.font = size + "px " + FONT;
      g.textAlign = "center";
      g.fillStyle = "rgba(45,45,45,0.4)";
      g.fillText(txt, x + 3, y + 4);
    };
    const pay = cfg.entryFee * this.e.multiplier() * rollF;
    const payTxt = pay < 0.005 ? "$0" : "$" + pay.toFixed(2);
    shadow(payTxt, this.W / 2, 107, 58);
    this.otext(payTxt, this.W / 2, 107, 58, "#ffffff");

    const scoreTxt = "SCORE: " + Math.floor(s.score * rollF).toLocaleString("en-US");
    shadow(scoreTxt, this.W / 2, 139, 17);
    this.otext(scoreTxt, this.W / 2, 139, 17, "#ffffff", "#2d2d2d", 2.5);
    this.slashZeros(scoreTxt, this.W / 2, 139, 17);

    // during READY the reference shows a 1X placeholder, not the lane's mult
    const mult = s.phase === "countdown" ? 1 : cfg.laneMult[s.lane];
    if (mult > 0) {
      const mTxt = mult + "X";
      if (s.lane === 0) {
        g.save();
        g.shadowColor = `hsl(${(this.nowMs * 0.12) % 360},95%,60%)`;
        g.shadowBlur = 16;
        this.otext(mTxt, this.W / 2, 185, 50, "#1d1d1d", "#f2f2f2", 6);
        g.restore();
      }
      shadow(mTxt, this.W / 2, 185, 50);
      this.otext(mTxt, this.W / 2, 185, 50, "#1d1d1d", "#f2f2f2", 6);
    }
    if (s.cashTimer > 0) {
      const frac = Math.min(1, s.cashTimer / cfg.cashHold);
      g.fillStyle = "rgba(20,60,30,0.55)";
      g.beginPath();
      g.roundRect(this.W / 2 - 74, 200, 148, 16, 8);
      g.fill();
      g.fillStyle = "#2ed94f";
      g.beginPath();
      g.roundRect(this.W / 2 - 74, 200, 148 * frac, 16, 8);
      g.fill();
      this.otext("CASHING OUT", this.W / 2, 213, 13, "#0b2010");
    }
  }

  // the reference score font slashes its zeros; overlay a short diagonal
  private slashZeros(txt: string, cx: number, y: number, size: number) {
    const g = this.ctx;
    g.font = size + "px " + FONT;
    const total = g.measureText(txt).width;
    let x = cx - total / 2;
    g.strokeStyle = "#2d2d2d";
    g.lineWidth = 1.4;
    for (const ch of txt) {
      const w = g.measureText(ch).width;
      if (ch === "0") {
        g.beginPath();
        g.moveTo(x + w * 0.26, y - size * 0.1);
        g.lineTo(x + w * 0.74, y - size * 0.62);
        g.stroke();
      }
      x += w;
    }
  }

  /*
   * Start-screen furniture, matched to the reference: a SOUND/MUSIC/HAPTICS
   * toggle row up top, a gray glyph above each instruction block, mixed-case
   * Luckiest Guy copy (its lowercase renders as small caps), TAP TO START.
   */
  private drawStartScreen() {
    const g = this.ctx;
    const YELLOW = "#f2e42a";

    const label = (txt: string, cx: number) => {
      g.font = "12px " + FONT;
      g.textAlign = "center";
      g.fillStyle = "rgba(20,20,20,0.8)";
      g.fillText(txt, cx + 1, 138);
      g.fillStyle = "#ffffff";
      g.fillText(txt, cx, 137);
    };
    const icon = (cx: number, draw: () => void) => {
      g.save();
      g.fillStyle = YELLOW;
      g.strokeStyle = YELLOW;
      g.translate(cx, 103);
      g.scale(1.4, 1.4);
      g.translate(-cx, -103);
      draw();
      g.restore();
    };
    icon(76, () => {
      // speaker
      g.beginPath();
      g.moveTo(60, 100);
      g.lineTo(66, 100);
      g.lineTo(74, 92);
      g.lineTo(74, 116);
      g.lineTo(66, 108);
      g.lineTo(60, 108);
      g.closePath();
      g.fill();
      g.lineWidth = 2.6;
      for (const r of [6, 11]) {
        g.beginPath();
        g.arc(76, 104, r, -0.85, 0.85);
        g.stroke();
      }
    });
    icon(202, () => {
      // music note
      g.beginPath();
      g.ellipse(196, 113, 5.5, 4, -0.3, 0, Math.PI * 2);
      g.fill();
      g.fillRect(200, 90, 3, 22);
      g.beginPath();
      g.moveTo(200, 90);
      g.quadraticCurveTo(210, 92, 209, 101);
      g.quadraticCurveTo(207, 95, 200, 95);
      g.closePath();
      g.fill();
    });
    icon(326, () => {
      // haptics phone with side arcs
      g.beginPath();
      g.roundRect(319, 92, 14, 24, 4);
      g.fill();
      g.lineWidth = 2.6;
      for (const [cx, a0, a1] of [
        [313, Math.PI * 0.6, Math.PI * 1.4],
        [339, -Math.PI * 0.4, Math.PI * 0.4],
      ] as [number, number, number][]) {
        for (const r of [5, 9]) {
          g.beginPath();
          g.arc(cx, 104, r, a0, a1);
          g.stroke();
        }
      }
    });
    label("SOUND", 73);
    label("MUSIC", 200);
    label("HAPTICS", 326);

    // swipe glyph: two block arrows, left over right
    const arrow = (cy: number, dir: number) => {
      g.save();
      g.fillStyle = "#b9b9b9";
      g.shadowColor = "rgba(0,0,0,0.45)";
      g.shadowOffsetX = 2;
      g.shadowOffsetY = 3;
      g.beginPath();
      const x0 = this.W / 2 - 22 * dir,
        x1 = this.W / 2 + 22 * dir;
      g.moveTo(x0, cy - 4);
      g.lineTo(x1 - 9 * dir, cy - 4);
      g.lineTo(x1 - 9 * dir, cy - 9);
      g.lineTo(x1, cy);
      g.lineTo(x1 - 9 * dir, cy + 9);
      g.lineTo(x1 - 9 * dir, cy + 4);
      g.lineTo(x0, cy + 4);
      g.closePath();
      g.fill();
      g.restore();
    };
    arrow(263, -1);
    arrow(283, 1);

    // fork glyph: straight stub plus a branch curving right, arrowhead on top
    g.save();
    g.strokeStyle = "#b9b9b9";
    g.fillStyle = "#b9b9b9";
    g.shadowColor = "rgba(0,0,0,0.45)";
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 3;
    g.lineWidth = 9;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(188, 458);
    g.lineTo(188, 412);
    g.stroke();
    g.beginPath();
    g.moveTo(202, 458);
    g.quadraticCurveTo(205, 424, 221, 412);
    g.stroke();
    g.beginPath();
    g.moveTo(213, 403);
    g.lineTo(233, 397);
    g.lineTo(228, 418);
    g.closePath();
    g.fill();
    g.restore();

    this.otext("Swipe left/right", this.W / 2, 325, 25, "#ffffff", "#1c1c1c", 6);
    this.otext("to change lanes", this.W / 2, 349, 25, "#ffffff", "#1c1c1c", 6);
    this.otext("Use cashout lane", this.W / 2, 489, 25, "#ffffff", "#1c1c1c", 6);
    this.otext("to keep your score", this.W / 2, 513, 25, "#ffffff", "#1c1c1c", 6);
    this.otext("TAP TO START", this.W / 2, 775, 52, YELLOW, "#1c1c1c", 11);
  }
}

function seedRand(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
