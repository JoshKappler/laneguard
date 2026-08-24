/*
 * Canvas renderer for the game, a pure function of Engine state plus a small
 * view-effects bag (particles, tilt). Rendering never touches physics.
 *
 * Projection is fitted to references/triumph-drive-gameplay-hires.png. Road
 * lines there converge on a vanishing point 0.170 frame-heights above the top
 * edge, and a line one lane off the camera axis climbs 0.1109 px sideways per
 * px down. Those two numbers set YH, AMP and LANE_W below.
 */
import type { Engine, Car, Barrier } from "@/lib/sim/engine";
import { hitboxShrink } from "@/lib/sim/collision";

const FONT = "'Luckiest Guy', 'IBM Plex Sans', 'Arial Black', sans-serif";

// proj(z) = D0/(D0+z); screenY = YH + (AMP - h*PXPM) * proj.
const YH = -146; // horizon screen y, above the frame
const AMP = 818; // player row sits at YH + AMP
// D0 puts the spawn horizon (z=55) just under the top edge. Sim z units are
// coarser than the reference game's, so render lengths below are set from the
// reference's on-screen proportions rather than from sim metres.
const D0 = 16.2;
const LANE_W = 90.7; // px per lane at the player row
const PXPM = LANE_W / 3.5;
const Z_FAR = 400;

const CAR_HALF_W = 0.34; // lane units; reference car fills ~0.68 of a lane
const CAR_HALF_L = 1.28; // z units, also the barrier block half-length
const CAR_H = 0.55; // metres

const ROAD_L = -0.5, ROAD_R = 3.5; // outer travel-lane boundaries
// The reference road is six lanes of asphalt wide: four marked lanes plus a
// wide paved shoulder each side, then a guardrail.
const SHOULDER = 1.0;
const PAVE_L = ROAD_L - SHOULDER, PAVE_R = ROAD_R + SHOULDER;
const RAIL_W = 0.46; // guardrail width, lane units
const DASH_PERIOD = 3.07, DASH_LEN = 1.38;

const ASPHALT = "#736d6c";
const GROUND = "#bdaf83";

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; grow: number; age: number; life: number; kind: string;
}

export interface ViewFx {
  particles: Particle[];
  tilt: number;
  emitAcc: number;
  lastGain: { mult: number; at: number; y: number } | null;
  showHitbox: boolean;
}

export function makeViewFx(): ViewFx {
  return { particles: [], tilt: 0, emitAcc: 0, lastGain: null, showHitbox: false };
}

