"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Category } from "@/lib/types";
import {
  formatCountdown,
  getMarketStatus,
} from "@/lib/market-hours";
import { cn } from "@/lib/cn";

export function MarketStatusBadge({ category }: { category: Category }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const status = getMarketStatus(category, new Date(now));
  if (!status) return null;

  const diff = status.nextChange - now;
  const openLocal = new Date(status.nextChange).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span
      title={
        status.isOpen
          ? `${status.exchange} open · closes at ${openLocal} local`
          : `${status.exchange} closed · opens at ${openLocal} local`
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        status.isOpen
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-white/10 bg-white/5 text-muted",
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status.isOpen && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            status.isOpen ? "bg-emerald-400" : "bg-muted",
          )}
        />
      </span>
      {status.isOpen ? (
        <>
          Open
          <span className="font-normal normal-case tracking-normal text-emerald-200/80">
            · closes in {formatCountdown(diff)}
          </span>
        </>
      ) : (
        <>
          <Clock className="h-3 w-3" />
          Closed
          <span className="font-normal normal-case tracking-normal text-muted">
            · opens in {formatCountdown(diff)}
          </span>
        </>
      )}
    </span>
  );
}
