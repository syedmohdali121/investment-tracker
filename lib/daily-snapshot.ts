/**
 * Daily snapshot helper for the "What changed today" badge.
 *
 * We persist the user's portfolio total + per-holding values to localStorage
 * keyed by user id. On the next visit after the local date has rolled over,
 * the dashboard compares the live numbers against the stored snapshot and
 * shows a one-shot summary banner. Once shown (or dismissed), we overwrite
 * the snapshot with today's values so it won't fire again until tomorrow.
 *
 * Currency is recorded alongside the totals; if the user has switched display
 * currency between visits, we refresh the snapshot silently rather than
 * surface a misleading diff.
 */

import type { Currency } from "./types";

export type HoldingSnapshotEntry = { label: string; value: number };

export type DailySnapshot = {
  /** Local-date stamp YYYY-MM-DD captured when the snapshot was written. */
  date: string;
  /** Display currency the totals are denominated in. */
  currency: Currency;
  /** Net worth in `currency`. */
  total: number;
  /** Per-holding values, keyed by investment id. */
  perHolding: Record<string, HoldingSnapshotEntry>;
};

const KEY_PREFIX = "portfolio-pulse:daily-snapshot:";

function keyFor(userId: string | null | undefined): string {
  return `${KEY_PREFIX}${userId ?? "anon"}`;
}

/** YYYY-MM-DD in the user's local timezone. */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function readSnapshot(
  userId: string | null | undefined,
): DailySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailySnapshot;
    if (
      !parsed ||
      typeof parsed.date !== "string" ||
      typeof parsed.total !== "number" ||
      !parsed.perHolding
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot(
  userId: string | null | undefined,
  snapshot: DailySnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  } catch {
    /* quota exceeded or storage disabled — silently ignore */
  }
}

export type HoldingDiffRow = {
  id: string;
  label: string;
  before: number;
  after: number;
  delta: number;
};

export type DailyDiff = {
  totalDelta: number;
  totalPct: number;
  topGainer: HoldingDiffRow | null;
  topLoser: HoldingDiffRow | null;
  fromDate: string;
};

/**
 * Compute the diff between a stored snapshot and the current portfolio.
 * Returns null when the comparison would be meaningless (currency mismatch,
 * same-day snapshot, or no measurable change).
 */
export function diffAgainstSnapshot(
  prev: DailySnapshot,
  current: {
    date: string;
    currency: Currency;
    total: number;
    perHolding: Record<string, HoldingSnapshotEntry>;
  },
): DailyDiff | null {
  if (prev.currency !== current.currency) return null;
  if (prev.date === current.date) return null;

  const totalDelta = current.total - prev.total;
  const totalPct = prev.total > 0 ? (totalDelta / prev.total) * 100 : 0;

  const rows: HoldingDiffRow[] = [];
  // Only diff holdings present in BOTH snapshots — new holdings and removed
  // holdings would skew "top mover" toward churn rather than market moves.
  for (const [id, prevEntry] of Object.entries(prev.perHolding)) {
    const cur = current.perHolding[id];
    if (!cur) continue;
    const delta = cur.value - prevEntry.value;
    if (delta === 0) continue;
    rows.push({
      id,
      label: cur.label || prevEntry.label,
      before: prevEntry.value,
      after: cur.value,
      delta,
    });
  }

  // Require at least a few rupees/dollars of movement so we don't fire on
  // pure rounding noise when prices were cached.
  const noise = Math.max(1, Math.abs(prev.total) * 0.0001);
  if (Math.abs(totalDelta) < noise && rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => b.delta - a.delta);
  const topGainer = sorted[0] && sorted[0].delta > 0 ? sorted[0] : null;
  const last = sorted[sorted.length - 1];
  const topLoser = last && last.delta < 0 ? last : null;

  return {
    totalDelta,
    totalPct,
    topGainer,
    topLoser,
    fromDate: prev.date,
  };
}
