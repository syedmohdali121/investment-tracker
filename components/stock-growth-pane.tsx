"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, LineChart as LineIcon } from "lucide-react";
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
}: {
  title: string;
  subtitle?: string;
  stocks: StockInvestment[];
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1y");
  const [selected, setSelected] = useState<string>("__all__");

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

  const currency =
    (historyQ.data?.series[0]?.currency as "USD" | "INR" | undefined) ??
    stocks[0]?.currency ??
    "USD";

  const { chartData, combinedStart, combinedEnd } = useMemo(() => {
    const series = historyQ.data?.series ?? [];
    if (series.length === 0)
      return { chartData: [], combinedStart: 0, combinedEnd: 0 };

    if (selected !== "__all__") {
      const s = series.find((x) => x.symbol === selected);
      if (!s) return { chartData: [], combinedStart: 0, combinedEnd: 0 };
      const qty = qtyBySymbol.get(selected) ?? 0;
      const data = s.points.map((p) => ({ t: p.t, value: p.close * qty }));
      return {
        chartData: data,
        combinedStart: data[0]?.value ?? 0,
        combinedEnd: data[data.length - 1]?.value ?? 0,
      };
    }

    // Combined: index by timestamp, sum symbols that have data for that timestamp.
    const byTime = new Map<number, number>();
    for (const s of series) {
      const qty = qtyBySymbol.get(s.symbol) ?? 0;
      for (const p of s.points) {
        byTime.set(p.t, (byTime.get(p.t) ?? 0) + p.close * qty);
      }
    }
    const data = Array.from(byTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, value]) => ({ t, value }));
    return {
      chartData: data,
      combinedStart: data[0]?.value ?? 0,
      combinedEnd: data[data.length - 1]?.value ?? 0,
    };
  }, [historyQ.data, selected, qtyBySymbol]);

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

            <div className="px-5 pb-5 pt-3">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted">
                    {selected === "__all__" ? "Combined value" : "Holding value"}{" "}
                    · projected with current quantity
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatCurrency(combinedEnd, currency)}
                  </div>
                </div>
                <div
                  className={cn(
                    "text-right text-xs font-semibold tabular-nums",
                    delta >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {delta >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(delta), currency)}
                  <div className="text-muted">
                    {deltaPct >= 0 ? "+" : ""}
                    {formatNumber(deltaPct, 2)}% over {range.toUpperCase()}
                  </div>
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
