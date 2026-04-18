"use client";

import { useMemo } from "react";
import { Target } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Concentration meter. Shows the Herfindahl-Hirschman Index (HHI) of the
 * portfolio, the top holding's weight, and a color band so you can tell at a
 * glance how diversified things are.
 *
 * HHI is the sum of squared weights (as fractions, then ×10,000 by convention).
 * Rules of thumb (common in portfolio analysis):
 *   <1500  = well diversified
 *   1500–2500 = moderately concentrated
 *   >2500  = highly concentrated
 */
export function ConcentrationMeter({
  items,
}: {
  items: Array<{ key: string; label: string; value: number }>;
}) {
  const { hhi, top, band, effectiveN, total } = useMemo(() => {
    const totalVal = items.reduce((s, i) => s + Math.max(0, i.value), 0);
    if (totalVal <= 0 || items.length === 0) {
      return {
        hhi: 0,
        top: null as { label: string; pct: number } | null,
        band: "info" as const,
        effectiveN: 0,
        total: 0,
      };
    }
    let hhiSum = 0;
    let topItem = items[0];
    for (const it of items) {
      const w = it.value / totalVal;
      hhiSum += w * w;
      if (it.value > topItem.value) topItem = it;
    }
    const hhiScaled = Math.round(hhiSum * 10_000);
    const bandKind: "good" | "warn" | "bad" =
      hhiScaled < 1500 ? "good" : hhiScaled < 2500 ? "warn" : "bad";
    return {
      hhi: hhiScaled,
      top: {
        label: topItem.label,
        pct: (topItem.value / totalVal) * 100,
      },
      band: bandKind,
      effectiveN: hhiSum > 0 ? 1 / hhiSum : 0,
      total: totalVal,
    };
  }, [items]);

  if (total <= 0) return null;

  // 0 → fully diversified, 1 → all in one holding. Clamp for the bar.
  const progress = Math.min(1, Math.max(0, hhi / 10_000));

  const tone =
    band === "good"
      ? "text-emerald-300"
      : band === "warn"
      ? "text-amber-300"
      : "text-rose-300";
  const barColor =
    band === "good"
      ? "bg-emerald-400/70"
      : band === "warn"
      ? "bg-amber-400/70"
      : "bg-rose-400/70";
  const label =
    band === "good"
      ? "Well diversified"
      : band === "warn"
      ? "Moderately concentrated"
      : "Highly concentrated";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className={cn("h-3.5 w-3.5", tone)} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Concentration
          </span>
        </div>
        <span className={cn("text-xs font-semibold", tone)}>{label}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-muted">HHI</div>
          <div className="font-semibold tabular-nums">
            {formatNumber(hhi, 0)}
          </div>
        </div>
        <div>
          <div className="text-muted">Top holding</div>
          <div className="font-semibold tabular-nums">
            {top ? `${top.label} · ${top.pct.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted">Effective N</div>
          <div className="font-semibold tabular-nums">
            {formatNumber(effectiveN, 1)}
          </div>
        </div>
      </div>
    </div>
  );
}
