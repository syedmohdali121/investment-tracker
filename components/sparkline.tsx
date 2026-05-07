"use client";

import { useId } from "react";
import { formatCurrencySmart } from "@/lib/format";
import type { Currency } from "@/lib/types";

type Pt = { t: number; close: number };

export function Sparkline({
  points,
  prevClose,
  prevCloseCurrency,
  width = 96,
  height = 28,
  stale = false,
  sessionStart,
  sessionEnd,
}: {
  points: Pt[];
  prevClose: number | null;
  prevCloseCurrency?: Currency;
  width?: number;
  height?: number;
  stale?: boolean;
  /** Session window in ms — when provided, x is mapped by time so an
   *  in-progress session leaves empty space on the right. */
  sessionStart?: number | null;
  sessionEnd?: number | null;
}) {
  // Stable, unique gradient id — derived from React's useId so it survives
  // re-renders without colliding across multiple Sparkline instances on the
  // same page. Hooks must run unconditionally, so this is called above the
  // empty-state early return below.
  const reactId = useId();
  const fillId = `spark-${reactId.replace(/[:]/g, "")}`;

  if (!points || points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted"
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const values = points.map((p) => p.close);
  const baseline =
    typeof prevClose === "number" ? prevClose : values[0];
  const last = values[values.length - 1];
  const up = last >= baseline;
  const stroke = up ? "#10b981" : "#f43f5e";

  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const range = max - min || 1;
  const pad = 2;
  const w = width;
  const h = height;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // When a session window is supplied, map each point's x to its fraction of
  // the session so an in-progress day leaves blank space to the right.
  const useTime =
    typeof sessionStart === "number" &&
    typeof sessionEnd === "number" &&
    sessionEnd > sessionStart;
  const xs = useTime
    ? points.map((p) => {
        const frac = Math.max(
          0,
          Math.min(1, (p.t - sessionStart!) / (sessionEnd! - sessionStart!)),
        );
        return pad + frac * innerW;
      })
    : points.map((_, i) => pad + (i / (points.length - 1)) * innerW);
  const ys = values.map(
    (v) => pad + innerH - ((v - min) / range) * innerH,
  );
  const baselineY =
    pad + innerH - ((baseline - min) / range) * innerH;

  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${ys[i].toFixed(2)}`).join(" ");
  const area = `${d} L${xs[xs.length - 1].toFixed(2)},${(h - pad).toFixed(2)} L${xs[0].toFixed(2)},${(h - pad).toFixed(2)} Z`;

  const prevLabel =
    typeof prevClose === "number" && prevCloseCurrency
      ? formatCurrencySmart(prevClose, prevCloseCurrency)
      : null;
  // Place label above baseline if there's room, else below — keeps it from
  // colliding with the chart line in tall/short bands.
  const labelAbove = baselineY > h / 2;
  const labelY = labelAbove ? baselineY - 2 : baselineY + 8;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={stale ? "opacity-60" : undefined}
      aria-hidden
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line
        x1={pad}
        x2={w - pad}
        y1={baselineY}
        y2={baselineY}
        stroke="rgba(255,255,255,0.12)"
        strokeDasharray="2 3"
        strokeWidth={1}
      />
      <path d={area} fill={`url(#${fillId})`} />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={1.8} fill={stroke} />
      {prevLabel && (
        <text
          x={w - pad}
          y={labelY}
          textAnchor="end"
          fontSize={8}
          fill="rgba(255,255,255,0.55)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {prevLabel}
        </text>
      )}
    </svg>
  );
}
