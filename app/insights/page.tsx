"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
  useCurrency,
  useFx,
  useHistory,
  useIntraday,
  useInvestments,
  usePrices,
} from "../providers";
import { symbolsOf, type PriceMap } from "@/lib/valuation";
import { runInsights, type InsightContext } from "@/lib/insights";
import { InsightCard } from "@/components/insight-card";
import type { HistorySeries, IntradaySeries } from "@/lib/market";

export default function InsightsPage() {
  const { currency } = useCurrency();
  const investmentsQ = useInvestments();
  const investments = investmentsQ.data?.investments ?? [];
  const symbols = symbolsOf(investments);
  const pricesQ = usePrices(symbols);
  const intradayQ = useIntraday(symbols);
  const fxQ = useFx();
  const historyQ = useHistory(symbols, "5y");

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

  const loading = investmentsQ.isLoading;

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
        {historyQ.isLoading && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted">
            Loading history…
          </span>
        )}
      </motion.header>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : insights.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-muted">
            Add a few investments to unlock insights.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {insights.map((i, idx) => (
            <InsightCard key={i.id} insight={i} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
