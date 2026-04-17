"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { HistoryPoint } from "@/lib/market";
import { monthlyReturns } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Heatmap of calendar-month % returns. Green for positive, red for negative,
 * intensity scales with magnitude (capped at ±10%).
 */
export function MonthlyReturnsHeatmap({
  points,
  title = "Monthly returns",
  subtitle,
}: {
  points: HistoryPoint[];
  title?: string;
  subtitle?: string;
}) {
  const { years, rows } = useMemo(() => {
    const m = monthlyReturns(points);
    const ys = Array.from(m.keys()).sort((a, b) => a - b);
    const rows = ys.map((y) => ({ year: y, months: m.get(y)! }));
    return { years: ys, rows };
  }, [points]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-sky-300" />
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {years.length === 0 ? (
        <p className="text-sm text-muted">Not enough history.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-muted">
                <th className="w-10 px-1 py-1 text-left font-medium">Yr</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="px-1 py-1 text-center font-medium">
                    {m}
                  </th>
                ))}
                <th className="px-1 py-1 text-right font-medium">YTD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ year, months }) => {
                let ytd = 1;
                for (const r of months) if (r != null) ytd *= 1 + r;
                ytd -= 1;
                return (
                  <tr key={year}>
                    <td className="px-1 py-0.5 text-left font-medium tabular-nums">
                      {year}
                    </td>
                    {months.map((r, i) => (
                      <td key={i} className="p-0.5">
                        <div
                          className={cn(
                            "flex h-7 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums transition",
                            r == null && "bg-white/[0.02] text-muted",
                          )}
                          style={
                            r != null
                              ? {
                                  background: cellBg(r),
                                  color: r >= 0 ? "#d1fae5" : "#fecdd3",
                                }
                              : undefined
                          }
                          title={r != null ? `${(r * 100).toFixed(2)}%` : ""}
                        >
                          {r == null ? "—" : `${formatNumber(r * 100, 1)}`}
                        </div>
                      </td>
                    ))}
                    <td
                      className={cn(
                        "px-1 py-0.5 text-right font-semibold tabular-nums",
                        ytd >= 0 ? "text-emerald-300" : "text-rose-300",
                      )}
                    >
                      {ytd >= 0 ? "+" : ""}
                      {formatNumber(ytd * 100, 1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Map return fraction to a background color (±10% saturates). */
function cellBg(r: number): string {
  const pct = Math.max(-0.1, Math.min(0.1, r));
  const intensity = Math.abs(pct) / 0.1; // 0..1
  if (pct >= 0) {
    // green
    return `rgba(16, 185, 129, ${0.12 + intensity * 0.55})`;
  }
  return `rgba(244, 63, 94, ${0.12 + intensity * 0.55})`;
}
