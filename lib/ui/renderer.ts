/*
 * Canvas renderer for the game, a pure function of Engine state plus a small
 * view-effects bag (particles, tilt). Rendering never touches physics.
 *
 * Projection is fitted to references/triumph-drive-gameplay-hires.png: the
 * three dashed boundaries and the green line converge on a vanishing point
 * 0.168 frame-heights above the top edge, one lane of lateral offset climbs
 * 0.221 screen-px sideways per px down, and dash spacing is periodic in 1/proj
 * (period 0.1825*D0). The camera tracks the player's lateral position, which
 * the crash-frame reference confirms (its green line slopes the other way).
 */
import type { Engine, Car, Barrier } from "@/lib/sim/engine";
import { hitboxShrink } from "@/lib/sim/collision";

const FONT = "'Luckiest Guy', 'IBM Plex Sans', 'Arial Black', sans-serif";

// proj(z) = D0/(D0+z); screenY = YH + (AMP - h*PXPM) * proj.
const YH = -144; // vanishing point, above the frame
const AMP = 774; // player row sits at YH + AMP
const D0 = 12; // z=55 spawns just past the frame top
const LANE_W = 171; // px per lane at the player row
const PXPM = LANE_W / 3.5;
const Z_FAR = 62;
const Z0 = -6;

const CAR_HALF_W = 0.214; // lane units; the reference car is 0.43 lanes wide
const CAR_HALF_L = 1.175; // z units
const CAR_H = 0.5; // metres
const CAR_TAPER = 0.78; // nose width as a fraction of body width

const ROAD_L = -0.5, ROAD_R = 3.5;
const RAIL_W = 0.09, RAIL_H = 0.87;
const DASH_PERIOD = 2.19, DASH_LEN = 1.07, DASH_HW = 0.016;
const GREEN_L = 2.568, GREEN_R = 2.602;
const RAINBOW_R = 0.43; // right edge of the rainbow lane surface

const BAR_HALF_W = 0.068, BAR_HALF_L = 0.9, BAR_H = 1.0, BAR_PERIOD = 8.8;

const ASPHALT = "#736d6c";
const GROUND = "#bdaf83";
const GREEN = "#0edb0c";

