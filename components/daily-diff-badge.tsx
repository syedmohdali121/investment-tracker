"use client";

/**
 * "What changed today" banner — shown once per local day on the first dashboard
 * load after the date has rolled over. Compares the live portfolio against a
 * snapshot persisted to localStorage. The component owns the side-effect of
 * writing the new snapshot, so the banner self-clears for the rest of the day.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Sparkles, X } from "lucide-react";

import type { Currency } from "@/lib/types";
import {
  diffAgainstSnapshot,
  readSnapshot,
  todayLocal,
  writeSnapshot,
  type DailyDiff,
  type HoldingSnapshotEntry,
} from "@/lib/daily-snapshot";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

type CurrentUser = { id: string; name: string; color: string };

async function fetchMe(): Promise<CurrentUser | null> {
  const res = await fetch("/api/users/me", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { user: CurrentUser | null };
  return data.user;
}

export function DailyDiffBadge({
  total,
  currency,
  perHolding,
  ready,
}: {
  total: number;
  currency: Currency;
  perHolding: Record<string, HoldingSnapshotEntry>;
  /** Set to true once investments + prices have settled. */
  ready: boolean;
}) {
  const { data: user } = useQuery({
    queryKey: ["users", "me"],
    queryFn: fetchMe,
    staleTime: 30_000,
  });

  const [diff, setDiff] = useState<DailyDiff | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Once we've evaluated the snapshot for this mount we won't re-evaluate;
  // otherwise React strict-mode double-mounts or query refetches could
  // re-show the banner after the user dismissed it.
  const [evaluated, setEvaluated] = useState(false);

  useEffect(() => {
    if (!ready || evaluated) return;
    if (Object.keys(perHolding).length === 0) return;

    const userId = user?.id ?? null;
    const date = todayLocal();
    const current = { date, currency, total, perHolding };
    const prev = readSnapshot(userId);
    if (prev) {
      const computed = diffAgainstSnapshot(prev, current);
      if (computed) setDiff(computed);
    }
    // Write the fresh snapshot immediately so subsequent reloads today don't
    // re-trigger the banner — and so tomorrow's diff starts from today's
    // post-open numbers.
    writeSnapshot(userId, current);
    setEvaluated(true);
  }, [ready, evaluated, user?.id, currency, total, perHolding]);

  if (!diff || dismissed) return null;

  const positive = diff.totalDelta >= 0;
  const sign = positive ? "+" : "−";
  const absDelta = Math.abs(diff.totalDelta);
  const absPct = Math.abs(diff.totalPct);

  return (
    <AnimatePresence>
      <motion.div
        key="daily-diff"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-sm",
          positive
            ? "border-emerald-400/20 bg-emerald-400/5"
            : "border-rose-400/20 bg-rose-400/5",
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles
            className={cn(
              "h-4 w-4",
              positive ? "text-emerald-300" : "text-rose-300",
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Since {formatRelativeDay(diff.fromDate)}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "amount text-base font-semibold tabular-nums",
              positive ? "text-emerald-300" : "text-rose-300",
            )}
            title={`${sign}${formatCurrency(absDelta, currency)}`}
          >
            {sign}
            {formatCurrency(absDelta, currency)}
          </span>
          <span className="text-xs text-muted tabular-nums">
            ({sign}
            {absPct.toFixed(2)}%)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {diff.topGainer && (
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" />
              <span className="font-medium text-foreground/90">
                {diff.topGainer.label}
              </span>
              <span className="amount tabular-nums text-emerald-300">
                +{formatCurrency(Math.abs(diff.topGainer.delta), currency)}
              </span>
            </span>
          )}
          {diff.topLoser && (
            <span className="inline-flex items-center gap-1">
              <ArrowDownRight className="h-3.5 w-3.5 text-rose-300" />
              <span className="font-medium text-foreground/90">
                {diff.topLoser.label}
              </span>
              <span className="amount tabular-nums text-rose-300">
                −{formatCurrency(Math.abs(diff.topLoser.delta), currency)}
              </span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * "yesterday" / "Friday" / "Apr 12" — keeps the banner copy short while still
 * giving the user a sense of how stale the comparison is.
 */
function formatRelativeDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const then = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - then.getTime()) / 86_400_000,
  );
  if (diffDays <= 1) return "yesterday";
  if (diffDays < 7) {
    return then.toLocaleDateString(undefined, { weekday: "long" });
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
