/*
 * Small canvas-chart helpers that pull colors from the design tokens so every
 * chart reads as one system. Single-hue by default (the accent); status colors
 * are reserved for verdict/economy/cadence and always paired with a text label.
 */

export function tok(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export interface Palette {
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  accent: string;
  ok: string;
  warn: string;
  bad: string;
  surface: string;
  s1: string;
  s2: string;
  s3: string;
}

export function palette(): Palette {
  return {
    ink: tok("--ink"),
    ink2: tok("--ink-2"),
    ink3: tok("--ink-3"),
    line: tok("--line"),
    accent: tok("--accent"),
    ok: tok("--ok"),
    warn: tok("--warn"),
    bad: tok("--bad"),
    surface: tok("--surface"),
    s1: tok("--series-1"),
    s2: tok("--series-2"),
    s3: tok("--series-3"),
  };
}

/** set up a HiDPI canvas and return the 2d context sized in CSS pixels */
export function setupCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function monoFont(px: number): string {
  return `${px}px var(--font-plex-mono), ui-monospace, monospace`;
}
