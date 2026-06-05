"use client";

import { useMemo, useState } from "react";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GripVertical, Trash2 } from "lucide-react";
import { HistoryRange, useHistory } from "@/app/providers";
import { formatCurrency, formatCurrencySmart, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "3y", label: "3Y" },
  { value: "5y", label: "5Y" },
];

type Quote = {
  price: number;
  currency: "USD" | "INR";
  previousClose?: number;
  changePercent?: number;
  name?: string;
};

export type WatchlistCardItem = {
  id: string;
  symbol: string;
  name: string | null;
};

export function WatchlistCard({
  item,
  quote,
  accent = "#6366f1",
  delay = 0,
  draggable = false,
  dragging = false,
  isDropTarget = false,
  registerNode,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRemove,
}: {
  item: WatchlistCardItem;
  quote?: Quote;
  accent?: string;
  delay?: number;
  draggable?: boolean;
  dragging?: boolean;
  isDropTarget?: boolean;
  registerNode?: (id: string, node: HTMLElement | null) => void;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, point: { x: number; y: number }) => void;
  onDragEnd?: (id: string) => void;
  onRemove: () => void;
}) {
  const { symbol, name } = item;
  const controls = useDragControls();
  const [range, setRange] = useState<HistoryRange>("1d");
  const historyQ = useHistory([symbol], range);

  const currency =
    (historyQ.data?.series[0]?.currency as "USD" | "INR" | undefined) ??
    quote?.currency ??
    "USD";

  const chartData = useMemo(() => {
    const series = historyQ.data?.series?.[0];
    if (!series || series.points.length === 0) return [];
    const points = series.points.slice();
    // For the 1D view, reseed the baseline with the authoritative quote
    // previousClose so the intraday delta matches the live "today" change.
    if (range === "1d" && typeof quote?.previousClose === "number") {
      const gap =
        points.length > 1 ? points[1].t - points[0].t : Infinity;
      if (gap > 0 && gap <= 1000) {
        points[0] = { ...points[0], close: quote.previousClose };
      } else {
        points.unshift({ t: points[0].t - 1, close: quote.previousClose });
      }
    }
    return points.map((p) => ({ t: p.t, value: p.close }));
  }, [historyQ.data, range, quote?.previousClose]);

  const start = chartData[0]?.value ?? 0;
  // Prefer the live quote price as the endpoint so the card agrees with the
  // header price; fall back to the last historical close.
  const histEnd = chartData[chartData.length - 1]?.value ?? 0;
  const end = typeof quote?.price === "number" ? quote.price : histEnd;
  const delta = end - start;
  const deltaPct = start > 0 ? (delta / start) * 100 : 0;
  const up = delta >= 0;
  const lineColor = up ? "#10b981" : "#f43f5e";

  // Today's change (independent of selected range).
  let todayPct: number | null = null;
  if (quote && typeof quote.previousClose === "number" && quote.previousClose > 0) {
    todayPct = ((quote.price - quote.previousClose) / quote.previousClose) * 100;
  } else if (typeof quote?.changePercent === "number") {
    todayPct = quote.changePercent;
  }

  const gradId = `wl-grad-${symbol.replace(/[^a-z0-9]/gi, "")}-${up ? "up" : "dn"}`;

  return (
    <motion.div
      ref={(node) => registerNode?.(item.id, node)}
      layout={dragging ? false : "position"}
      drag={draggable}
      dragListener={false}
      dragControls={controls}
      dragSnapToOrigin
      dragElastic={0}
      dragMomentum={false}
      onDragStart={() => onDragStart?.(item.id)}
      onDrag={(_, info: PanInfo) =>
        onDragMove?.(item.id, { x: info.point.x, y: info.point.y })
      }
      onDragEnd={() => onDragEnd?.(item.id)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        opacity: { duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] },
        layout: { type: "spring", stiffness: 600, damping: 45 },
      }}
      whileDrag={{
        scale: 1.03,
        cursor: "grabbing",
        boxShadow:
          "0 24px 50px -12px rgba(99, 102, 241, 0.5), 0 0 0 1px rgba(255,255,255,0.1)",
      }}
      style={{ zIndex: dragging ? 50 : 1, position: "relative" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-xl shadow-black/20 backdrop-blur transition-colors",
        isDropTarget
          ? "border-indigo-400/60 ring-2 ring-indigo-400/40"
          : "border-white/5 hover:border-white/10",
        dragging && "select-none",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(ellipse at top left, ${accent}14, transparent 55%)`,
        }}
      />
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-2">
            {draggable && (
              <button
                type="button"
                onPointerDown={(e) => controls.start(e)}
                aria-label="Drag to reorder"
                className="-ml-1 mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-white/5 hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-lg font-semibold tracking-tight">
                  {symbol}
                </h3>
                {todayPct !== null && (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                      todayPct >= 0
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-rose-500/10 text-rose-400",
                    )}
                  >
                    {todayPct >= 0 ? "+" : ""}
                    {todayPct.toFixed(2)}% today
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">
                {name ?? quote?.name ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="amount text-xl font-semibold tabular-nums">
                {quote ? formatCurrencySmart(quote.price, currency) : "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${symbol}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Range tabs */}
        <div className="mt-3 flex flex-wrap gap-1 px-5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition",
                range === r.value
                  ? "bg-white/10 text-foreground"
                  : "text-muted hover:bg-white/5 hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Range delta */}
        <div className="mt-3 flex items-end justify-between gap-3 px-5">
          <div className="text-[11px] uppercase tracking-wider text-muted">
            Change over {range.toUpperCase()}
          </div>
          <div
            className={cn(
              "text-right text-xs font-semibold tabular-nums",
              up ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {up ? "+" : "−"}
            {formatCurrency(Math.abs(delta), currency)}
            <span className="ml-1 text-muted">
              ({deltaPct >= 0 ? "+" : ""}
              {formatNumber(deltaPct, 2)}%)
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-2 h-[200px] w-full px-2 pb-4">
          {historyQ.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading chart…
            </div>
          ) : chartData.length < 2 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No history available for this range.
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={0}
              initialDimension={{ width: 1, height: 1 }}
            >
              <AreaChart
                data={chartData}
                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="t"
                  type="category"
                  tickFormatter={(t) => fmtTick(Number(t), range)}
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  interval="preserveStartEnd"
                />
                <YAxis
                  dataKey="value"
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v) => compactCurrency(Number(v), currency)}
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
                  labelFormatter={(t) => fmtTooltipLabel(Number(t), range)}
                  formatter={(v) => [formatCurrency(Number(v), currency), symbol]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  isAnimationActive
                  animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
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
  if (range === "3y" || range === "5y") {
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
