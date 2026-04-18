"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import type { Currency } from "@/lib/types";
import type { AssetProfile } from "@/app/providers";
import { formatCurrency } from "@/lib/format";

type Row = {
  sector: string;
  value: number;
  pct: number;
};

// Soft, distinguishable palette for sector bars. Cycled if there are more
// sectors than colors.
const PALETTE = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
  "#8b5cf6",
  "#0ea5e9",
  "#84cc16",
  "#eab308",
  "#f97316",
];

/**
 * Sector breakdown for stock holdings. Falls back to "Other" for symbols
 * whose assetProfile didn't expose a sector (ETFs, crypto, commodities).
 * Uses the user's display currency — values are already converted upstream.
 */
export function SectorBreakdown({
  items,
  profiles,
  currency,
}: {
  items: Array<{ symbol: string; value: number }>;
  profiles: Record<string, AssetProfile>;
  currency: Currency;
}) {
  const { rows, total } = useMemo(() => {
    const totals = new Map<string, number>();
    let t = 0;
    for (const it of items) {
      if (it.value <= 0) continue;
      const p = profiles[it.symbol];
      const sector = p?.sector?.trim() || "Other";
      totals.set(sector, (totals.get(sector) ?? 0) + it.value);
      t += it.value;
    }
    const out: Row[] = Array.from(totals.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        pct: t > 0 ? (value / t) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
    return { rows: out, total: t };
  }, [items, profiles]);

  if (total <= 0 || rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-indigo-300" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Sector mix
        </span>
        <span className="ml-auto text-[11px] text-muted">
          {rows.length} {rows.length === 1 ? "sector" : "sectors"}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.sector}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate pr-2">{r.sector}</span>
              <span className="tabular-nums text-muted">
                {formatCurrency(r.value, currency)}
                <span className="ml-2 font-semibold text-foreground/90">
                  {r.pct.toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(2, r.pct)}%`,
                  background: PALETTE[i % PALETTE.length],
                  opacity: 0.8,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
