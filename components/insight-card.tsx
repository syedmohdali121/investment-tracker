"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { Insight } from "@/lib/insights";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

const ICON = {
  positive: TrendingUp,
  negative: TrendingDown,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE = {
  positive: "border-emerald-400/30 bg-emerald-400/[0.04]",
  negative: "border-rose-400/30 bg-rose-400/[0.04]",
  warning: "border-amber-400/30 bg-amber-400/[0.04]",
  info: "border-white/10 bg-white/[0.03]",
} as const;

const ACCENT = {
  positive: "text-emerald-300",
  negative: "text-rose-300",
  warning: "text-amber-300",
  info: "text-sky-300",
} as const;

export function InsightCard({
  insight,
  index,
}: {
  insight: Insight;
  index: number;
}) {
  const Icon = ICON[insight.severity] ?? Sparkles;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className={cn(
        "rounded-2xl border p-5 shadow-xl",
        "bg-gradient-to-br from-white/[0.04] to-white/[0.01]",
        TONE[insight.severity],
      )}
    >
      <div className={cn("flex items-center gap-2", ACCENT[insight.severity])}>
        <Icon className="h-4 w-4" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {insight.section}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-foreground">
        {insight.title}
      </h3>
      {insight.value && (
        <div
          className={cn(
            "mt-2 text-2xl font-semibold tabular-nums",
            ACCENT[insight.severity],
          )}
        >
          {renderValue(insight.value)}
        </div>
      )}
      <p className="mt-2 text-sm leading-relaxed text-muted">{insight.body}</p>
    </motion.div>
  );
}

function renderValue(v: NonNullable<Insight["value"]>): string {
  if (v.format === "currency" && v.currency)
    return formatCurrency(v.amount, v.currency);
  if (v.format === "percent")
    return `${v.amount >= 0 ? "+" : ""}${formatNumber(v.amount, 2)}${v.suffix ?? "%"}`;
  return `${formatNumber(v.amount, 0)}${v.suffix ?? ""}`;
}
