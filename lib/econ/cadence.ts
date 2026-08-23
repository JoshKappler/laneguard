/*
 * 7-day session cadence simulation — direct port of the legacy model
 * (golden-tested for exact parity). Three account profiles:
 *   human — session bursts placed by circadian weight, log-normal in-session gaps
 *   farm  — fixed ~45s cadence, 24/7, tiny jitter
 *   sched — a bot that mimics circadian placement + log-normal gaps + sleep
 * The honest result: the scheduled bot passes every cadence check. Cadence
 * analysis filters lazy farms; it does not stop a competent one.
 */
import { mulberry32, gauss } from "@/lib/core/rng";

/** circadian activity weight by hour (0-23): humans sleep, farms do not */
export const CIRCADIAN_CURVE = [
  0.05, 0.02, 0.01, 0.01, 0.01, 0.02, 0.06, 0.18, 0.35, 0.45, 0.5, 0.55, 0.6,
  0.58, 0.55, 0.6, 0.7, 0.85, 1, 1, 0.95, 0.8, 0.5, 0.2,
];

export interface WeekTimes {
  human: number[];
  farm: number[];
  sched: number[];
}

export function simulateWeek(seed = 77003): WeekTimes {
  const r = mulberry32(seed);
  const DAYS = 7;
  const out: WeekTimes = { human: [], farm: [], sched: [] };
  // HUMAN: session bursts placed by circadian weight; log-normal gaps inside
  for (let d = 0; d < DAYS; d++) {
    const sessions = 2 + ((r() * 3) | 0);
    for (let s = 0; s < sessions; s++) {
      let hr;
      do {
        hr = r() * 24;
      } while (r() > CIRCADIAN_CURVE[hr | 0]);
      let t = d * 86400 + hr * 3600;
      const games = 3 + ((r() * 12) | 0);
      for (let g = 0; g < games; g++) {
        out.human.push(t);
        t += Math.exp(gauss(r, Math.log(38), 0.55));
      }
    }
  }
  // NAIVE FARM: fixed cadence, 24/7, tiny jitter
  for (let t = 0; t < DAYS * 86400; t += 45 + (r() - 0.5) * 4) out.farm.push(t);
  // SCHEDULED BOT: mimics circadian + log-normal gaps + sleep block
  for (let d = 0; d < DAYS; d++) {
    const sessions = 3 + ((r() * 3) | 0);
    for (let s = 0; s < sessions; s++) {
      let hr;
      do {
        hr = r() * 24;
      } while (r() > CIRCADIAN_CURVE[hr | 0]);
      let t = d * 86400 + hr * 3600;
      const games = 6 + ((r() * 18) | 0);
      for (let g = 0; g < games; g++) {
        out.sched.push(t);
        t += Math.exp(gauss(r, Math.log(34), 0.5));
      }
    }
  }
  out.human.sort((a, b) => a - b);
  out.farm.sort((a, b) => a - b);
  out.sched.sort((a, b) => a - b);
  return out;
}

export interface CadenceMetrics {
  n: number;
  /** coefficient of variation of in-session (<300s) gaps */
  cv: number;
  activeHours: number;
  /** longest idle stretch in hours */
  longestIdle: number;
  hours: number[];
  gaps: number[];
}

export function cadenceMetrics(times: number[]): CadenceMetrics {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  const inSess = gaps.filter((g) => g < 300);
  const mean = inSess.reduce((a, b) => a + b, 0) / (inSess.length || 1);
  const sd = Math.sqrt(
    inSess.reduce((a, b) => a + (b - mean) * (b - mean), 0) /
      (inSess.length || 1)
  );
  const hours = new Array(24).fill(0);
  for (const t of times) hours[Math.floor(t / 3600) % 24]++;
  const active = hours.filter((h) => h > 0).length;
  const longestIdle = Math.max(...gaps) / 3600;
  return {
    n: times.length,
    cv: mean ? sd / mean : 0,
    activeHours: active,
    longestIdle,
    hours,
    gaps,
  };
}