// road-space texture for the flat CASHOUT lettering; em measured at 0.70 lanes
const CASH = { word: "CASHOUT", slot: 1.26, period: 18.1, latHalf: 0.48, texW: 200, texH: 640, em: 120 };

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
  { body: "#d02818", dark: "#9a1a0e", roof: "#e85a48", glass: "#221d4e" },
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
  private cashTexReal = false;

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
    return this.W / 2 + (lat - this.e.state.x) * LANE_W * p;
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
    void now;
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
    this.drawRoad();
    this.drawRainbow();
    this.drawMarkings();
    this.drawCashoutText();
    this.wall(ROAD_L, ROAD_L - RAIL_W);
    this.wall(ROAD_R, ROAD_R + RAIL_W);

    // far-to-near painter's order over cars, barrier blocks, and the player
    const items: { z: number; kind: "car" | "bar" | "me"; o?: Car | Barrier }[] = [];
    for (const c of s.cars) if (c.z > -8 && c.z < this.e.cfg.spawnZ + 4) items.push({ z: c.z, kind: "car", o: c });
    for (const b of s.barriers) {
      for (let z = b.z0; z < b.z1; z += BAR_PERIOD) {
        const zEnd = Math.min(b.z1, z + BAR_HALF_L * 2);
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
      this.drawHUD();
    }

    // phone notch
    g.fillStyle = "#000";
    g.beginPath();
    g.roundRect(this.W / 2 - 61, 13, 122, 32, 16);
    g.fill();
  }

  // Tan desert in sparse low-contrast cells (~0.22 lanes by 0.55 z), keyed to
  // world position so they scroll. Lat bounds come from the visible x range.
  private drawGround() {
    const g = this.ctx;
    g.fillStyle = GROUND;
    g.fillRect(0, 0, this.W, this.H);
    const cellZ = 0.55,
      cellLat = 0.22;
    const cam = this.e.state.x;
    const off = this.e.state.dist % cellZ;
    for (let zi = -4; zi < 90; zi++) {
      const z = zi * cellZ - off;
      const p = this.proj(z);
      if (p < 0.055) break;
      const row = Math.round((z + this.e.state.dist) / cellZ);
      const span = (this.W / 2 + 30) / (LANE_W * p);
      const sides: [number, number][] = [
        [cam - span, ROAD_L - RAIL_W - 0.06],
        [ROAD_R + RAIL_W + 0.06, cam + span],
      ];
      for (const [lo, hi] of sides) {
        if (hi <= lo) continue;
        for (let k = Math.floor(lo / cellLat); k <= Math.floor(hi / cellLat); k++) {
          const r = seedRand(row * 7919 + k * 131)();
          if (r > 0.2) continue;
          const tint = r < 0.11 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.065)";
          const latA = Math.max(lo, k * cellLat);
          const latB = Math.min(hi, k * cellLat + cellLat * (0.7 + r * 3));
          if (latB > latA) this.quad(latA, latB, z, z + cellZ * 0.92, tint);
        }
      }
    }
  }

  // Roadside wall: brown block face with a darker base and sparse seams, light
  // gray top. Faces are planar, so one quad each projects correctly.
  private wall(latIn: number, latOut: number) {
    const iA = this.pt(latIn, Z0, 0), iB = this.pt(latIn, Z_FAR, 0);
    const mA = this.pt(latIn, Z0, RAIL_H * 0.32), mB = this.pt(latIn, Z_FAR, RAIL_H * 0.32);
    const tA = this.pt(latIn, Z0, RAIL_H), tB = this.pt(latIn, Z_FAR, RAIL_H);
    const oA = this.pt(latOut, Z0, RAIL_H), oB = this.pt(latOut, Z_FAR, RAIL_H);
    this.poly([iA, iB, mB, mA], "#493f35");
    this.poly([mA, mB, tB, tA], "#635a4c");
    const seamZ = 2.6;
    const off = this.e.state.dist % seamZ;
    for (let k = 0; k < 30; k++) {
      const z = k * seamZ - off + Z0;
      if (z > Z_FAR || this.proj(z) < 0.07) break;
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
    this.quad(ROAD_L, ROAD_R, Z0, Z_FAR, ASPHALT);
  }

  // The reference road has no edge lines: just the boundary dashes, with the
  // green line hugging the cashout side of the 2.5 boundary.
  private drawMarkings() {
    this.quad(GREEN_L, GREEN_R, Z0, Z_FAR, GREEN);
    const off = this.e.state.dist % DASH_PERIOD;
    for (const b of [0.5, 1.5, 2.5]) {
      for (let zi = -3; zi < 32; zi++) {
        const z = zi * DASH_PERIOD - off;
        const za = Math.max(Z0, z),
          zb = z + DASH_LEN;
        if (zb < Z0) continue;
        if (this.proj(za) < 0.13) break;
        this.quad(b - DASH_HW, b + DASH_HW, za, zb, "#ffffff");
      }
    }
  }

  // Painted in the cashout lane reading far-to-near, glyph tops toward the
  // road, each letter sized at its own depth.
  private zOf(y: number) {
    return D0 * (AMP / (y - YH) - 1);
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
    t.fillStyle = GREEN;
    t.textAlign = "center";
    t.textBaseline = "middle";
    t.font = (C.em / LANE_W) * pxPerLat + "px " + FONT;
    for (let i = 0; i < C.word.length; i++) {
      const zc = (i + 0.5) * C.slot;
      t.save();
      t.translate(C.texW / 2, ((wordLen - zc) / wordLen) * C.texH);
      t.rotate(Math.PI / 2);
      t.fillText(C.word[C.word.length - 1 - i], 0, 0);
      t.restore();
    }
    this.cashTex = cv;
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
    const lat0 = this.e.cashLane + 0.07 - C.latHalf;
    const lat1 = this.e.cashLane + 0.07 + C.latHalf;
    for (let zi = 0; zi < 5; zi++) {
      const z0 = zi * C.period - off + 3;
      const z1 = z0 + wordLen;
      const zNear = Math.max(z0, this.zOf(this.H));
      const zFar = Math.min(z1, 60);
      if (zFar <= zNear) continue;
      const yA = Math.max(0, Math.ceil(this.sy(zFar)));
      const yB = Math.min(this.H, Math.floor(this.sy(zNear)));
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

  // Lane 0 is the rainbow lane: an opaque hue sweep along z, cycling 15.2
  // degrees per z unit, with a softly blurred edge.
  private drawRainbow() {
    const g = this.ctx;
    const zTop = 46,
      zBot = -4;
    const yBot = this.sy(zBot),
      yTop = this.sy(zTop);
    const grad = g.createLinearGradient(0, yBot, 0, yTop);
    // stops uniform in screen y, so the sweep stays smooth near the viewer
    const stops = 40;
    for (let k = 0; k <= stops; k++) {
      const y = yBot + (yTop - yBot) * (k / stops);
      const z = D0 * (AMP / (y - YH) - 1);
      const hue = ((201.5 + 15.17 * (z + this.e.state.dist)) % 360 + 360) % 360;
      grad.addColorStop(k / stops, "hsl(" + hue + ",100%,45%)");
    }
    const pa = this.proj(zBot),
      pb = this.proj(zTop);
    g.save();
    g.filter = "blur(2px)";
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(this.sx(ROAD_L, pa), yBot);
    g.lineTo(this.sx(ROAD_L, pb), yTop);
    g.lineTo(this.sx(RAINBOW_R, pb), yTop);
    g.lineTo(this.sx(RAINBOW_R, pa), yBot);
    g.closePath();
    g.fill();
    g.restore();
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
    const { lanePx, zPx } = this.e.cfg;
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw);
    const corner = (dxLat: number, dzZ: number) => {
      const dx = dxLat * lanePx,
        dz = dzZ * zPx;
      return { lat: latC + (dx * cs + dz * sn) / lanePx, z: zC + (-dx * sn + dz * cs) / zPx };
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
    // wheels first; the body floats just above them, so they only show in the
    // gap under the side faces the way the reference cars read
    if (p > 0.3) {
      const wx = CAR_HALF_W * 0.9;
      for (const [dx, dz] of [[-wx, CAR_HALF_L * 0.58], [wx, CAR_HALF_L * 0.58], [-wx, -CAR_HALF_L * 0.62], [wx, -CAR_HALF_L * 0.62]]) {
        const w = at(dx, dz);
        this.box(w.lat, w.z, yaw, 0.032, 0.17, 0.26, { body: "#191b1f", dark: "#101216" });
      }
    }
    const T = this.box(latC, zC, yaw, CAR_HALF_W, CAR_HALF_L, CAR_H, col, CAR_TAPER, 0.14);
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
      return { x: top.x, y: top.y + (CAR_H - 0.14) * PXPM * p * (1 - hFrac) };
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
    const fade = Math.min(1, Math.max(0, (this.e.cfg.spawnZ - c.z) / 6));
    g.save();
    g.globalAlpha = fade;
    this.drawCar(c.lane, c.z, 0, col, false);
    g.restore();
  }

  private drawPlayer() {
    const s = this.e.state;
    const yaw = s.phase === "dead" ? 0.5 : s.theta;
    this.drawCar(s.x, 0, yaw, PLAYER_COLOR, true);
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
      return { x: top.x, y: top.y + BAR_H * PXPM * p * (1 - hFrac) };
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

  // The reference HUD is just the score over the multiplier: white score with
  // a soft gray drop shadow and no outline, dark multiplier with a white
  // outline. Sizes and baselines are measured off the capture.
  private drawHUD() {
    const g = this.ctx,
      s = this.e.state,
      cfg = this.e.cfg;
    const shadow = (txt: string, x: number, y: number, size: number) => {
      g.font = size + "px " + FONT;
      g.textAlign = "center";
      g.fillStyle = "rgba(45,45,45,0.4)";
      g.fillText(txt, x + 3, y + 4);
    };
    const score = String(s.score);
    shadow(score, this.W / 2, 118, 70);
    this.otext(score, this.W / 2, 118, 70, "#ffffff");
    const m = Math.round(this.e.multiplier() * 2) / 2;
    const mTxt = (m % 1 === 0 ? m : m.toFixed(1)) + "X";
    shadow(mTxt, this.W / 2, 162, 50);
    this.otext(mTxt, this.W / 2, 162, 50, "#2b2a2a", "#ffffff", 9);
    if (s.cashTimer > 0) {
      const frac = Math.min(1, s.cashTimer / cfg.cashHold);
      g.fillStyle = "rgba(20,60,30,0.55)";
      g.beginPath();
      g.roundRect(this.W / 2 - 74, 184, 148, 16, 8);
      g.fill();
      g.fillStyle = "#2ed94f";
      g.beginPath();
      g.roundRect(this.W / 2 - 74, 184, 148 * frac, 16, 8);
      g.fill();
      this.otext("CASHING OUT", this.W / 2, 197, 13, "#0b2010");
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
