"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Currency } from "@/lib/types";
import { formatCurrencySmart } from "@/lib/format";
import { cn } from "@/lib/cn";

export type ContributionRow = {
  key: string;
  label: string;
  todayPL: number | null;
  totalPL: number | null;
};

/**
 * Contribution to return — which holdings drove P&L most. Split-bar
 * visualization with a zero axis in the middle; positive bars go right,
 * negative bars go left. Tab between "Today" and "All-time".
 *
 * Values are already expressed in the user's display currency.
 */
export function ContributionList({
  rows,
  currency,
  limit = 6,
}: {
  rows: ContributionRow[];
  currency: Currency;
  limit?: number;
}) {
  const [mode, setMode] = useState<"today" | "total">("today");

  const { display, maxAbs, hasAny } = useMemo(() => {
    const picked = rows
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: mode === "today" ? r.todayPL : r.totalPL,
      }))
      .filter((r): r is { key: string; label: string; value: number } =>
        typeof r.value === "number" && Number.isFinite(r.value) && r.value !== 0,
      )
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, limit);
    const m = picked.reduce((s, r) => Math.max(s, Math.abs(r.value)), 0);
    return { display: picked, maxAbs: m, hasAny: picked.length > 0 };
  }, [rows, mode, limit]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Top movers
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 p-0.5 text-[10px]">
          {(["today", "total"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2 py-0.5 font-medium uppercase tracking-wider transition",
                mode === m
                  ? "bg-white/10 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {m === "today" ? "Today" : "All-time"}
            </button>
          ))}
        </div>
      </div>

      {!hasAny ? (
        <div className="py-3 text-center text-[11px] text-muted">
          {mode === "today"
            ? "No intraday moves yet."
            : "No P/L data yet — add cost basis."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {display.map((r) => {
            const pos = r.value >= 0;
            const widthPct =
              maxAbs > 0 ? (Math.abs(r.value) / maxAbs) * 50 : 0; // half of bar
            return (
              <div key={r.key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-[11px]">
                  {r.label}
                </span>
                <div className="relative h-3 flex-1 overflow-hidden rounded bg-white/[0.03]">
                  {/* center axis */}
                  <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" />
                  <div
                    className={cn(
                      "absolute top-0 h-full rounded transition-all",
                      pos ? "bg-emerald-400/70" : "bg-rose-400/70",
                    )}
                    style={{
                      width: `${widthPct}%`,
                      left: pos ? "50%" : `${50 - widthPct}%`,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "w-24 shrink-0 text-right text-[11px] tabular-nums font-semibold",
                    pos ? "text-emerald-300" : "text-rose-300",
                  )}
                >
                  {pos ? (
                    <TrendingUp className="mr-0.5 inline h-3 w-3" />
                  ) : (
                    <TrendingDown className="mr-0.5 inline h-3 w-3" />
                  )}
                  {pos ? "+" : "−"}
                  {formatCurrencySmart(
                    Math.abs(r.value),
                    currency,
                    mode === "today" ? 1000 : undefined,
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
