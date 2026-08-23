/*
 * Canvas renderer for the game — a faithful port of the legacy draw(), but a
 * pure function of Engine state + a small view-effects bag (particles, tilt).
 * Rendering never touches physics; physics never touches rendering.
 *
 * The projection matches the reference screenshots: a near-top-down 3rd-person
 * camera with mild convergence, a rainbow left shoulder, a green CASHOUT lane,
 * cartoon cars, red barrier rails, and a crash plume.
 */
import type { Engine, Car, Barrier } from "@/lib/sim/engine";
import { hitboxShrink } from "@/lib/sim/collision";

const FONT = "'Luckiest Guy', 'IBM Plex Sans', 'Arial Black', sans-serif";

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
  botMode: string | null;
}

export function makeViewFx(): ViewFx {
  return { particles: [], tilt: 0, emitAcc: 0, lastGain: null, showHitbox: false, botMode: null };
}

const CAR_COLORS = [
  { body: "#e8e8e8", dark: "#b9b9bd" },
  { body: "#e9c832", dark: "#bb9c1e" },
  { body: "#d1483c", dark: "#a3352c" },
  { body: "#e8e8e8", dark: "#b9b9bd" },
];

export class Renderer {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  e: Engine;
  fx: ViewFx;
  private puffSeed = 0xf1a2;
  private playerScreenY = 640;

  constructor(ctx: CanvasRenderingContext2D, e: Engine, fx: ViewFx) {
    this.ctx = ctx;
    this.e = e;
    this.fx = fx;
    this.W = e.cfg.lanePx * 0 + 400; // canvas is fixed 400×860 like the legacy
    this.H = 860;
  }

