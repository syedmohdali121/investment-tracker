"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  Download,
  PieChart as PieIcon,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import {
  useCurrency,
  useFx,
  useInvestments,
  usePrices,
  useProfiles,
} from "./providers";
import {
  aggregateByCategory,
  netWorth,
  symbolsOf,
  valueIn,
  costIn,
  type PriceMap,
} from "@/lib/valuation";
import { formatCurrency, formatNumber } from "@/lib/format";
import { AllocationPie } from "@/components/allocation-pie";
import { AssetClassBar } from "@/components/asset-class-bar";
import { ConcentrationMeter } from "@/components/concentration-meter";
import { ContributionList } from "@/components/contribution-list";
import { SectorBreakdown } from "@/components/sector-breakdown";
import { Card } from "@/components/card";
import { HoldingsTable } from "@/components/holdings-table";
import { AnimatedNumber } from "@/components/animated-number";
import { StockGrowthPane } from "@/components/stock-growth-pane";
import { CardSkeleton, PaneSkeleton, RowsSkeleton } from "@/components/skeletons";
import { CATEGORY_META, Investment, StockInvestment, isStock } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { investmentsToCsv } from "@/lib/csv";

export default function DashboardPage() {
  const { currency } = useCurrency();
  const qc = useQueryClient();
  const investmentsQ = useInvestments();
  const fxQ = useFx();
  const investments = investmentsQ.data?.investments ?? [];
  const symbols = symbolsOf(investments);
  const pricesQ = usePrices(symbols);

  const priceMap: PriceMap = {};
  for (const q of pricesQ.data?.quotes ?? []) {
    priceMap[q.symbol] = {
      price: q.price,
      currency: q.currency,
      previousClose: q.previousClose,
    };
  }
  const usdInr = fxQ.data?.usdInr ?? 83;
  const total = netWorth(investments, priceMap, usdInr, currency);
  const agg = aggregateByCategory(investments, priceMap, usdInr, currency);

  // Per-holding values in the display currency, for the treemap / concentration
  // meter / sector breakdown. Only fetch sector profiles when we actually hold
  // stocks, and skip it entirely for small portfolios where the extra widgets
  // wouldn't render anyway.
  const stockSymbols = investments.filter(isStock).map((s) => s.symbol);
  const showExtras = investments.length >= 6;
  const profilesQ = useProfiles(showExtras ? stockSymbols : []);
  const profileMap = Object.fromEntries(
    (profilesQ.data?.profiles ?? []).map((p) => [p.symbol, p]),
  );

  const holdingItems = investments.map((inv) => {
    const value = valueIn(inv, priceMap, usdInr, currency);
    const label = isStock(inv) ? inv.symbol : inv.label;
    const fullName = isStock(inv)
      ? priceMap[inv.symbol]
        ? undefined
        : inv.symbol
      : inv.label;
    return {
      key: inv.id,
      label,
      fullName,
      category: inv.category,
      value,
      symbol: isStock(inv) ? inv.symbol : null,
    };
  });

  const stockHoldingItems = holdingItems
    .filter((h) => h.symbol)
    .map((h) => ({ symbol: h.symbol as string, value: h.value }));

  // Contribution to return — today's P/L and all-time P/L per holding, in the
  // display currency. For cash buckets we only have all-time P/L when a
  // principal was set, and no intraday move.
  const contributionRows = investments.map((inv) => {
    const label = isStock(inv) ? inv.symbol : inv.label;
    let todayPL: number | null = null;
    let totalPL: number | null = null;
    if (isStock(inv)) {
      const q = priceMap[inv.symbol];
      if (q) {
        if (typeof q.previousClose === "number" && q.previousClose > 0) {
          const deltaNative = (q.price - q.previousClose) * inv.quantity;
          todayPL = deltaNative === 0
            ? 0
            : (deltaNative *
                (q.currency === currency
                  ? 1
                  : q.currency === "USD"
                  ? usdInr
                  : 1 / usdInr));
        }
        const totalNative = (q.price - inv.avgCost) * inv.quantity;
        totalPL =
          totalNative === 0
            ? 0
            : totalNative *
              (q.currency === currency
                ? 1
                : q.currency === "USD"
                ? usdInr
                : 1 / usdInr);
      }
    } else {
      const c = costIn(inv, usdInr, currency);
      const v = valueIn(inv, priceMap, usdInr, currency);
      if (c !== null) totalPL = v - c;
    }
    return { key: inv.id, label, todayPL, totalPL };
  });

  const totalCost = investments.reduce((s, inv) => {
    const c = costIn(inv, usdInr, currency);
    if (c !== null) return s + c;
    return s + valueIn(inv, priceMap, usdInr, currency);
  }, 0);
  const totalPL = total - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  const loading = investmentsQ.isLoading;
  const refreshing =
    pricesQ.isFetching || fxQ.isFetching || investmentsQ.isFetching;

  async function refreshAll() {
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["investments"] }),
        qc.invalidateQueries({ queryKey: ["quotes"] }),
        qc.invalidateQueries({ queryKey: ["fx"] }),
      ]);
      toast.success("Prices refreshed", { duration: 1500 });
    } catch {
      toast.error("Could not refresh", { duration: 2000 });
    }
  }

  function downloadCsv() {
    if (investments.length === 0) {
      toast.error("No investments to export");
      return;
    }
    const csv = investmentsToCsv(investments);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `investments-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV", { duration: 1500 });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">
            Live net worth across your portfolio, in {currency}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium">
            USD / INR{" "}
            <span className="font-semibold text-foreground">
              {formatNumber(usdInr, 3)}
            </span>
          </span>
          <button
            type="button"
            onClick={refreshAll}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
          >
            <RefreshCcw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={investments.length === 0}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-40"
            title="Download all investments as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : investments.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card delay={0}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Net Worth
                </span>
                <Wallet className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                <AnimatedNumber
                  value={total}
                  format={(v) => formatCurrency(v, currency)}
                />
              </div>
              <div className="mt-1 text-xs text-muted">
                {investments.length}{" "}
                {investments.length === 1 ? "holding" : "holdings"}
              </div>
            </Card>

            <Card delay={0.05}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Total P / L
                </span>
                <PieIcon className="h-4 w-4 text-emerald-400" />
              </div>
              <div
                className={cn(
                  "mt-2 text-3xl font-semibold tabular-nums",
                  totalPL >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {totalPL >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(totalPL), currency)}
              </div>
              <div className="mt-1 text-xs text-muted tabular-nums">
                {totalPLPct >= 0 ? "+" : ""}
                {totalPLPct.toFixed(2)}% overall
              </div>
            </Card>

            {agg
              .sort((a, b) => b.value - a.value)
              .slice(0, 2)
              .map((a, i) => (
                <Card key={a.category} delay={0.1 + i * 0.05}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted">
                      {CATEGORY_META[a.category].label}
                    </span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: CATEGORY_META[a.category].color }}
                    />
                  </div>
                  <div className="mt-2 text-3xl font-semibold tabular-nums">
                    {formatCurrency(a.value, currency)}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {total > 0 ? ((a.value / total) * 100).toFixed(1) : "0"}% of
                    portfolio
                  </div>
                </Card>
              ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card delay={0.15} className="lg:col-span-1">
              <div className="mb-2 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-indigo-400" />
                <h2 className="text-sm font-semibold">Allocation</h2>
              </div>
              <AllocationPie
                data={agg.map((a) => ({ category: a.category, value: a.value }))}
                currency={currency}
              />
              <div className="mt-2 space-y-1.5">
                {agg.map((a) => (
                  <div
                    key={a.category}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: CATEGORY_META[a.category].color }}
                      />
                      <span className="text-muted">
                        {CATEGORY_META[a.category].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="font-semibold">
                        {formatCurrency(a.value, currency)}
                      </span>
                      <span className="text-muted">
                        {total > 0
                          ? ((a.value / total) * 100).toFixed(1)
                          : "0"}
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Extra widgets — only render when the holdings table is tall
                  enough that the allocation column would otherwise look empty. */}
              {showExtras && (
                <div className="mt-4 space-y-3">
                  <AssetClassBar
                    data={agg.map((a) => ({
                      category: a.category,
                      value: a.value,
                    }))}
                    currency={currency}
                  />
                  <ContributionList
                    rows={contributionRows}
                    currency={currency}
                  />
                  <ConcentrationMeter
                    items={holdingItems.map((h) => ({
                      key: h.key,
                      label: h.label,
                      value: h.value,
                    }))}
                  />
                  {stockHoldingItems.length >= 4 && (
                    <SectorBreakdown
                      items={stockHoldingItems}
                      profiles={profileMap}
                      currency={currency}
                    />
                  )}
                </div>
              )}
            </Card>

            <div className="lg:col-span-2">
              <HoldingsTable
                investments={investments}
                prices={priceMap}
                usdInr={usdInr}
                display={currency}
              />
            </div>
          </div>

          <GrowthSection investments={investments} />
        </>
      )}
    </div>
  );
}

function GrowthSection({ investments }: { investments: Investment[] }) {
  const stocks = investments.filter(isStock) as StockInvestment[];
  if (stocks.length === 0) return null;
  const us = stocks.filter((s) => s.category === "US_STOCK");
  const ind = stocks.filter((s) => s.category === "INDIAN_STOCK");
  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground/90">
          Growth over time
        </h2>
        <span className="text-xs text-muted">
          · projected with your current quantities
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {us.length > 0 && (
          <StockGrowthPane
            title="US Stocks"
            subtitle={`${us.length} holding${us.length === 1 ? "" : "s"} · USD`}
            stocks={us}
            accent={CATEGORY_META.US_STOCK.color}
            benchmark={{ symbol: "SPY", label: "SPY" }}
          />
        )}
        {ind.length > 0 && (
          <StockGrowthPane
            title="Indian Stocks"
            subtitle={`${ind.length} holding${ind.length === 1 ? "" : "s"} · INR`}
            stocks={ind}
            accent={CATEGORY_META.INDIAN_STOCK.color}
            benchmark={{ symbol: "^NSEI", label: "Nifty 50" }}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative mx-auto max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-10 text-center shadow-xl"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.15),_transparent_60%)]" />
      <div className="relative">
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 shadow-lg shadow-indigo-500/30"
        >
          <Wallet className="h-6 w-6 text-white" />
        </motion.div>
        <h2 className="text-xl font-semibold">No investments yet</h2>
        <p className="mt-1 text-sm text-muted">
          Start tracking by adding your first holding — stocks, EPF or PPF.
        </p>
        <Link
          href="/add"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40"
        >
          Add Investment <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PaneSkeleton height="h-56" />
        <div className="lg:col-span-2">
          <RowsSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}
