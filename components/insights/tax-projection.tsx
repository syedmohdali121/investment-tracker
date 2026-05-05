"use client";

import { useMemo } from "react";
import { Receipt, Scissors } from "lucide-react";
import { isStock, type Currency, type Investment, type StockInvestment } from "@/lib/types";
import {
  DEFAULT_TAX_RATES,
  projectPortfolioTax,
  type TaxBucket,
  type TaxRegime,
} from "@/lib/tax";
import type { PriceMap } from "@/lib/valuation";
import { formatCurrencySmart } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Tax projection card. Shows a per-holding "if you sold today" tax bill plus
 * a portfolio summary by regime/bucket and a harvestable-loss callout.
 *
 * Holding period is approximated from `createdAt` since we don't track tax
 * lots yet. India LTCG ₹1.25L exemption is applied at the portfolio level.
 *
 * Default rates (India ST 20%, LT 12.5% over ₹1.25L; US ST 30%, LT 15%) are
 * approximations — they're not legal advice. A future settings panel can
 * make them tunable.
 */
export function TaxProjectionCard({
  investments,
  prices,
  usdInr,
  display,
}: {
  investments: Investment[];
  prices: PriceMap;
  usdInr: number;
  display: Currency;
}) {
  const projection = useMemo(() => {
    const stocks = investments.filter(isStock) as StockInvestment[];
    return projectPortfolioTax(stocks, prices, usdInr, display, DEFAULT_TAX_RATES);
  }, [investments, prices, usdInr, display]);

  if (projection.rows.length === 0) return null;

  const sortedRows = [...projection.rows].sort(
    (a, b) => Math.abs(b.gainDisplay) - Math.abs(a.gainDisplay),
  );

  const summary = projection.summary;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5 text-amber-300" />
          <h3 className="text-base font-semibold">If you sold today</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 font-semibold text-amber-100 tabular-nums">
            Tax · {formatCurrencySmart(projection.totalTaxDisplay, display)}
          </span>
          {projection.harvestableTaxDisplay > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 font-semibold text-emerald-100 tabular-nums">
              <Scissors className="h-3 w-3" />
              Harvestable · {formatCurrencySmart(projection.harvestableTaxDisplay, display)}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <BucketTile label="India · ST" gain={summary.indiaSTGain} loss={summary.indiaSTLoss} display={display} />
        <BucketTile label="India · LT" gain={summary.indiaLTGain} loss={summary.indiaLTLoss} display={display} />
        <BucketTile label="US · ST" gain={summary.usSTGain} loss={summary.usSTLoss} display={display} />
        <BucketTile label="US · LT" gain={summary.usLTGain} loss={summary.usLTLoss} display={display} />
      </div>

      {projection.inLtcgExemptApplied > 0 && (
        <div className="mb-3 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-muted">
          India LTCG exemption applied:{" "}
          <span className="font-semibold text-foreground/90">
            {formatCurrencySmart(projection.inLtcgExemptApplied, display)}
          </span>{" "}
          (₹1.25L of LT equity gains are tax-free per FY).
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="pb-2 pr-3 font-medium">Symbol</th>
              <th className="pb-2 pr-3 font-medium">Bucket</th>
              <th className="pb-2 pr-3 text-right font-medium">Unrealized</th>
              <th className="pb-2 text-right font-medium">Tax @ rate</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr
                key={r.symbol}
                className="border-b border-white/[0.04] last:border-0"
              >
                <td className="py-2 pr-3 font-medium">{r.symbol}</td>
                <td className="py-2 pr-3">
                  <BucketBadge regime={r.regime} bucket={r.bucket} />
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
                <td className="py-2 text-right tabular-nums text-foreground/90">
                  {r.gainDisplay > 0 ? (
                    <>
                      {formatCurrencySmart(r.taxDisplay, display)}{" "}
                      <span className="text-[10px] text-muted">
                        @ {(r.rate * 100).toFixed(1)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-muted">
        Estimates use default rates: India ST 20%, LT 12.5% (over ₹1.25L);
        US ST 30%, LT 15%. Holding period is taken from each entry&apos;s
        created date. Not tax advice.
      </p>
    </div>
  );
}

function BucketTile({
  label,
  gain,
  loss,
  display,
}: {
  label: string;
  gain: number;
  loss: number;
  display: Currency;
}) {
  const net = gain - loss;
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          net >= 0 ? "text-emerald-200" : "text-rose-200",
        )}
      >
        {net >= 0 ? "+" : "−"}
        {formatCurrencySmart(Math.abs(net), display)}
      </div>
      <div className="text-[10px] text-muted tabular-nums">
        +{formatCurrencySmart(gain, display)} / −{formatCurrencySmart(loss, display)}
      </div>
    </div>
  );
}

function BucketBadge({ regime, bucket }: { regime: TaxRegime; bucket: TaxBucket }) {
  const tone =
    bucket === "LT"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone,
      )}
    >
      {regime === "INDIA" ? "IN" : "US"} · {bucket}
    </span>
  );
}
