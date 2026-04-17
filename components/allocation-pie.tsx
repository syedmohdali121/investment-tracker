"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORY_META, Category, Currency } from "@/lib/types";
import { formatCurrency } from "@/lib/format";

export function AllocationPie({
  data,
  currency,
}: {
  data: Array<{ category: Category; value: number }>;
  currency: Currency;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted">
        No allocation to display.
      </div>
    );
  }
  const chartData = data.map((d) => ({
    name: CATEGORY_META[d.category].label,
    category: d.category,
    value: d.value,
    fill: CATEGORY_META[d.category].color,
    pct: (d.value / total) * 100,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={2}
            stroke="none"
            isAnimationActive
            animationDuration={800}
          >
            {chartData.map((entry) => (
              <Cell key={entry.category} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "rgba(15,15,20,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              color: "white",
              fontSize: 12,
            }}
            formatter={(value, _name, props) => {
              const v = typeof value === "number" ? value : Number(value) || 0;
              const payload = (props as { payload?: { pct?: number; name?: string } }).payload ?? {};
              const pct = typeof payload.pct === "number" ? payload.pct : 0;
              const label = payload.name ?? "";
              return [`${formatCurrency(v, currency)} (${pct.toFixed(1)}%)`, label];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
