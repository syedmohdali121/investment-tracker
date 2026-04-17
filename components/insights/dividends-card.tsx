"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";
import type { StockInvestment } from "@/lib/types";
import type { DividendSeries } from "@/app/providers";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

type Row = {
  symbol: string;
  currency: "USD" | "INR";
  lastYear: number;
  lifetime: number;
  yieldPct: number | null;
};

/**
 * Dividends received across your current holdings. Uses *current quantity*
 * for each historical dividend — i.e. "what you would have received if you
 * held this position for the entire window". Grouped by native currency to
 * avoid misleading FX conversions.
 */
export function DividendsCard({
  stocks,
  dividends,
  prices,
}: {
  stocks: StockInvestment[];
  dividends: Record<string, DividendSeries>;
  prices: Record<string, { price: number }>;
}) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const nowMs = Date.now();
    const yearAgo = nowMs - 365 * 24 * 60 * 60 * 1000;
    const qtyBySymbol = new Map<string, number>();
    const cur = new Map<string, "USD" | "INR">();
    for (const s of stocks) {
      qtyBySymbol.set(s.symbol, (qtyBySymbol.get(s.symbol) ?? 0) + s.quantity);
      cur.set(s.symbol, s.currency);
    }
    for (const [symbol, series] of Object.entries(dividends)) {
      const qty = qtyBySymbol.get(symbol) ?? 0;
      if (qty <= 0) continue;
      let lifetime = 0;
      let lastYear = 0;
      for (const e of series.events) {
        const paid = e.amount * qty;
        lifetime += paid;
        if (e.t >= yearAgo) lastYear += paid;
      }
      const price = prices[symbol]?.price;
      const yieldPct =
        price && price > 0 ? (lastYear / (price * qty)) * 100 : null;
      if (lifetime <= 0) continue;
      out.push({
        symbol,
        currency: cur.get(symbol) ?? series.currency,
        lastYear,
        lifetime,
        yieldPct,
      });
    }
    return out.sort((a, b) => b.lastYear - a.lastYear);
  }, [stocks, dividends, prices]);

  const totals = useMemo(() => {
    const totalsByCur: Record<"USD" | "INR", { lastYear: number; lifetime: number }> = {
      USD: { lastYear: 0, lifetime: 0 },
      INR: { lastYear: 0, lifetime: 0 },
    };
    for (const r of rows) {
      totalsByCur[r.currency].lastYear += r.lastYear;
      totalsByCur[r.currency].lifetime += r.lifetime;
    }
    return totalsByCur;
  }, [rows]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <Coins className="h-3.5 w-3.5 text-amber-300" />
        <h3 className="text-base font-semibold">Dividends</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No dividends detected for your current holdings.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            {(["USD", "INR"] as const).map((c) =>
              totals[c].lifetime > 0 ? (
                <div
                  key={c}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                >
                  <div className="text-muted">
                    {c} · last 12 months
                  </div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-emerald-300">
                    {formatCurrency(totals[c].lastYear, c)}
                  </div>
                  <div className="text-[11px] text-muted">
                    Lifetime {formatCurrency(totals[c].lifetime, c)}
                  </div>
                </div>
              ) : null,
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-1 text-left font-medium">Symbol</th>
                  <th className="py-1 text-right font-medium">Yield</th>
                  <th className="py-1 text-right font-medium">Last 12m</th>
                  <th className="py-1 text-right font-medium">Lifetime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="py-1.5 font-medium">{r.symbol}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right tabular-nums",
                        r.yieldPct && r.yieldPct > 2
                          ? "text-emerald-300"
                          : "text-muted",
                      )}
                    >
                      {r.yieldPct == null ? "—" : `${formatNumber(r.yieldPct, 2)}%`}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatCurrency(r.lastYear, r.currency)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted">
                      {formatCurrency(r.lifetime, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Computed as <span className="font-medium">dividend × current
            quantity</span>. Yield uses the last 12 months of payouts at today&apos;s
            price.
          </p>
        </>
      )}
    </div>
  );
}