  private rand() {
    let s = (this.puffSeed = (this.puffSeed + 0x6d2b79f5) | 0);
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private proj(z: number) {
    return 1 / (1 + z * 0.006);
  }
  private screenY(z: number) {
    return this.playerScreenY - (14.5 * z) / (1 + 0.004 * z);
  }
  private screenX(lat: number, p: number) {
    return this.W / 2 + (lat - 1.5) * this.e.cfg.lanePx * p;
  }

  emitPuff(kind: string) {
    const r = () => this.rand();
    const px = this.screenX(this.e.state.x, 1),
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

    // crash tilt eases in
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
    this.drawCashoutText();
    this.drawRainbow();

    const items: { z: number; t: string; o: Car | Barrier }[] = [];
    for (const c of s.cars) if (c.z > -6 && c.z < this.e.cfg.spawnZ + 2) items.push({ z: c.z, t: "car", o: c });
    for (const b of s.barriers) if (b.z1 > -6 && b.z0 < this.e.cfg.spawnZ + 2) items.push({ z: b.z1, t: "bar", o: b });
    items.sort((a, b2) => b2.z - a.z);
    for (const it of items) it.t === "car" ? this.drawTraffic(it.o as Car) : this.drawBarrier(it.o as Barrier);

    this.drawPlayer();
    if (this.fx.showHitbox) this.drawHitboxes();
    this.drawParticles(dt);
    g.restore();

    // dead/idle particle upkeep
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

    if (this.fx.botMode) {
      g.font = "13px var(--font-mono), monospace";
      g.textAlign = "left";
      g.fillStyle = "#e8a93b";
      g.fillText("BOT: " + this.fx.botMode, 14, this.H - 16);
    }

    // phone notch
    g.fillStyle = "#000";
    g.beginPath();
    (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(this.W / 2 - 72, 16, 144, 34, 17);
    g.fill();
  }

  private drawGround() {
    const g = this.ctx;
    g.fillStyle = "#c9bc9e";
    g.fillRect(0, 0, this.W, this.H);
    const period = 5;
    const off = this.e.state.dist % period;
    for (let zi = -1; zi < 13; zi++) {
      const z = zi * period - off;
      const zRow = Math.floor((z + this.e.state.dist) / period + 0.5);
      const r = seedRand(zRow * 7919);
      const y1 = this.screenY(Math.max(-3, z)),
        y2 = this.screenY(z + period);
      for (let k = 0; k < 3; k++) {
        const left = r() < 0.5;
        const p = this.proj(Math.max(0, z));
        const edge = left ? this.screenX(-1.6, p) : this.screenX(3.5, p);
        const gw = 14 + r() * 42;
        const gx = left ? edge - 12 - r() * 120 - gw : edge + 12 + r() * 120;
        g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
        g.fillRect(gx, Math.min(y1, y2), gw, Math.abs(y1 - y2) * (0.4 + r() * 0.6));
      }
    }
  }

  private quad(latA: number, latB: number, z1: number, z2: number, fill: string) {
    const g = this.ctx;
    const pa = this.proj(Math.max(0, z1)),
      pb = this.proj(Math.max(0, z2));
    const ya = this.screenY(z1),
      yb = this.screenY(z2);
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(this.screenX(latA, pa), ya);
    g.lineTo(this.screenX(latA, pb), yb);
    g.lineTo(this.screenX(latB, pb), yb);
    g.lineTo(this.screenX(latB, pa), ya);
    g.closePath();
    g.fill();
  }

  private drawRoad() {
    const Z0 = -14,
      Z1 = this.e.cfg.spawnZ + 6;
    this.quad(-0.68, -0.5, Z0, Z1, "#4a463f");
    this.quad(3.5, 3.68, Z0, Z1, "#54524e");
    this.quad(-0.5, 3.5, Z0, Z1, "#6d6f73");
    this.quad(-0.5, -0.44, Z0, Z1, "#e8e8e8");
    this.quad(3.44, 3.5, Z0, Z1, "#e8e8e8");
    this.quad(2.47, 2.53, Z0, Z1, "#2ed94f");
    const dashLen = 2.6,
      gap = 4.6,
      period = dashLen + gap;
    const off = this.e.state.dist % period;
    for (const b of [0.5, 1.5]) {
      for (let zi = -3; zi < 10; zi++) {
        const z = zi * period - off;
        const za = Math.max(-14, z),
          zb = z + dashLen;
        if (zb < -14) continue;
        this.quad(b - 0.026, b + 0.026, za, zb, "#f2f2f2");
      }
    }
  }

  private drawCashoutText() {
    const g = this.ctx;
    const period = 26;
    const off = this.e.state.dist % period;
    g.fillStyle = "#27e04c";
    for (let zi = 0; zi < 3; zi++) {
      const z = zi * period - off + 10;
      if (z < 1) continue;
      const p = this.proj(z);
      const x = this.screenX(this.e.cashLane, p),
        y = this.screenY(z);
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2);
      g.font = 46 * p + "px " + FONT;
      g.textAlign = "center";
      g.globalAlpha = 0.92;
      g.fillText("CASHOUT", 0, 14 * p);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  private drawRainbow() {
    const g = this.ctx;
    const zTop = this.e.cfg.spawnZ + 6,
      zBot = -14;
    const yBot = this.screenY(zBot),
      yTop = this.screenY(zTop);
    const grad = g.createLinearGradient(0, yBot, 0, yTop);
    const stops = 26;
    for (let k = 0; k <= stops; k++) {
      const z = zBot + (zTop - zBot) * (k / stops);
      const hue = ((((z + this.e.state.dist) * 5.6) % 360) + 360) % 360;
      grad.addColorStop(k / stops, "hsl(" + hue + ",94%,53%)");
    }
    const pa = this.proj(0),
      pb = this.proj(zTop);
    g.save();
    g.filter = "blur(7px)";
    g.globalAlpha = 0.62;
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(this.screenX(-0.46, pa), yBot);
    g.lineTo(this.screenX(-0.46, pb), yTop);
    g.lineTo(this.screenX(0.46, pb), yTop);
    g.lineTo(this.screenX(0.46, pa), yBot);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawCarBody(x: number, y: number, p: number, col: { body: string; dark: string }, opts: { rot?: number; plate?: boolean }) {
    const g = this.ctx;
    const w = 58 * p,
      h = 108 * p;
    g.save();
    g.translate(x, y);
    if (opts.rot) g.rotate(opts.rot);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.ellipse(2 * p, 4 * p, w * 0.58, h * 0.52, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col.body;
    g.beginPath();
    (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(-w / 2, -h / 2, w, h, 10 * p);
    g.fill();
    g.fillStyle = col.dark;
    g.beginPath();
    (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(-w / 2 + 4 * p, -h / 2 + 3 * p, w - 8 * p, h * 0.16, 6 * p);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.5)";
    for (let i = -1; i <= 1; i++) g.fillRect(i * 9 * p - 4 * p, -h / 2 + 8 * p, 8 * p, 2 * p);
    g.fillStyle = "#20242c";
    g.beginPath();
    g.moveTo(-w / 2 + 5 * p, -h * 0.24);
    g.lineTo(w / 2 - 5 * p, -h * 0.24);
    g.lineTo(w / 2 - 8 * p, -h * 0.02);
    g.lineTo(-w / 2 + 8 * p, -h * 0.02);
    g.closePath();
    g.fill();
    g.fillStyle = col.body;
    g.fillRect(-w / 2 - 5 * p, -h * 0.22, 6 * p, 5 * p);
    g.fillRect(w / 2 - 1 * p, -h * 0.22, 6 * p, 5 * p);
    g.fillStyle = "#20242c";
    g.beginPath();
    g.moveTo(-w / 2 + 8 * p, h * 0.16);
    g.lineTo(w / 2 - 8 * p, h * 0.16);
    g.lineTo(w / 2 - 5 * p, h * 0.34);
    g.lineTo(-w / 2 + 5 * p, h * 0.34);
    g.closePath();
    g.fill();
    g.fillStyle = "#f2921e";
    g.fillRect(-w / 2 + 3 * p, h / 2 - 8 * p, 9 * p, 5 * p);
    g.fillRect(w / 2 - 12 * p, h / 2 - 8 * p, 9 * p, 5 * p);
    if (opts.plate) {
      g.fillStyle = "#f4f2e8";
      const pw = 22 * p,
        ph = 8 * p;
      g.fillRect(-pw / 2, h / 2 - 9.5 * p, pw, ph);
      g.fillStyle = "#333";
      g.font = 6 * p + "px Georgia, serif";
      g.textAlign = "center";
      g.fillText("GBE-86", 0, h / 2 - 3 * p);
    }
    g.restore();
  }

  private drawTraffic(c: Car) {
    const p = this.proj(Math.max(0, c.z));
    this.drawCarBody(this.screenX(c.lane, p), this.screenY(c.z), p, CAR_COLORS[c.col || 0], {});
  }

  private drawPlayer() {
    const rot = this.e.state.phase === "dead" ? 0.5 : this.e.state.theta;
    this.drawCarBody(this.screenX(this.e.state.x, 1), this.playerScreenY - 30, 1, { body: "#2f8be6", dark: "#2570bd" }, { plate: true, rot });
  }

  private drawBarrier(b: Barrier) {
    const g = this.ctx;
    const lat = b.boundary + 0.5;
    const blockLen = 1.6,
      gap = 2.4;
    for (let z = b.z0; z < b.z1; z += blockLen + gap) {
      const za = Math.max(0.1, z),
        zb = Math.min(b.z1, z + blockLen);
      if (zb <= za) continue;
      const pa = this.proj(za),
        pb = this.proj(zb);
      const ya = this.screenY(za),
        yb = this.screenY(zb);
      const hw = 9,
        lift = 26;
      g.fillStyle = "#7e1410";
      g.beginPath();
      g.moveTo(this.screenX(lat, pa) - hw * pa, ya);
      g.lineTo(this.screenX(lat, pb) - hw * pb, yb);
      g.lineTo(this.screenX(lat, pb) + hw * pb, yb);
      g.lineTo(this.screenX(lat, pa) + hw * pa, ya);
      g.closePath();
      g.fill();
      g.fillStyle = "#c0201a";
      g.beginPath();
      g.moveTo(this.screenX(lat, pa) - hw * pa, ya - lift * pa);
      g.lineTo(this.screenX(lat, pb) - hw * pb, yb - lift * pb);
      g.lineTo(this.screenX(lat, pb) + hw * pb, yb - lift * pb);
      g.lineTo(this.screenX(lat, pa) + hw * pa, ya - lift * pa);
      g.closePath();
      g.fill();
      g.fillStyle = "#9c1a15";
      g.beginPath();
      g.moveTo(this.screenX(lat, pa) - hw * pa, ya - lift * pa);
      g.lineTo(this.screenX(lat, pa) + hw * pa, ya - lift * pa);
      g.lineTo(this.screenX(lat, pa) + hw * pa, ya);
      g.lineTo(this.screenX(lat, pa) - hw * pa, ya);
      g.closePath();
      g.fill();
    }
  }

  private drawHitboxes() {
    const g = this.ctx,
      cfg = this.e.cfg,
      s = this.e.state;
    const toS = (cxPx: number, czZ: number) => ({ x: this.W / 2 + (cxPx / cfg.lanePx - 1.5) * cfg.lanePx, y: this.screenY(czZ) });
    const th = s.theta;
    const shrink = hitboxShrink(th, cfg.hitboxShrinkMax, cfg.hitboxShrinkAngle);
    const hw = cfg.hitHalfWidth * shrink,
      hl = cfg.hitHalfLength * shrink;
    const c = Math.cos(th),
      sn = Math.sin(th);
    const pc = toS(s.x * cfg.lanePx, 0);
    g.save();
    g.strokeStyle = "#35c46b";
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath();
    const corners = [[hw, hl], [-hw, hl], [-hw, -hl], [hw, -hl]];
    corners.forEach((q, i) => {
      const x = pc.x + q[0] * c - q[1] * sn;
      const y = pc.y - (q[0] * sn + q[1] * c);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#35c46b";
    g.font = "10px var(--font-mono), monospace";
    g.textAlign = "center";
    g.fillText((shrink * 100).toFixed(0) + "% · " + (th * 57.3).toFixed(0) + "°", pc.x, pc.y + hl + 14);
    g.strokeStyle = "#f0555e";
    g.lineWidth = 1.5;
    for (const car of s.cars) {
      if (car.passed || car.z > cfg.spawnZ || car.z < -8) continue;
      const a = toS(car.lane * cfg.lanePx, car.z + this.e.HLZ),
        b = toS(car.lane * cfg.lanePx, car.z - this.e.HLZ);
      g.strokeRect(a.x - cfg.hitHalfWidth, a.y, cfg.hitHalfWidth * 2, b.y - a.y);
    }
    g.strokeStyle = "#e8a93b";
    for (const bar of s.barriers) {
      if (bar.z1 < -8 || bar.z0 > cfg.spawnZ) continue;
      const a = toS((bar.boundary + 0.5) * cfg.lanePx, bar.z1),
        b = toS((bar.boundary + 0.5) * cfg.lanePx, bar.z0);
      g.strokeRect(a.x - 4, a.y, 8, b.y - a.y);
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
        const shade = Math.round(40 + u * 26);
        g.fillStyle = "rgba(" + (shade + 12) + "," + shade + "," + shade + "," + (0.5 * (1 - u * 0.75)).toFixed(2) + ")";
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
        this.otext("+" + this.fx.lastGain.mult, this.screenX(s.x, 1) + 46, this.fx.lastGain.y - age * 40, 30, this.fx.lastGain.mult === 5 ? "#ff5ce1" : "#ffffff", "#1c1c1c", 6);
        g.globalAlpha = 1;
      } else this.fx.lastGain = null;
    }
    if (s.cashTimer > 0) {
      const frac = Math.min(1, s.cashTimer / cfg.cashHold);
      g.fillStyle = "rgba(20,60,30,0.55)";
      g.beginPath();
      (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(this.W / 2 - 74, 268, 148, 16, 8);
      g.fill();
      g.fillStyle = "#2ed94f";
      g.beginPath();
      (g as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(this.W / 2 - 74, 268, 148 * frac, 16, 8);
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
