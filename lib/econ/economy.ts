/*
 * Head-to-head economy arithmetic. Pot = 2×entry, house keeps rake, winner
 * takes the rest. These four lines are the strongest "detector" in the whole
 * project: they bind by arithmetic, not forensics.
 */

export function winNet(entry: number, rake: number): number {
  return 2 * entry * (1 - rake) - entry;
}

export function loseNet(entry: number): number {
  return -entry;
}

export function evPerGame(p: number, entry: number, rake: number): number {
  return p * winNet(entry, rake) + (1 - p) * loseNet(entry);
}

export function breakEven(entry: number, rake: number): number {
  return -loseNet(entry) / (winNet(entry, rake) - loseNet(entry));
}
