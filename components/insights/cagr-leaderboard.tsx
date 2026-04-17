"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { HistorySeries } from "@/lib/market";
import { cagr } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

type Row = {
  symbol: string;
  r1y: number | null;
  r3y: number | null;
  r5y: number | null;
};

export function CagrLeaderboard({
  history,
}: {
  history: Record<string, HistorySeries>;
}) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [symbol, series] of Object.entries(history)) {
      const pts = series.points;
      if (!pts || pts.length < 2) continue;
      const last = pts[pts.length - 1];
      const nYearsAgo = (y: number) =>
        findClose(pts, last.t - y * 365.25 * 24 * 60 * 60 * 1000);
      const r = (yrs: number) => {
        const start = nYearsAgo(yrs);
        return start ? cagr(start.close, last.close, yrs) : null;
      };
      out.push({
        symbol,
        r1y: r(1),
        r3y: r(3),
        r5y: r(5),
      });
    }
    // Sort by 5y desc, then 3y, then 1y — pushing nulls to bottom.
    return out.sort((a, b) => {
      const ka = a.r5y ?? a.r3y ?? a.r1y ?? -Infinity;
      const kb = b.r5y ?? b.r3y ?? b.r1y ?? -Infinity;
      return kb - ka;
    });
  }, [history]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="h-3.5 w-3.5 text-amber-300" />
        <h3 className="text-base font-semibold">CAGR leaderboard</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No history loaded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted">
                <th className="py-1.5 text-left font-medium">Symbol</th>
                <th className="py-1.5 text-right font-medium">1Y</th>
                <th className="py-1.5 text-right font-medium">3Y</th>
                <th className="py-1.5 text-right font-medium">5Y</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td className="py-2 font-medium">{r.symbol}</td>
                  <Cell v={r.r1y} />
                  <Cell v={r.r3y} />
                  <Cell v={r.r5y} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cell({ v }: { v: number | null }) {
  if (v == null)
    return <td className="py-2 text-right text-muted tabular-nums">—</td>;
  return (
    <td
      className={cn(
        "py-2 text-right font-semibold tabular-nums",
        v >= 0 ? "text-emerald-300" : "text-rose-300",
      )}
    >
      {v >= 0 ? "+" : ""}
      {formatNumber(v * 100, 1)}%
    </td>
  );
}

/** Find the history point closest to (but not before) the target time. */
function findClose(
  points: { t: number; close: number }[],
  target: number,
): { t: number; close: number } | null {
  // Points are chronological. Walk forward until we pass target.
  let bestBefore: { t: number; close: number } | null = null;
  let bestAfter: { t: number; close: number } | null = null;
  for (const p of points) {
    if (p.t <= target) bestBefore = p;
    if (p.t >= target) {
      bestAfter = p;
      break;
    }
  }
  // Prefer the first point at-or-after target so the window is ≥ requested.
  return bestAfter ?? bestBefore;
}
