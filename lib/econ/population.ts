/*
 * Skill-matched population win-rate simulation — direct port of the legacy
 * model (golden-tested for exact parity). Latent skill ~ N(0,1); opponents
 * are drawn from a narrow band of the sorted skill ladder (the way real
 * head-to-head seeding works), which compresses observed win rates toward
 * 50% and makes a sustained high win rate a loud outlier. Win rates EMERGE
 * from simulated play rather than being assigned.
 */
import { mulberry32, gauss } from "@/lib/core/rng";

export interface PopulationParams {
  nPlayers: number;
  nGames: number;
  /** the bot's sustained win rate, for the z-score readout */
  botWR: number;
  /** matchmaking band as a fraction of the ladder (legacy: 0.06) */
  band?: number;
  /** logistic skill-to-win-probability steepness (legacy: 1.15) */
  k?: number;
  seed?: number;
}

export interface PopulationResult {
  rates: number[];
  mean: number;
  sd: number;
  /** bot win rate expressed as a z-score against the observed population */
  z: number;
  /** binomial sampling-noise floor sqrt(0.25/nGames) */
  noise: number;
  nGames: number;
  botWR: number;
  pctile: number;
}

export function simulatePopulation(p: PopulationParams): PopulationResult {
  const { nPlayers, nGames, botWR } = p;
  const bandFrac = p.band ?? 0.06;
  const K = p.k ?? 1.15;
  const r = mulberry32(p.seed ?? 20260822);
  const skill: number[] = [];
  for (let i = 0; i < nPlayers; i++) skill.push(gauss(r, 0, 1));
  const order = skill.map((_, i) => i).sort((a, b) => skill[a] - skill[b]);
  const band = Math.max(2, Math.round(nPlayers * bandFrac));
  const wins = new Array(nPlayers).fill(0),
    played = new Array(nPlayers).fill(0);
  for (let g = 0; g < (nGames * nPlayers) / 2; g++) {
    const ia = (r() * nPlayers) | 0;
    let ib = ia + (((r() * (2 * band + 1)) | 0) - band);
    ib = Math.max(0, Math.min(nPlayers - 1, ib));
    if (ib === ia) ib = (ia + 1) % nPlayers;
    const a = order[ia],
      b = order[ib];
    const pa = 1 / (1 + Math.exp(-K * (skill[a] - skill[b])));
    const aWins = r() < pa;
    played[a]++;
    played[b]++;
    if (aWins) wins[a]++;
    else wins[b]++;
  }
  const rates: number[] = [];
  for (let i = 0; i < nPlayers; i++)
    if (played[i] >= 30) rates.push(wins[i] / played[i]);
  const mean = rates.reduce((x, y) => x + y, 0) / rates.length;
  const sd = Math.sqrt(
    rates.reduce((x, y) => x + (y - mean) * (y - mean), 0) / rates.length
  );
  const z = (botWR - mean) / sd;
  const above = rates.filter((v) => v >= botWR).length;
  const noise = Math.sqrt(0.25 / nGames);
  return {
    rates,
    mean,
    sd,
    z,
    noise,
    nGames,
    botWR,
    pctile: 100 * (1 - above / rates.length),
  };
}
