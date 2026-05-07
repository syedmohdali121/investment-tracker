"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown } from "lucide-react";
import { HistoryPoint } from "@/lib/market";
import { formatNumber } from "@/lib/format";
import { maxDrawdown } from "@/lib/analytics";

/**
 * Draws a drawdown chart: y = (value / runningPeak) - 1, expressed as %.
 * Values are always ≤ 0.
 */
export function DrawdownChart({
  points,
  title = "Portfolio drawdown",
  subtitle,
}: {
  points: HistoryPoint[];
  title?: string;
  subtitle?: string;
}) {
  const { data, worst } = useMemo(() => {
    if (points.length < 2) return { data: [], worst: null };
    let peak = -Infinity;
    const out: Array<{ t: number; dd: number }> = [];
    for (const p of points) {
      if (p.close > peak) peak = p.close;
      const dd = peak > 0 ? (p.close / peak - 1) * 100 : 0;
      out.push({ t: p.t, dd });
    }
    const w = maxDrawdown(points);
    return { data: out, worst: w };
  }, [points]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
            <TrendingDown className="h-3.5 w-3.5" />
            Drawdown
          </div>
          <h3 className="mt-1 text-base font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {worst && worst.pct < 0 && (
          <div className="text-right">
            <div className="text-xs text-muted">Worst</div>
            <div className="text-lg font-semibold tabular-nums text-rose-300">
              {formatNumber(worst.pct * 100, 1)}%
            </div>
          </div>
        )}
      </div>
      <div className="h-[220px] w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Not enough history.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart
              data={data}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.45} />
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
                tickFormatter={(t) =>
                  new Date(t as number).toLocaleDateString(undefined, {
                    month: "short",
                    year: "2-digit",
                  })
                }
                stroke="rgba(255,255,255,0.3)"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={50}
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v) => `${formatNumber(Number(v), 0)}%`}
                domain={["dataMin", 0]}
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
                  new Date(t as number).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                }
                formatter={(v) => [`${formatNumber(Number(v), 2)}%`, "Drawdown"]}
              />
              <Area
                type="monotone"
                dataKey="dd"
                stroke="#f43f5e"
                strokeWidth={1.5}
                fill="url(#dd-fill)"
                isAnimationActive
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
