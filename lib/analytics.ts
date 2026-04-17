import { HistoryPoint } from "./market";

/** Herfindahl-Hirschman Index over weights that sum to 1. Returns 0..10000. */
export function hhi(weights: number[]): number {
  const total = weights.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  const norm = weights.map((w) => w / total);
  return norm.reduce((s, w) => s + w * w, 0) * 10000;
}

/** Compound annual growth rate from start→end over `years`. */
export function cagr(
  start: number,
  end: number,
  years: number,
): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** Worst drawdown over a time series. Returns a negative fraction, or 0. */
export function maxDrawdown(points: HistoryPoint[]): {
  pct: number;
  peakAt: number | null;
  troughAt: number | null;
} {
  let peak = -Infinity;
  let peakAt: number | null = null;
  let worst = 0;
  let worstPeakAt: number | null = null;
  let worstTroughAt: number | null = null;
  for (const p of points) {
    if (p.close > peak) {
      peak = p.close;
      peakAt = p.t;
    }
    if (peak > 0) {
      const dd = p.close / peak - 1;
      if (dd < worst) {
        worst = dd;
        worstPeakAt = peakAt;
        worstTroughAt = p.t;
      }
    }
  }
  return { pct: worst, peakAt: worstPeakAt, troughAt: worstTroughAt };
}

export function argMax<T>(items: T[], score: (t: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const it of items) {
    const s = score(it);
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return best;
}

export function humanDuration(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days - years * 365) / 30);
  return remMonths === 0
    ? `${years} year${years === 1 ? "" : "s"}`
    : `${years}y ${remMonths}m`;
}
