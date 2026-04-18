"use client";

import { CATEGORY_META, type Category, type Currency } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

/**
 * Horizontal stacked bar showing the asset-class split. Same data as the
 * donut, but much more compact — useful as a secondary glance inside the
 * allocation card.
 */
export function AssetClassBar({
  data,
  currency,
}: {
  data: Array<{ category: Category; value: number }>;
  currency: Currency;
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  if (total <= 0) return null;

  const rows = data
    .filter((d) => d.value > 0)
    .map((d) => ({
      category: d.category,
      value: d.value,
      pct: (d.value / total) * 100,
      color: CATEGORY_META[d.category].color,
      label: CATEGORY_META[d.category].label,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Asset mix
        </span>
        <span className="text-[11px] text-muted">
          {rows.length} {rows.length === 1 ? "class" : "classes"}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
        {rows.map((r) => (
          <div
            key={r.category}
            title={`${r.label} · ${formatCurrency(r.value, currency)} (${r.pct.toFixed(1)}%)`}
            className="h-full transition-all"
            style={{
              width: `${r.pct}%`,
              background: r.color,
              opacity: 0.85,
            }}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.category} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: r.color }}
            />
            <span className="truncate text-muted">{r.label}</span>
            <span className="ml-auto tabular-nums font-semibold">
              {r.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
