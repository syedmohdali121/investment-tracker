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

/** Normalize series so the first point equals `base` (default 100). */
export function normalizeTo(
  points: HistoryPoint[],
  base = 100,
): HistoryPoint[] {
  if (points.length === 0) return points;
  const first = points[0].close;
  if (first <= 0) return points;
  return points.map((p) => ({ t: p.t, close: (p.close / first) * base }));
}

/**
 * Combine multiple symbol series into a single portfolio value series.
 * For each unique timestamp in any series, sums `qty × close` across symbols,
 * forward-filling missing values.
 */
export function combinePortfolioSeries(
  inputs: Array<{ symbol: string; qty: number; points: HistoryPoint[] }>,
): HistoryPoint[] {
  if (inputs.length === 0) return [];
  const allTimes = new Set<number>();
  for (const i of inputs) for (const p of i.points) allTimes.add(p.t);
  const times = Array.from(allTimes).sort((a, b) => a - b);
  // For each symbol, pre-compute sorted points for forward fill.
  const sorted = inputs.map((i) => ({
    qty: i.qty,
    points: [...i.points].sort((a, b) => a.t - b.t),
  }));
  const cursors = sorted.map(() => 0);
  const lastClose: number[] = sorted.map((s) =>
    s.points.length > 0 ? s.points[0].close : 0,
  );
  const out: HistoryPoint[] = [];
  for (const t of times) {
    let v = 0;
    let hasAny = false;
    for (let i = 0; i < sorted.length; i++) {
      const pts = sorted[i].points;
      while (cursors[i] < pts.length && pts[cursors[i]].t <= t) {
        lastClose[i] = pts[cursors[i]].close;
        cursors[i]++;
        hasAny = true;
      }
      v += lastClose[i] * sorted[i].qty;
    }
    if (hasAny || out.length > 0) out.push({ t, close: v });
  }
  return out;
}

/**
 * Monthly return matrix. Returns rows keyed by year, with 12 optional values
 * (Jan..Dec). Each value is the fractional return for that calendar month,
 * computed from the first and last close of the month.
 */
export function monthlyReturns(
  points: HistoryPoint[],
): Map<number, (number | null)[]> {
  const byYM = new Map<string, { first: HistoryPoint; last: HistoryPoint }>();
  for (const p of points) {
    const d = new Date(p.t);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const cur = byYM.get(key);
    if (!cur) byYM.set(key, { first: p, last: p });
    else {
      if (p.t < cur.first.t) cur.first = p;
      if (p.t > cur.last.t) cur.last = p;
    }
  }
  const byYear = new Map<number, (number | null)[]>();
  for (const [key, { first, last }] of byYM) {
    const [y, m] = key.split("-").map(Number);
    if (first.close <= 0) continue;
    const ret = last.close / first.close - 1;
    if (!byYear.has(y)) byYear.set(y, Array<number | null>(12).fill(null));
    byYear.get(y)![m] = ret;
  }
  return byYear;
}

/**
 * Pearson correlation between daily log returns of two series. The series
 * are aligned by timestamp; only matching timestamps are used.
 */
export function correlation(
  a: HistoryPoint[],
  b: HistoryPoint[],
): number | null {
  if (a.length < 3 || b.length < 3) return null;
  const mb = new Map<number, number>();
  for (const p of b) mb.set(p.t, p.close);
  const ra: number[] = [];
  const rb: number[] = [];
  let prevA: number | null = null;
  let prevB: number | null = null;
  for (const p of a) {
    const bv = mb.get(p.t);
    if (bv == null || p.close <= 0 || bv <= 0) {
      prevA = p.close;
      prevB = bv ?? prevB;
      continue;
    }
    if (prevA != null && prevB != null && prevA > 0 && prevB > 0) {
      ra.push(Math.log(p.close / prevA));
      rb.push(Math.log(bv / prevB));
    }
    prevA = p.close;
    prevB = bv;
  }
  const n = ra.length;
  if (n < 3) return null;
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const ma = mean(ra);
  const mbr = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = ra[i] - ma;
    const xb = rb[i] - mbr;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/** CAGR from a time-ordered series' first and last points. */
export function seriesCagr(points: HistoryPoint[]): {
  cagr: number;
  years: number;
} | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const years = (last.t - first.t) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 0 || first.close <= 0) return null;
  return { cagr: Math.pow(last.close / first.close, 1 / years) - 1, years };
}
