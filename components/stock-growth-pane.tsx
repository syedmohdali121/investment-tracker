"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  Area,
  AreaChart,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, LineChart as LineIcon, Scale } from "lucide-react";
import { HistoryRange, useHistory } from "@/app/providers";
import { StockInvestment } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1y", label: "1Y" },
  { value: "3y", label: "3Y" },
  { value: "5y", label: "5Y" },
];

export function StockGrowthPane({
  title,
  subtitle,
  stocks,
  accent,
  benchmark,
}: {
  title: string;
  subtitle?: string;
  stocks: StockInvestment[];
  accent: string;
  /** Optional benchmark ticker, e.g. "SPY" or "^NSEI". */
  benchmark?: { symbol: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1y");
  const [selected, setSelected] = useState<string>("__all__");
  const [compare, setCompare] = useState(false);

  const symbols = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.symbol))),
    [stocks],
  );
  const qtyBySymbol = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stocks) {
      m.set(s.symbol, (m.get(s.symbol) ?? 0) + s.quantity);
    }
    return m;
  }, [stocks]);

  const historyQ = useHistory(open ? symbols : [], range);
  const benchQ = useHistory(
    open && compare && benchmark ? [benchmark.symbol] : [],
    range,
  );

  const currency =
    (historyQ.data?.series[0]?.currency as "USD" | "INR" | undefined) ??
    stocks[0]?.currency ??
    "USD";

  const { chartData, combinedStart, combinedEnd, benchStart, benchEnd } =
    useMemo(() => {
      const series = historyQ.data?.series ?? [];
      if (series.length === 0)
        return {
          chartData: [],
          combinedStart: 0,
          combinedEnd: 0,
          benchStart: 0,
          benchEnd: 0,
        };

      // Step 1: build portfolio series (value over time) as before.
      let portfolio: { t: number; value: number }[] = [];
      if (selected !== "__all__") {
        const s = series.find((x) => x.symbol === selected);
        const qty = qtyBySymbol.get(selected) ?? 0;
        if (s) portfolio = s.points.map((p) => ({ t: p.t, value: p.close * qty }));
      } else {
        // Build the union of timestamps across all symbols, then forward-fill
        // each symbol along that timeline. Without the fill, if one symbol has
        // a bar at a timestamp the others don't (e.g. 5m bars ending at
        // slightly different minutes per ticker, or different trading hours),
        // the missing symbols contribute 0 at that tick and the combined
        // value cliff-dives. Forward-fill gives each symbol its most recent
        // known price at every tick instead.
        const union = new Set<number>();
        for (const s of series) for (const p of s.points) union.add(p.t);
        const times = Array.from(union).sort((a, b) => a - b);

        const filled: Array<{ t: number; value: number }> = times.map((t) => ({
          t,
          value: 0,
        }));
        for (const s of series) {
          const qty = qtyBySymbol.get(s.symbol) ?? 0;
          if (qty === 0 || s.points.length === 0) continue;
          const pts = s.points;
          let i = 0;
          let lastClose: number | null = null;
          for (let k = 0; k < times.length; k++) {
            const t = times[k];
            while (i < pts.length && pts[i].t <= t) {
              lastClose = pts[i].close;
              i++;
            }
            // Only start contributing once this symbol has seen its first
            // bar — otherwise early ticks would miss this symbol entirely.
            if (lastClose !== null) filled[k].value += lastClose * qty;
          }
        }
        // Drop the leading ticks where not every symbol has started yet, so
        // the combined line begins only when all holdings have a price.
        const firstCompleteIdx = times.findIndex((t) => {
          for (const s of series) {
            if ((qtyBySymbol.get(s.symbol) ?? 0) === 0) continue;
            if (s.points.length === 0) continue;
            if (s.points[0].t > t) return false;
          }
          return true;
        });
        portfolio =
          firstCompleteIdx >= 0 ? filled.slice(firstCompleteIdx) : filled;
      }

      const cStart = portfolio[0]?.value ?? 0;
      const cEnd = portfolio[portfolio.length - 1]?.value ?? 0;

      // Step 2: if not comparing, return raw value series for the area chart.
      if (!compare || !benchmark) {
        return {
          chartData: portfolio,
          combinedStart: cStart,
          combinedEnd: cEnd,
          benchStart: 0,
          benchEnd: 0,
        };
      }

      // Step 3: comparing — normalize both to 100 and merge on timestamp.
      const bench = benchQ.data?.series[0];
      if (!bench || bench.points.length === 0 || portfolio.length === 0) {
        return {
          chartData: portfolio.map((p) => ({
            t: p.t,
            value: p.value,
            benchValue: null as number | null,
          })),
          combinedStart: cStart,
          combinedEnd: cEnd,
          benchStart: 0,
          benchEnd: 0,
        };
      }

      const pBase = portfolio[0].value || 1;
      const bBase = bench.points[0].close || 1;
      const portfolioNorm = portfolio.map((p) => ({
        t: p.t,
        value: (p.value / pBase) * 100,
      }));
      const benchNorm = new Map<number, number>();
      for (const p of bench.points) benchNorm.set(p.t, (p.close / bBase) * 100);

      // Forward-fill benchmark onto portfolio timeline.
      const benchTimes = Array.from(benchNorm.keys()).sort((a, b) => a - b);
      let bi = 0;
      let lastBench = benchNorm.get(benchTimes[0]) ?? 100;
      const merged = portfolioNorm.map((p) => {
        while (bi < benchTimes.length && benchTimes[bi] <= p.t) {
          lastBench = benchNorm.get(benchTimes[bi]) ?? lastBench;
          bi++;
        }
        return { t: p.t, value: p.value, benchValue: lastBench };
      });

      return {
        chartData: merged,
        combinedStart: cStart,
        combinedEnd: cEnd,
        benchStart: 100,
        benchEnd: merged[merged.length - 1]?.benchValue ?? 100,
      };
    }, [historyQ.data, benchQ.data, selected, qtyBySymbol, compare, benchmark]);

  const delta = combinedEnd - combinedStart;
  const deltaPct =
    combinedStart > 0 ? (delta / combinedStart) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-xl"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg"
            style={{ background: accent, boxShadow: `0 8px 24px -10px ${accent}` }}
          >
            <LineIcon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">{title}</div>
            {subtitle && (
              <div className="text-xs text-muted">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-muted sm:block">
            {stocks.length} holding{stocks.length === 1 ? "" : "s"}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-muted"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-white/5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
              <div className="flex flex-wrap items-center gap-1">
                <TabButton
                  active={selected === "__all__"}
                  onClick={() => setSelected("__all__")}
                  accent={accent}
                >
                  Combined
                </TabButton>
                {symbols.map((s) => (
                  <TabButton
                    key={s}
                    active={selected === s}
                    onClick={() => setSelected(s)}
                    accent={accent}
                  >
                    {s}
                  </TabButton>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {benchmark && (
                  <button
                    type="button"
                    onClick={() => setCompare((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                      compare
                        ? "border-white/20 bg-white/10 text-foreground"
                        : "border-white/10 bg-white/[0.03] text-muted hover:text-foreground",
                    )}
                    title={`Overlay ${benchmark.label}`}
                  >
                    <Scale className="h-3 w-3" />
                    vs {benchmark.label}
                  </button>
                )}
                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
                  {RANGES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRange(r.value)}
                      className={cn(
                        "rounded-md px-2.5 py-1 font-semibold transition",
                        range === r.value
                          ? "bg-white/10 text-foreground"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-3">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted">
                    {compare
                      ? `Normalized · base 100`
                      : selected === "__all__"
                        ? "Combined value · projected with current quantity"
                        : "Holding value · projected with current quantity"}
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {compare
                      ? `${formatNumber((combinedEnd / (combinedStart || 1)) * 100, 1)}`
                      : formatCurrency(combinedEnd, currency)}
                  </div>
                </div>
                <div
                  className={cn(
                    "text-right text-xs font-semibold tabular-nums",
                    deltaPct >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {compare ? (
                    <>
                      You {deltaPct >= 0 ? "+" : ""}
                      {formatNumber(deltaPct, 2)}%
                      {benchmark && benchQ.data?.series[0] && (
                        <div className="text-muted">
                          {benchmark.label}{" "}
                          {benchEnd - 100 >= 0 ? "+" : ""}
                          {formatNumber(benchEnd - 100, 2)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {delta >= 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(delta), currency)}
                      <div className="text-muted">
                        {deltaPct >= 0 ? "+" : ""}
                        {formatNumber(deltaPct, 2)}% over {range.toUpperCase()}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="h-[260px] w-full">
                {historyQ.isLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted">
                    Loading history…
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted">
                    No history available for this range.
                  </div>
                ) : compare && benchmark ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) => fmtTick(t, range)}
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={(v) => formatNumber(Number(v), 0)}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                        contentStyle={{
                          background: "rgba(15,15,20,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 10,
                          color: "white",
                          fontSize: 12,
                        }}
                        labelFormatter={(t) =>
                          fmtTooltipLabel(t as number, range)
                        }
                        formatter={(v, name) => [
                          `${formatNumber(Number(v), 2)}`,
                          name === "benchValue"
                            ? benchmark.label
                            : selected === "__all__"
                              ? "Portfolio"
                              : selected,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={accent}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive
                        animationDuration={500}
                      />
                      <Line
                        type="monotone"
                        dataKey="benchValue"
                        stroke="#9ca3af"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive
                        animationDuration={500}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id={`grad-${title.replace(/\s+/g, "-")}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) => fmtTick(t, range)}
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        dataKey="value"
                        stroke="rgba(255,255,255,0.3)"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        tickFormatter={(v) =>
                          compactCurrency(v as number, currency)
                        }
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                        contentStyle={{
                          background: "rgba(15,15,20,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 10,
                          color: "white",
                          fontSize: 12,
                        }}
                        labelFormatter={(t) => fmtTooltipLabel(t as number, range)}
                        formatter={(v) => [
                          formatCurrency(Number(v), currency),
                          selected === "__all__" ? "Combined" : selected,
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={accent}
                        strokeWidth={2}
                        fill={`url(#grad-${title.replace(/\s+/g, "-")})`}
                        isAnimationActive
                        animationDuration={500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Projection assumes you held your{" "}
                <span className="font-medium text-foreground/80">current</span>{" "}
                quantity throughout the period.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-semibold transition",
        active
          ? "text-white"
          : "text-muted hover:bg-white/5 hover:text-foreground",
      )}
      style={
        active
          ? {
              background: accent,
              boxShadow: `0 6px 20px -8px ${accent}`,
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function fmtTick(t: number, range: HistoryRange): string {
  const d = new Date(t);
  if (range === "1d") {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (range === "5d") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (range === "1y") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function fmtTooltipLabel(t: number, range: HistoryRange): string {
  const d = new Date(t);
  if (range === "1d" || range === "5d") {
    return d.toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function compactCurrency(v: number, currency: "USD" | "INR"): string {
  if (!Number.isFinite(v)) return "";
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}
