"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useIntraday, usePrices, useWatchlist } from "../providers";
import { Card } from "@/components/card";
import { Sparkline } from "@/components/sparkline";
import { formatCurrencySmart } from "@/lib/format";
import { cn } from "@/lib/cn";

type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
};

export default function WatchlistPage() {
  const qc = useQueryClient();
  const watchlistQ = useWatchlist();
  const items = useMemo(
    () => watchlistQ.data?.items ?? [],
    [watchlistQ.data],
  );
  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);

  const pricesQ = usePrices(symbols);
  const intradayQ = useIntraday(symbols);

  const priceBySymbol = useMemo(() => {
    const m = new Map<
      string,
      {
        price: number;
        currency: "USD" | "INR";
        previousClose?: number;
        changePercent?: number;
        name?: string;
      }
    >();
    for (const q of pricesQ.data?.quotes ?? []) {
      m.set(q.symbol, {
        price: q.price,
        currency: q.currency,
        previousClose: q.previousClose,
        changePercent: q.changePercent,
        name: q.name,
      });
    }
    return m;
  }, [pricesQ.data]);

  const intradayBySymbol = useMemo(() => {
    const m = new Map<string, (typeof series)[number]>();
    const series = intradayQ.data?.series ?? [];
    for (const s of series) m.set(s.symbol, s);
    return m;
  }, [intradayQ.data]);

  // ---- Search + add ----
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/symbol-search?q=${encodeURIComponent(q)}`,
        );
        const json = await res.json();
        setResults((json.results ?? []) as SearchHit[]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const owned = useMemo(
    () => new Set(symbols.map((s) => s.toUpperCase())),
    [symbols],
  );

  async function add(hit: SearchHit) {
    const symbol = hit.symbol.toUpperCase();
    if (owned.has(symbol)) {
      toast.error(`${symbol} is already on your watchlist`);
      return;
    }
    setAdding(symbol);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, name: hit.name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not add");
      }
      await qc.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success(`Added ${symbol}`, { duration: 1500 });
      setQuery("");
      setResults([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    } finally {
      setAdding(null);
    }
  }

  async function remove(symbol: string) {
    try {
      const res = await fetch(
        `/api/watchlist?symbol=${encodeURIComponent(symbol)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Could not remove");
      await qc.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success(`Removed ${symbol}`, { duration: 1500 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Eye className="h-5 w-5 text-indigo-400" />
          Watchlist
        </h1>
        <p className="text-sm text-muted">
          Track tickers you don&apos;t own yet. Prices update live.
        </p>
      </div>

      {/* Search + add */}
      <Card delay={0}>
        <label className="text-xs font-medium uppercase tracking-wider text-muted">
          Add a symbol
        </label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or company (e.g. AAPL, Reliance)…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-9 text-sm outline-none transition focus:border-indigo-400/50 focus:bg-white/[0.07]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {query.trim().length >= 1 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1">
                {searching && results.length === 0 ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching…
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted">
                    No matches.
                  </div>
                ) : (
                  results.map((r) => {
                    const isOwned = owned.has(r.symbol.toUpperCase());
                    return (
                      <button
                        key={`${r.symbol}-${r.exchange}`}
                        type="button"
                        disabled={isOwned || adding === r.symbol.toUpperCase()}
                        onClick={() => add(r)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left text-sm transition hover:border-indigo-400/40 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{r.symbol}</span>
                            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                              {r.exchange || r.quoteType}
                            </span>
                          </div>
                          <div className="truncate text-xs text-muted">
                            {r.name}
                          </div>
                        </div>
                        {isOwned ? (
                          <span className="shrink-0 text-[10px] uppercase text-muted">
                            Added
                          </span>
                        ) : adding === r.symbol.toUpperCase() ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-indigo-400" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* List */}
      <div className="mt-6">
        {watchlistQ.isLoading ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center text-sm text-muted">
            Loading watchlist…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <Eye className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 text-sm font-medium">Your watchlist is empty</p>
            <p className="mt-1 text-xs text-muted">
              Search above to start tracking tickers you&apos;re interested in.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
            {/* Header */}
            <div className="hidden grid-cols-[minmax(120px,1fr)_104px_96px_88px_40px] items-center gap-2 border-b border-white/5 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted sm:grid">
              <span>Symbol</span>
              <span className="text-center">Today</span>
              <span className="text-right">Price</span>
              <span className="text-right">Change</span>
              <span />
            </div>
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const q = priceBySymbol.get(item.symbol);
                const intraday = intradayBySymbol.get(item.symbol);
                const stale = intraday?.sessionDate
                  ? intraday.sessionDate !== today
                  : false;
                let changePct: number | null = null;
                if (
                  q &&
                  typeof q.previousClose === "number" &&
                  q.previousClose > 0
                ) {
                  changePct =
                    ((q.price - q.previousClose) / q.previousClose) * 100;
                } else if (typeof q?.changePercent === "number") {
                  changePct = q.changePercent;
                }
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2 border-b border-white/5 px-4 py-3 last:border-b-0 transition hover:bg-white/[0.03] sm:grid-cols-[minmax(120px,1fr)_104px_96px_88px_40px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.symbol}</div>
                      <div className="truncate text-xs text-muted">
                        {item.name ?? q?.name ?? "—"}
                      </div>
                      {/* Mobile-only price + change */}
                      <div className="mt-1 flex items-center gap-2 tabular-nums sm:hidden">
                        {q ? (
                          <span className="amount text-sm font-medium">
                            {formatCurrencySmart(q.price, q.currency)}
                          </span>
                        ) : null}
                        {changePct !== null ? (
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              changePct >= 0
                                ? "text-emerald-400"
                                : "text-rose-400",
                              stale && "opacity-70",
                            )}
                          >
                            {changePct >= 0 ? "+" : ""}
                            {changePct.toFixed(2)}%{stale ? " · prev" : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="hidden items-center justify-center sm:flex">
                      {intraday && intraday.points.length > 1 ? (
                        <Sparkline
                          points={intraday.points}
                          prevClose={intraday.prevClose ?? q?.previousClose ?? null}
                          prevCloseCurrency={q?.currency}
                          stale={stale}
                          sessionStart={stale ? null : intraday.sessionStart}
                          sessionEnd={stale ? null : intraday.sessionEnd}
                        />
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>

                    <div className="hidden text-right tabular-nums sm:block">
                      {q ? (
                        <span className="amount text-sm font-medium">
                          {formatCurrencySmart(q.price, q.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>

                    <div className="hidden justify-end sm:flex">
                      {changePct !== null ? (
                        <span
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            changePct >= 0
                              ? "text-emerald-400"
                              : "text-rose-400",
                            stale && "opacity-70",
                          )}
                        >
                          {changePct >= 0 ? "+" : ""}
                          {changePct.toFixed(2)}%{stale ? " · prev" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(item.symbol)}
                      aria-label={`Remove ${item.symbol}`}
                      className="flex h-8 w-8 items-center justify-center justify-self-end rounded-md text-muted transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
