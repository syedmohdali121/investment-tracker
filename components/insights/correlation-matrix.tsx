"use client";

import { useMemo } from "react";
import { Network } from "lucide-react";
import { HistorySeries } from "@/lib/market";
import { correlation } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/cn";

/**
 * Pairwise correlation heatmap of daily log returns over the 1Y window.
 * Useful for spotting hidden concentration.
 */
export function CorrelationMatrix({
  history,
  title = "Correlation (1Y)",
}: {
  history: Record<string, HistorySeries>;
  title?: string;
}) {
  const now = useNow();
  const { symbols, matrix } = useMemo(() => {
    const all = Object.entries(history).filter(
      ([, s]) => s.points.length >= 30,
    );
    // Limit to one-year tail to keep everything aligned and noise low.
    const cutoff = now - 365 * 24 * 60 * 60 * 1000;
    const trimmed = all.map(([sym, s]) => ({
      sym,
      pts: s.points.filter((p) => p.t >= cutoff),
    }));
    const syms = trimmed.map((t) => t.sym).sort();
    const bySym = new Map(trimmed.map((t) => [t.sym, t.pts]));
    const m: (number | null)[][] = syms.map(() => syms.map(() => null));
    for (let i = 0; i < syms.length; i++) {
      for (let j = i; j < syms.length; j++) {
        if (i === j) {
          m[i][j] = 1;
          continue;
        }
        const c = correlation(
          bySym.get(syms[i]) ?? [],
          bySym.get(syms[j]) ?? [],
        );
        m[i][j] = c;
        m[j][i] = c;
      }
    }
    return { symbols: syms, matrix: m };
  }, [history, now]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <Network className="h-3.5 w-3.5 text-violet-300" />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {symbols.length < 2 ? (
        <p className="text-sm text-muted">
          Need at least two stocks with 1Y of data.
        </p>
      ) : (
        <div>
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr>
                <th className="w-[14%]" />
                {symbols.map((s) => (
                  <th
                    key={s}
                    className="px-0.5 py-1 text-center font-medium text-muted"
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((rowSym, i) => (
                <tr key={rowSym}>
                  <th className="px-1 py-0.5 text-right font-medium text-muted">
                    {rowSym}
                  </th>
                  {symbols.map((colSym, j) => {
                    const v = matrix[i][j];
                    return (
                      <td key={colSym} className="p-0.5">
                        <div
                          className={cn(
                            "flex aspect-square w-full items-center justify-center rounded-md text-[10px] font-semibold tabular-nums",
                            v == null && "bg-white/[0.02] text-muted",
                          )}
                          style={
                            v != null
                              ? {
                                  background: corrBg(v),
                                  color:
                                    v >= 0.3
                                      ? "#fef9c3"
                                      : v <= -0.3
                                        ? "#ccfbf1"
                                        : "rgba(255,255,255,0.7)",
                                }
                              : undefined
                          }
                          title={`${rowSym} ↔ ${colSym}: ${v == null ? "—" : v.toFixed(2)}`}
                        >
                          {v == null ? "—" : formatNumber(v, 2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted">
            +1 = move together, 0 = unrelated, −1 = move opposite. Stocks
            clustered near +1 aren&apos;t truly diversifying.
          </p>
        </div>
      )}
    </div>
  );
}

function corrBg(v: number): string {
  // -1..1 mapped to red..neutral..amber
  if (v >= 0) {
    // positive = more alarming for diversification (amber/yellow)
    const a = 0.1 + v * 0.55;
    return `rgba(245, 158, 11, ${a})`;
  }
  const a = 0.1 + Math.abs(v) * 0.55;
  return `rgba(20, 184, 166, ${a})`;
}