const CAR_COLORS = [
  { body: "#e8e8e8", dark: "#b9b9bd" },
  { body: "#e9c832", dark: "#bb9c1e" },
  { body: "#d1483c", dark: "#a3352c" },
  { body: "#e8e8e8", dark: "#b9b9bd" },
];
const PLAYER_COLOR = { body: "#2f8be6", dark: "#2570bd" };

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

  constructor(ctx: CanvasRenderingContext2D, e: Engine, fx: ViewFx) {
    this.ctx = ctx;
    this.e = e;
    this.fx = fx;
  }

  private rand() {
    let s = (this.puffSeed = (this.puffSeed + 0x6d2b79f5) | 0);
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private proj(z: number) {
    return D0 / (D0 + Math.max(z, -D0 * 0.7));
  }
  private sy(z: number, hM = 0) {
    return YH + (AMP - hM * PXPM) * this.proj(z);
  }
  private sx(lat: number, p: number) {
    return this.W / 2 + (lat - 1.5) * LANE_W * p;
  }
  private pt(lat: number, z: number, hM = 0): Pt {
    return { x: this.sx(lat, this.proj(z)), y: this.sy(z, hM) };
  }

  emitPuff(kind: string) {
    const r = () => this.rand();
    const px = this.sx(this.e.state.x, 1),
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

  draw(now: number, dt: number) {
    const g = this.ctx,
      s = this.e.state;
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
    this.drawRainbow();
    this.drawRoad();
    this.drawCashoutText();

    // far-to-near painter's order over cars, barrier blocks, and the player
    const items: { z: number; kind: "car" | "bar" | "me"; o?: Car | Barrier }[] = [];
    for (const c of s.cars) if (c.z > -8 && c.z < this.e.cfg.spawnZ + 4) items.push({ z: c.z, kind: "car", o: c });
    for (const b of s.barriers) {
      const blockPeriod = CAR_HALF_L * 2 + 2.0;
      for (let z = b.z0; z < b.z1; z += blockPeriod) {
        const zEnd = Math.min(b.z1, z + CAR_HALF_L * 2);
        const zMid = (z + zEnd) / 2;
        if (zEnd < -6 || z > this.e.cfg.spawnZ + 4) continue;
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
      g.fillStyle = "rgba(10,10,14,0.52)";
      g.fillRect(0, 0, this.W, this.H);
      this.drawStartScreen();
    } else if (s.phase === "dead") {
      g.fillStyle = "rgba(10,10,14,0.35)";
      g.fillRect(0, 0, this.W, this.H);
      this.otext("CRASHED", this.W / 2, 180, 72, "#ffffff", "#1c1c1c", 12);
      this.otext("TAP TO CONTINUE", this.W / 2, this.H - 70, 36, "#ffffff", "#1c1c1c", 8);
    } else if (s.phase === "cashed") {
      g.fillStyle = "rgba(10,10,14,0.35)";
      g.fillRect(0, 0, this.W, this.H);
      this.otext("CASHED OUT", this.W / 2, 180, 58, "#3ede6a", "#123a1c", 10);
      this.otext("$" + s.banked.toFixed(2), this.W / 2, 250, 54, "#ffffff", "#1c1c1c", 10);
      this.otext("TAP TO CONTINUE", this.W / 2, this.H - 70, 36, "#ffffff", "#1c1c1c", 8);
    } else {
      this.drawHUD(now);
    }

    // phone notch
    g.fillStyle = "#000";
    g.beginPath();
    g.roundRect(this.W / 2 - 72, 16, 144, 34, 17);
    g.fill();
  }

  // Tan desert in low-contrast rectangular cells, matching the reference's
  // blocky ground. Cells are keyed to world position so they scroll with dist.
  private drawGround() {
    const g = this.ctx;
    g.fillStyle = GROUND;
    g.fillRect(0, 0, this.W, this.H);
    const cellZ = 5,
      cellLat = 1.1;
    const off = this.e.state.dist % cellZ;
    for (let zi = -1; zi < 34; zi++) {
      const z = zi * cellZ - off;
      if (this.proj(z) < 0.03) break;
      const row = Math.round((z + this.e.state.dist) / cellZ);
      const r = seedRand(row * 7919);
      for (let k = 0; k < 18; k++) {
        const side = k < 9 ? -1 : 1;
        const idx = k % 9;
        const latA = side < 0 ? PAVE_L - RAIL_W - (idx + 1) * cellLat : PAVE_R + RAIL_W + idx * cellLat;
        const t = r();
        if (t < 0.42) continue;
        const tint = t < 0.71 ? "rgba(0,0,0,0.075)" : "rgba(255,255,255,0.095)";
        this.quad(latA, latA + cellLat, z, z + cellZ * (0.55 + r() * 0.45), tint);
      }
    }
  }

  // A straight wall is planar, so one quad per face projects correctly.
  private wall(latIn: number, latOut: number, z0: number, z1: number, hM: number) {
    const poly = (pts: Pt[], fill: string) => {
      const g = this.ctx;
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fill();
    };
    const iA = this.pt(latIn, z0, 0), iB = this.pt(latIn, z1, 0);
    const tA = this.pt(latIn, z0, hM), tB = this.pt(latIn, z1, hM);
    const oA = this.pt(latOut, z0, hM), oB = this.pt(latOut, z1, hM);
    const gA = this.pt(latOut, z0, 0), gB = this.pt(latOut, z1, 0);
    poly([gA, gB, oB, oA], "#9a9691");
    poly([tA, tB, oB, oA], "#a8a5a0");
    poly([iA, iB, tB, tA], "#7a7065");
    const seamZ = 0.72;
    const off = this.e.state.dist % seamZ;
    for (let k = 0; k < 260; k++) {
      const z = k * seamZ - off + z0;
      if (z > z1) break;
      if (this.proj(z) < 0.06) break;
      const a = this.pt(latIn, z, 0), b = this.pt(latIn, z + 0.11, 0);
      const c = this.pt(latIn, z + 0.11, hM), d = this.pt(latIn, z, hM);
      poly([a, b, c, d], "#4a4239");
    }
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
    const Z0 = -12;
    this.quad(PAVE_L, ROAD_L, Z0, Z_FAR, "#6b6564");
    this.quad(ROAD_R, PAVE_R, Z0, Z_FAR, "#6b6564");
    this.quad(ROAD_L, ROAD_R, Z0, Z_FAR, ASPHALT);
    this.quad(ROAD_L, ROAD_L + 0.055, Z0, Z_FAR, "#f2f2f2");
    this.quad(ROAD_R - 0.055, ROAD_R, Z0, Z_FAR, "#f2f2f2");
    this.quad(2.47, 2.55, Z0, Z_FAR, "#0edb0c");
    const off = this.e.state.dist % DASH_PERIOD;
    for (const b of [0.5, 1.5]) {
      for (let zi = -3; zi < 72; zi++) {
        const z = zi * DASH_PERIOD - off;
        const za = Math.max(Z0, z),
          zb = z + DASH_LEN;
        if (zb < Z0) continue;
        if (this.proj(za) < 0.045) break;
        this.quad(b - 0.022, b + 0.022, za, zb, "#f2f2f2");
      }
    }
    this.wall(PAVE_L, PAVE_L - RAIL_W, Z0, Z_FAR, 1.15);
    this.wall(PAVE_R, PAVE_R + RAIL_W, Z0, Z_FAR, 1.15);
  }

  // Letters read far-to-near, the way the painted lane reads in the reference.
  private drawCashoutText() {
    const g = this.ctx;
    const period = 26;
    const off = this.e.state.dist % period;
    g.fillStyle = "#0edb0c";
    for (let zi = 0; zi < 6; zi++) {
      const z = zi * period - off + 4;
      if (z < -2 || this.proj(z) < 0.2) continue;
      const p = this.proj(z);
      const near = this.pt(this.e.cashLane, z),
        far = this.pt(this.e.cashLane, z + 9);
      const ang = Math.atan2(near.y - far.y, near.x - far.x);
      g.save();
      g.translate(far.x, far.y);
      g.rotate(ang);
      g.font = 72 * p + "px " + FONT;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.globalAlpha = 0.95;
      g.fillText("CASHOUT", 0, 0);
      g.textBaseline = "alphabetic";
      g.restore();
    }
    g.globalAlpha = 1;
  }

  private drawRainbow() {
    const g = this.ctx;
    const zTop = 300,
      zBot = -8;
    const yBot = this.sy(zBot),
      yTop = this.sy(zTop);
    const grad = g.createLinearGradient(0, yBot, 0, yTop);
    const stops = 26;
    for (let k = 0; k <= stops; k++) {
      const z = zBot + (zTop - zBot) * (k / stops);
      const hue = ((((z + this.e.state.dist) * 5.6) % 360) + 360) % 360;
      const offAt = (this.sy(z) - yBot) / (yTop - yBot);
      grad.addColorStop(Math.min(1, Math.max(0, offAt)), "hsl(" + hue + ",94%,53%)");
    }
    const pa = this.proj(zBot),
      pb = this.proj(zTop);
    g.save();
    g.filter = "blur(7px)";
    g.globalAlpha = 0.72;
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(this.sx(-7.5, pa), yBot);
    g.lineTo(this.sx(-7.5, pb), yTop);
    g.lineTo(this.sx(-3.2, pb), yTop);
    g.lineTo(this.sx(-3.2, pa), yBot);
    g.closePath();
    g.fill();
    g.restore();
  }

  /** projected 3D box on the road plane; returns the top-face corners */
  private box(
    latC: number,
    zC: number,
    yaw: number,
    halfWlat: number,
    halfLz: number,
    hM: number,
    col: { body: string; dark: string }
  ): Pt[] {
    const g = this.ctx;
    const { lanePx, zPx } = this.e.cfg;
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    const corner = (dxLat: number, dzZ: number) => {
      const dx = dxLat * lanePx,
        dz = dzZ * zPx;
      return { lat: latC + (dx * cs + dz * sn) / lanePx, z: zC + (-dx * sn + dz * cs) / zPx };
    };
    // 0 front-right, 1 front-left, 2 rear-left, 3 rear-right
    const c4 = [corner(halfWlat, halfLz), corner(-halfWlat, halfLz), corner(-halfWlat, -halfLz), corner(halfWlat, -halfLz)];
    const G = c4.map((c) => this.pt(c.lat, c.z, 0));
    const T = c4.map((c) => this.pt(c.lat, c.z, hM));

    const face = (pts: Pt[], fill: string) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fill();
    };

    const pc = this.pt(latC, zC);
    const seeRight = pc.x < this.W / 2;
    if (seeRight) face([G[3], G[0], T[0], T[3]], shade(col.dark, 0.82));
    else face([G[1], G[2], T[2], T[1]], shade(col.dark, 0.82));
    face([G[2], G[3], T[3], T[2]], col.dark);
    face([T[0], T[1], T[2], T[3]], col.body);
    return T;
  }

  /** bilinear point on a top face: u across width (0=left), v along length (0=rear) */
  private topPt(T: Pt[], u: number, v: number): Pt {
    const rear = { x: T[2].x + (T[3].x - T[2].x) * (1 - u), y: T[2].y + (T[3].y - T[2].y) * (1 - u) };
    const front = { x: T[1].x + (T[0].x - T[1].x) * (1 - u), y: T[1].y + (T[0].y - T[1].y) * (1 - u) };
    return { x: rear.x + (front.x - rear.x) * v, y: rear.y + (front.y - rear.y) * v };
  }

  private carDetail(T: Pt[], col: { body: string; dark: string }, plate: boolean, zC: number) {
    const g = this.ctx;
    const p = this.proj(zC);
    if (p < 0.34) return;
    const quadOf = (u0: number, u1: number, v0: number, v1: number, fill: string) => {
      const a = this.topPt(T, u0, v0),
        b = this.topPt(T, u1, v0),
        c = this.topPt(T, u1, v1),
        d = this.topPt(T, u0, v1);
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fill();
    };
    // u across the width, v along the length with v=0 at the rear bumper
    const glass = "#1d2128";
    quadOf(-0.015, 0.075, 0.03, 0.16, "#15171a"); // tyres
    quadOf(0.925, 1.015, 0.03, 0.16, "#15171a");
    quadOf(-0.015, 0.075, 0.81, 0.94, "#15171a");
    quadOf(0.925, 1.015, 0.81, 0.94, "#15171a");
    quadOf(-0.06, 0.0, 0.68, 0.73, "#cfd6dd"); // wing mirrors
    quadOf(1.0, 1.06, 0.68, 0.73, "#cfd6dd");
    quadOf(0.06, 0.16, 0.28, 0.68, glass); // side windows
    quadOf(0.84, 0.94, 0.28, 0.68, glass);
    quadOf(0.13, 0.87, 0.09, 0.24, glass); // rear window
    quadOf(0.48, 0.52, 0.09, 0.24, col.body); // its centre pillar
    quadOf(0.15, 0.85, 0.66, 0.75, glass); // windshield
    quadOf(0.16, 0.84, 0.27, 0.66, shade(col.body, 1.16)); // roof panel
    quadOf(0.3, 0.45, 0.77, 0.8, glass); // hood vents
    quadOf(0.55, 0.7, 0.77, 0.8, glass);
    // rear-face details: taillights at the bottom corners, plate centered
    const rearAt = (u: number, hFrac: number) => {
      const top = this.topPt(T, u, 0);
      const drop = CAR_H * PXPM * p;
      return { x: top.x, y: top.y + drop * (1 - hFrac) };
    };
    const tl = (u0: number, u1: number) => {
      const a = rearAt(u0, 0.42),
        b = rearAt(u1, 0.42),
        c = rearAt(u1, 0.12),
        d = rearAt(u0, 0.12);
      g.fillStyle = "#f2921e";
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fill();
    };
    tl(0.06, 0.24);
    tl(0.76, 0.94);
    if (plate) {
      const a = rearAt(0.5, 0.3);
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
    const fade = Math.min(1, Math.max(0, (this.e.cfg.spawnZ - c.z) / 6));
    g.save();
    g.globalAlpha = fade;
    const T = this.box(c.lane, c.z, 0, CAR_HALF_W, CAR_HALF_L, CAR_H, col);
    this.carDetail(T, col, false, c.z);
    g.restore();
  }

  private drawPlayer() {
    const s = this.e.state;
    const yaw = s.phase === "dead" ? 0.5 : s.theta;
    const T = this.box(s.x, 0, yaw, CAR_HALF_W, CAR_HALF_L, CAR_H, PLAYER_COLOR);
    this.carDetail(T, PLAYER_COLOR, true, 0);
  }

  private drawBarrierBlock(b: Barrier) {
    const lat = b.boundary + 0.5;
    const zMid = (b.z0 + b.z1) / 2;
    const halfL = (b.z1 - b.z0) / 2;
    if (halfL <= 0) return;
    this.box(lat, zMid, 0, 0.14, halfL, 0.78, { body: "#d43a30", dark: "#a81c14" });
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

  private drawHUD(now: number) {
    const g = this.ctx,
      s = this.e.state,
      cfg = this.e.cfg;
    this.otext("$" + Math.round(s.bankedTotal), this.W / 2, 150, 66, "#ffffff", "#1c1c1c", 12);
    this.otext("SCORE: " + s.score, this.W / 2, 192, 26, "#ffffff", "#1c1c1c", 6);
    const m = Math.round(this.e.multiplier() * 2) / 2;
    this.otext((m % 1 === 0 ? m : m.toFixed(1)) + "X", this.W / 2, 250, 54, "#3c3f45", "#ffffff", 8);
    const lm = cfg.laneMult[s.lane];
    this.otext(lm ? "LANE " + lm + "X" : "CASHOUT LANE", this.W / 2, 300, 22, lm === 5 ? "#ff5ce1" : lm === 2 ? "#7ec9ff" : lm === 1 ? "#d7dde8" : "#3ede6a", "#1c1c1c", 5);
    if (this.fx.lastGain) {
      const age = (now - this.fx.lastGain.at) / 700;
      if (age < 1) {
        g.globalAlpha = 1 - age;
        this.otext("+" + this.fx.lastGain.mult, this.sx(s.x, 1) + 46, this.fx.lastGain.y - age * 40, 30, this.fx.lastGain.mult === 5 ? "#ff5ce1" : "#ffffff", "#1c1c1c", 6);
        g.globalAlpha = 1;
      } else this.fx.lastGain = null;
    }
    if (s.cashTimer > 0) {
      const frac = Math.min(1, s.cashTimer / cfg.cashHold);
      g.fillStyle = "rgba(20,60,30,0.55)";
      g.beginPath();
      g.roundRect(this.W / 2 - 74, 268, 148, 16, 8);
      g.fill();
      g.fillStyle = "#2ed94f";
      g.beginPath();
      g.roundRect(this.W / 2 - 74, 268, 148 * frac, 16, 8);
      g.fill();
      this.otext("CASHING OUT", this.W / 2, 281, 13, "#0b2010");
    }
  }

  private drawStartScreen() {
    this.otext("SWIPE LEFT/RIGHT", this.W / 2, 334, 30, "#ffffff", "#1c1c1c", 7);
    this.otext("TO CHANGE LANES", this.W / 2, 366, 30, "#ffffff", "#1c1c1c", 7);
    this.otext("USE CASHOUT LANE", this.W / 2, 508, 30, "#ffffff", "#1c1c1c", 7);
    this.otext("TO KEEP YOUR SCORE", this.W / 2, 540, 30, "#ffffff", "#1c1c1c", 7);
    this.otext("TAP TO START", this.W / 2, 806, 52, "#f2e42a", "#1c1c1c", 11);
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
