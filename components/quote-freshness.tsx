"use client";

/**
 * Live "data freshness" pill for the dashboard. Shows how long ago the quote
 * payload was last fetched, color-coded by staleness, and exposes a manual
 * refresh button. Re-renders on a 15s ticker so the relative timestamp stays
 * honest without relying on parent re-renders.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/cn";

export function QuoteFreshness({
  lastUpdatedAt,
  isFetching,
  isError,
  onRefresh,
  /** Staleness threshold in ms above which we flip to amber. */
  warnAfterMs = 60_000,
  /** Staleness threshold in ms above which we flip to red. */
  staleAfterMs = 5 * 60_000,
}: {
  lastUpdatedAt: number | undefined;
  isFetching: boolean;
  isError: boolean;
  onRefresh: () => void;
  warnAfterMs?: number;
  staleAfterMs?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const ageMs =
    lastUpdatedAt && lastUpdatedAt > 0 ? Math.max(0, now - lastUpdatedAt) : null;

  let tone: "live" | "fresh" | "warn" | "stale" | "error" = "fresh";
  if (isError) tone = "error";
  else if (isFetching) tone = "live";
  else if (ageMs === null) tone = "warn";
  else if (ageMs >= staleAfterMs) tone = "stale";
  else if (ageMs >= warnAfterMs) tone = "warn";

  const label = isError
    ? "Quotes failed"
    : isFetching
      ? "Refreshing…"
      : ageMs === null
        ? "Not loaded"
        : `Updated ${formatRelative(ageMs)}`;

  const dotClass = {
    live: "bg-indigo-400 animate-pulse",
    fresh: "bg-emerald-400",
    warn: "bg-amber-400",
    stale: "bg-rose-400",
    error: "bg-rose-500",
  }[tone];

  const borderClass = {
    live: "border-indigo-400/30",
    fresh: "border-white/10",
    warn: "border-amber-400/30",
    stale: "border-rose-400/30",
    error: "border-rose-500/40",
  }[tone];

  const titleAbs = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString()
    : "No data yet";

  return (
    <button
      type="button"
      onClick={onRefresh}
      title={`${titleAbs} — click to refresh`}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-white/5 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground",
        borderClass,
      )}
    >
      {tone === "error" ? (
        <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
      ) : (
        <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden />
      )}
      <span className="tabular-nums">{label}</span>
      <RefreshCcw
        className={cn(
          "h-3.5 w-3.5 opacity-70",
          isFetching && "animate-spin opacity-100",
        )}
      />
    </button>
  );
}

function formatRelative(ageMs: number): string {
  const s = Math.round(ageMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
