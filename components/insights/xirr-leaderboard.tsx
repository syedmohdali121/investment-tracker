"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { xirr, type CashFlow } from "@/lib/analytics";
import { isStock, type Currency, type Investment, type StockInvestment } from "@/lib/types";
import { convert, type PriceMap } from "@/lib/valuation";
import type { DividendSeries } from "@/app/providers";
import { cn } from "@/lib/cn";
import { formatCurrencySmart } from "@/lib/format";

/**
 * XIRR leaderboard — money-weighted return per holding, plus a portfolio
 * roll-up. Until a transactions ledger exists, we treat each holding as a
 * single buy at `createdAt` for `avgCost × quantity`, add per-share dividends
 * (multiplied by current quantity) at their pay dates, and add a synthetic
 * "sell today" inflow at current value. With a single buy + sell that's
 * equivalent to CAGR; dividends are what nudge it above the price-only CAGR.
 *
 * When real transactions arrive later, swap the flow construction here for
 * the ledger and everything else continues to work.
 */
export function XirrLeaderboard({
  investments,
  prices,
  dividends,
  usdInr,
  display,
}: {
  investments: Investment[];
  prices: PriceMap;
  dividends: Record<string, DividendSeries>;
  usdInr: number;
  display: Currency;
}) {
  const { rows, portfolio } = useMemo(() => {
    const stocks = investments.filter(isStock) as StockInvestment[];
    const now = Date.now();
    type Row = {
      symbol: string;
      currency: Currency;
      heldDays: number;
      irr: number | null;
      gainDisplay: number;
    };
    const rs: Row[] = [];
    const portfolioFlows: CashFlow[] = [];

    for (const s of stocks) {
      const created = Date.parse(s.createdAt);
      if (!Number.isFinite(created)) continue;
      const quote = prices[s.symbol];
      const price = quote?.price ?? s.avgCost;
      const ccy: Currency = quote?.currency ?? s.currency;
      const flows: CashFlow[] = [];
      // Initial buy (outflow, native ccy).
      flows.push({ t: created, amount: -s.avgCost * s.quantity });
      // Dividends since createdAt — best-effort approximation using current qty.
      const dseries = dividends[s.symbol];
      if (dseries) {
        for (const ev of dseries.events) {
          if (ev.t >= created && ev.t <= now) {
            flows.push({ t: ev.t, amount: ev.amount * s.quantity });
          }
        }
      }
      // Synthetic sell today.
      const finalValue = price * s.quantity;
      flows.push({ t: now, amount: finalValue });

      const irr = xirr(flows);
      const heldDays = Math.max(0, (now - created) / (24 * 60 * 60 * 1000));
      const gainDisplay = convert(
        finalValue - s.avgCost * s.quantity,
        ccy,
        display,
        usdInr,
      );
      rs.push({ symbol: s.symbol, currency: ccy, heldDays, irr, gainDisplay });

      // Roll into portfolio in display ccy.
      for (const f of flows) {
        portfolioFlows.push({
          t: f.t,
          amount: convert(f.amount, ccy, display, usdInr),
        });
      }
    }

    rs.sort((a, b) => (b.irr ?? -Infinity) - (a.irr ?? -Infinity));
    const portfolioIrr = xirr(portfolioFlows);
    return { rows: rs, portfolio: portfolioIrr };
  }, [investments, prices, dividends, usdInr, display]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
          <h3 className="text-base font-semibold">XIRR — money-weighted return</h3>
        </div>
        {portfolio !== null && (
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              portfolio >= 0
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-rose-400/30 bg-rose-400/10 text-rose-200",
            )}
            title="Portfolio-level XIRR (display currency)"
          >
            Portfolio · {(portfolio * 100).toFixed(2)}%
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Annualized rate from each holding&apos;s purchase date to today,
        including dividends. Until you log individual transactions, the
        purchase is approximated as a single buy at your stored avg cost on
        the position&apos;s created date.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-2 pr-3 font-medium">Symbol</th>
              <th className="pb-2 pr-3 text-right font-medium">Held</th>
              <th className="pb-2 pr-3 text-right font-medium">P/L</th>
              <th className="pb-2 text-right font-medium">XIRR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.symbol}
                className="border-b border-white/[0.04] last:border-0"
              >
                <td className="py-2 pr-3 font-medium">{r.symbol}</td>
                <td className="py-2 pr-3 text-right text-muted tabular-nums">
                  {formatHeld(r.heldDays)}
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right tabular-nums",
                    r.gainDisplay >= 0 ? "text-emerald-300" : "text-rose-300",
                  )}
                >
                  {r.gainDisplay >= 0 ? "+" : "−"}
                  {formatCurrencySmart(Math.abs(r.gainDisplay), display)}
                </td>
                <td
                  className={cn(
                    "py-2 text-right font-semibold tabular-nums",
                    r.irr === null
                      ? "text-muted"
                      : r.irr >= 0
                      ? "text-emerald-300"
                      : "text-rose-300",
                  )}
                >
                  {r.irr === null ? "—" : `${(r.irr * 100).toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatHeld(days: number): string {
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const y = days / 365.25;
  return y >= 10 ? `${Math.round(y)}y` : `${y.toFixed(1)}y`;
}
