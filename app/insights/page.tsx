"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
  useCurrency,
  useDividends,
  useFx,
  useHistory,
  useIntraday,
  useInvestments,
  usePrices,
  type DividendSeries,
} from "../providers";
import { symbolsOf, type PriceMap } from "@/lib/valuation";
import { runInsights, type InsightContext } from "@/lib/insights";
import { InsightCard } from "@/components/insight-card";
import { DrawdownChart } from "@/components/insights/drawdown-chart";
import { MonthlyReturnsHeatmap } from "@/components/insights/monthly-heatmap";
import { CagrLeaderboard } from "@/components/insights/cagr-leaderboard";
import { CorrelationMatrix } from "@/components/insights/correlation-matrix";
import { DividendsCard } from "@/components/insights/dividends-card";
import { combinePortfolioSeries } from "@/lib/analytics";
import { isStock, type StockInvestment } from "@/lib/types";
import type { HistorySeries, IntradaySeries } from "@/lib/market";

export default function InsightsPage() {
  const { currency } = useCurrency();
  const investmentsQ = useInvestments();
  const investments = investmentsQ.data?.investments ?? [];
  const stocks = investments.filter(isStock) as StockInvestment[];
  const symbols = symbolsOf(investments);
  const pricesQ = usePrices(symbols);
  const intradayQ = useIntraday(symbols);
  const fxQ = useFx();
  const historyQ = useHistory(symbols, "5y");
  const dividendsQ = useDividends(symbols, 5);

  const priceMap: PriceMap = useMemo(() => {
    const m: PriceMap = {};
    for (const q of pricesQ.data?.quotes ?? []) {
      m[q.symbol] = {
        price: q.price,
        currency: q.currency,
        previousClose: q.previousClose,
      };
    }
    return m;
  }, [pricesQ.data]);

  const intradayMap = useMemo(() => {
    const m: Record<string, IntradaySeries> = {};
    for (const s of intradayQ.data?.series ?? [])
      m[s.symbol] = s as IntradaySeries;
    return m;
  }, [intradayQ.data]);

  const historyMap = useMemo(() => {
    const m: Record<string, HistorySeries> = {};
    for (const s of historyQ.data?.series ?? [])
      m[s.symbol] = s as HistorySeries;
    return m;
  }, [historyQ.data]);

  const dividendsMap = useMemo(() => {
    const m: Record<string, DividendSeries> = {};
    for (const s of dividendsQ.data?.series ?? []) m[s.symbol] = s;
    return m;
  }, [dividendsQ.data]);

  // Per-category portfolio history series (in native currency).
  const { usSeries, inSeries } = useMemo(() => {
    const buildFor = (cat: "US_STOCK" | "INDIAN_STOCK") => {
      const qtyBySymbol = new Map<string, number>();
      for (const s of stocks.filter((x) => x.category === cat))
        qtyBySymbol.set(s.symbol, (qtyBySymbol.get(s.symbol) ?? 0) + s.quantity);
      const inputs = Array.from(qtyBySymbol.entries())
        .map(([sym, qty]) => ({
          symbol: sym,
          qty,
          points: historyMap[sym]?.points ?? [],
        }))
        .filter((i) => i.points.length > 0);
      return combinePortfolioSeries(inputs);
    };
    return { usSeries: buildFor("US_STOCK"), inSeries: buildFor("INDIAN_STOCK") };
  }, [stocks, historyMap]);

  const insights = useMemo(() => {
    const ctx: InsightContext = {
      investments,
      prices: priceMap,
      usdInr: fxQ.data?.usdInr ?? 83,
      display: currency,
      intraday: intradayMap,
      history: historyMap,
    };
    return runInsights(ctx);
  }, [investments, priceMap, fxQ.data?.usdInr, currency, intradayMap, historyMap]);

  const usHistoryMap = useMemo(() => {
    const m: Record<string, HistorySeries> = {};
    for (const s of stocks.filter((x) => x.category === "US_STOCK")) {
      const h = historyMap[s.symbol];
      if (h) m[s.symbol] = h;
    }
    return m;
  }, [stocks, historyMap]);

  const inHistoryMap = useMemo(() => {
    const m: Record<string, HistorySeries> = {};
    for (const s of stocks.filter((x) => x.category === "INDIAN_STOCK")) {
      const h = historyMap[s.symbol];
      if (h) m[s.symbol] = h;
    }
    return m;
  }, [stocks, historyMap]);

  const priceByPrice = useMemo(() => {
    const m: Record<string, { price: number }> = {};
    for (const [k, v] of Object.entries(priceMap)) m[k] = { price: v.price };
    return m;
  }, [priceMap]);

  const loading = investmentsQ.isLoading;
  const hasHistory = Object.keys(historyMap).length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 flex items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            Portfolio insights
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Observations from your portfolio
          </h1>
          <p className="mt-1 text-sm text-muted">
            Automatically generated — updates as your prices and holdings change.
          </p>
        </div>
        {(historyQ.isLoading || dividendsQ.isLoading) && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted">
            Loading analytics…
          </span>
        )}
      </motion.header>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : insights.length === 0 && !hasHistory ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-muted">
            Add a few investments to unlock insights.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {insights.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground/80">
                Observations
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((i, idx) => (
                  <InsightCard key={i.id} insight={i} index={idx} />
                ))}
              </div>
            </section>
          )}

          {(usSeries.length > 0 || inSeries.length > 0) && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground/80">
                Drawdowns
              </h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {usSeries.length > 0 && (
                  <DrawdownChart
                    points={usSeries}
                    title="US Stocks drawdown"
                    subtitle="5 years · USD · current quantities"
                  />
                )}
                {inSeries.length > 0 && (
                  <DrawdownChart
                    points={inSeries}
                    title="Indian Stocks drawdown"
                    subtitle="5 years · INR · current quantities"
                  />
                )}
              </div>
            </section>
          )}

          {(usSeries.length > 0 || inSeries.length > 0) && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground/80">
                Monthly returns
              </h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {usSeries.length > 0 && (
                  <MonthlyReturnsHeatmap
                    points={usSeries}
                    title="US Stocks"
                    subtitle="Calendar-month portfolio returns"
                  />
                )}
                {inSeries.length > 0 && (
                  <MonthlyReturnsHeatmap
                    points={inSeries}
                    title="Indian Stocks"
                    subtitle="Calendar-month portfolio returns"
                  />
                )}
              </div>
            </section>
          )}

          {hasHistory && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground/80">
                Compounding
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <CagrLeaderboard history={historyMap} />
              </div>
            </section>
          )}

          {(Object.keys(usHistoryMap).length >= 2 ||
            Object.keys(inHistoryMap).length >= 2) && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground/80">
                Correlation
              </h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {Object.keys(usHistoryMap).length >= 2 && (
                  <CorrelationMatrix
                    history={usHistoryMap}
                    title="US Stocks correlation (1Y)"
                  />
                )}
                {Object.keys(inHistoryMap).length >= 2 && (
                  <CorrelationMatrix
                    history={inHistoryMap}
                    title="Indian Stocks correlation (1Y)"
                  />
                )}
              </div>
            </section>
          )}

          {Object.keys(dividendsMap).length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground/80">
                Income
              </h2>
              <DividendsCard
                stocks={stocks}
                dividends={dividendsMap}
                prices={priceByPrice}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
