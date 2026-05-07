"use client";

import { useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  GripVertical,
} from "lucide-react";
import {
  CATEGORY_META,
  Category,
  Currency,
  Investment,
  isStock,
} from "@/lib/types";
import {
  PriceMap,
  nativeValue,
  sessionPrice,
  valueIn,
} from "@/lib/valuation";
import {
  formatCurrency,
  formatCurrencySmart,
  formatPct,
  formatQuantity,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import { IntradaySeries, useIntraday } from "@/app/providers";
import { useSettings } from "@/app/settings-context";
import { Sparkline } from "./sparkline";
import { MarketStatusBadge } from "./market-status-badge";

type IntradayMap = Record<string, IntradaySeries>;

/**
 * Returns a wall-clock timestamp that updates every `intervalMs`.
 * Using this avoids calling the impure `Date.now()` during render, which
 * is flagged by `react-hooks/purity` and would otherwise produce unstable
 * sparkline x-positions across renders.
 */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function HoldingsTable({
  investments,
  prices,
  usdInr,
  display,
}: {
  investments: Investment[];
  prices: PriceMap;
  usdInr: number;
  display: Currency;
}) {
  const qc = useQueryClient();
  // Local copy of the investments list for optimistic drag-reorder. We mirror
  // the prop using the React docs "Adjusting state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // instead of an effect — the effect form triggers cascading renders.
  const [items, setItems] = useState<Investment[]>(investments);
  const [prevInvestments, setPrevInvestments] = useState(investments);
  if (investments !== prevInvestments) {
    setPrevInvestments(investments);
    setItems(investments);
  }

  const stockSymbols = useMemo(
    () =>
      Array.from(
        new Set(items.filter(isStock).map((i) => i.symbol)),
      ),
    [items],
  );
  const intradayQ = useIntraday(stockSymbols);
  const intradayMap: IntradayMap = useMemo(() => {
    const m: IntradayMap = {};
    for (const s of intradayQ.data?.series ?? []) m[s.symbol] = s;
    return m;
  }, [intradayQ.data]);
  const now = useNow();

  if (items.length === 0) return null;

  const categories = Array.from(
    new Set(items.map((i) => i.category)),
  ) as Category[];

  async function persistOrder(nextAll: Investment[]) {
    try {
      const res = await fetch("/api/investments/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: nextAll.map((i) => i.id) }),
      });
      if (!res.ok) throw new Error("Failed to save order");
      qc.setQueryData<{ investments: Investment[] }>(
        ["investments"],
        { investments: nextAll },
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save order",
      );
      await qc.invalidateQueries({ queryKey: ["investments"] });
    }
  }

  function onReorderCategory(cat: Category, newGroup: Investment[]) {
    const groupIter = newGroup[Symbol.iterator]();
    const next = items.map((inv) => {
      if (inv.category !== cat) return inv;
      const nxt = groupIter.next();
      return nxt.done ? inv : nxt.value;
    });
    setItems(next);
    void persistOrder(next);
  }

  function onReorderCategories(newCats: Category[]) {
    const grouped = new Map<Category, Investment[]>();
    for (const inv of items) {
      const arr = grouped.get(inv.category) ?? [];
      arr.push(inv);
      grouped.set(inv.category, arr);
    }
    const next = newCats.flatMap((c) => grouped.get(c) ?? []);
    setItems(next);
    void persistOrder(next);
  }

  return (
    <Reorder.Group
      axis="y"
      values={categories}
      onReorder={onReorderCategories}
      as="div"
      className="space-y-6"
    >
      {categories.map((cat) => (
        <CategoryBlock
          key={cat}
          cat={cat}
          items={items}
          prices={prices}
          usdInr={usdInr}
          display={display}
          intradayMap={intradayMap}
          now={now}
          onReorderCategory={onReorderCategory}
        />
      ))}
      <p className="text-xs text-muted">
        Tip: drag the handle{" "}
        <GripVertical className="inline-block h-3 w-3 align-text-bottom" /> on a
        row to reorder within a category, or drag a category header to move the
        whole section.
      </p>
    </Reorder.Group>
  );
}

function CategoryBlock({
  cat,
  items,
  prices,
  usdInr,
  display,
  intradayMap,
  now,
  onReorderCategory,
}: {
  cat: Category;
  items: Investment[];
  prices: PriceMap;
  usdInr: number;
  display: Currency;
  intradayMap: IntradayMap;
  now: number;
  onReorderCategory: (cat: Category, next: Investment[]) => void;
}) {
  const controls = useDragControls();
  const meta = CATEGORY_META[cat];
  const group = items.filter((i) => i.category === cat);
  const groupValue = group.reduce(
    (s, i) => s + valueIn(i, prices, usdInr, display),
    0,
  );
  return (
    <Reorder.Item
      value={cat}
      dragListener={false}
      dragControls={controls}
      whileDrag={{
        scale: 1.005,
        boxShadow:
          "0 20px 50px -20px rgba(99, 102, 241, 0.45), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            aria-label={`Drag ${meta.label} section`}
            className="-ml-1 flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-white/5 hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: meta.color }}
          />
          <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
            {meta.label}
          </h3>
          <span className="text-xs text-muted">
            ({group.length} {group.length === 1 ? "holding" : "holdings"})
          </span>
          {(cat === "US_STOCK" || cat === "INDIAN_STOCK") && (
            <MarketStatusBadge category={cat} />
          )}
        </div>
        <span
          className="text-sm font-semibold tabular-nums"
          title={formatCurrency(groupValue, display)}
        >
          {formatCurrencySmart(groupValue, display)}
        </span>
      </div>
      <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="hidden grid-cols-[24px_minmax(120px,1fr)_56px_80px_104px_80px_minmax(72px,0.9fr)_minmax(88px,1fr)] gap-x-1.5 border-b border-white/5 px-3 py-2 text-left text-xs uppercase tracking-wider text-muted md:grid">
          <span />
          <span>Name</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit Price</span>
          <span className="text-center">Today</span>
          <span className="text-right">Avg Cost</span>
          <span className="text-right">Value</span>
          <span className="text-right">P/L</span>
        </div>
        <Reorder.Group
          axis="y"
          values={group}
          onReorder={(next) => onReorderCategory(cat, next)}
          as="ul"
          className="divide-y divide-white/5"
        >
          {group.map((inv) => (
            <Row
              key={inv.id}
              inv={inv}
              prices={prices}
              intraday={isStock(inv) ? intradayMap[inv.symbol] : undefined}
              now={now}
            />
          ))}
        </Reorder.Group>
      </div>
    </Reorder.Item>
  );
}

function Row({
  inv,
  prices,
  intraday,
  now,
}: {
  inv: Investment;
  prices: PriceMap;
  intraday?: IntradaySeries;
  now: number;
}) {
  const controls = useDragControls();
  const { settings } = useSettings();
  const nv = nativeValue(inv, prices);
  const stock = isStock(inv);
  const priceEntry = stock ? prices[inv.symbol] : undefined;
  const sessionExtra: {
    label: "PRE" | "AH";
    price: number;
    pct?: number;
  } | null = (() => {
    if (!stock || !priceEntry) return null;
    if (
      (priceEntry.marketState === "PRE" || priceEntry.marketState === "PREPRE") &&
      typeof priceEntry.preMarketPrice === "number"
    ) {
      return {
        label: "PRE",
        price: priceEntry.preMarketPrice,
        pct: priceEntry.preMarketChangePercent,
      };
    }
    if (
      (priceEntry.marketState === "POST" || priceEntry.marketState === "POSTPOST") &&
      typeof priceEntry.postMarketPrice === "number"
    ) {
      return {
        label: "AH",
        price: priceEntry.postMarketPrice,
        pct: priceEntry.postMarketChangePercent,
      };
    }
    return null;
  })();

  // Per-row figures always display in the investment's native currency so
  // toggling the dashboard display currency (INR ↔ USD) doesn't distort
  // individual holdings. Aggregates (net worth, category totals, group
  // subtotals) still honor the display currency.
  const rowCurrency: Currency = nv.currency;
  const value = nv.value;
  const cost = stock
    ? inv.avgCost * inv.quantity
    : inv.principal !== undefined
      ? inv.principal
      : null;
  const pl = cost !== null ? value - cost : null;
  const plPct = cost && cost > 0 && pl !== null ? (pl / cost) * 100 : null;

  // Session performance (current day, or last open day if market closed).
  // Baseline priority: (1) quote.previousClose (authoritative regular-session
  // close from Yahoo), (2) derived prior-day last bar, (3) first bar of the
  // current session. This avoids using after-hours/pre-market bars as the
  // baseline, which was causing inflated/deflated deltas.
  let sessionDeltaPct: number | null = null;
  let sessionDeltaAbs: number | null = null;
  let sessionCurrency: Currency | null = null;
  let sessionStale = false;
  if (stock) {
    const pe = prices[inv.symbol];
    const quotePrev = pe?.previousClose;
    // When the user opted in, prefer the active extended-session price.
    // Otherwise (or when no extended price is present) fall back to the
    // regular-session price.
    const currentPrice =
      (pe ? sessionPrice(pe, settings.extendedHoursPL) : undefined) ??
      (intraday && intraday.points.length > 0
        ? intraday.points[intraday.points.length - 1].close
        : undefined);
    const base =
      typeof quotePrev === "number"
        ? quotePrev
        : typeof intraday?.prevClose === "number"
          ? intraday.prevClose
          : intraday?.points[0]?.close;
    if (
      typeof currentPrice === "number" &&
      typeof base === "number" &&
      base > 0
    ) {
      sessionDeltaAbs = currentPrice - base;
      sessionDeltaPct = ((currentPrice - base) / base) * 100;
      sessionCurrency = prices[inv.symbol]?.currency ?? nv.currency;
    }
    if (intraday?.sessionDate) {
      const today = new Date().toISOString().slice(0, 10);
      sessionStale = intraday.sessionDate !== today;
    }
  }

  // Build sparkline points: append the live quote price as a synthetic
  // trailing point so the line tracks real-time movement between Yahoo's
  // 5-minute bars. Skip if the session is stale (market closed / last-session
  // data) — in that case the last bar is already the final close.
  const liveQuote = stock ? prices[inv.symbol]?.price : undefined;
  const basePoints = intraday?.points ?? [];
  const sparkPoints =
    stock && !sessionStale && typeof liveQuote === "number" && basePoints.length > 0
      ? (() => {
          const last = basePoints[basePoints.length - 1];
          // Replace the last bar if it's within the last 5 minutes (live tick),
          // otherwise append a new point at "now".
          if (now - last.t < 5 * 60 * 1000) {
            return [
              ...basePoints.slice(0, -1),
              { t: now, close: liveQuote },
            ];
          }
          return [...basePoints, { t: now, close: liveQuote }];
        })()
      : basePoints;

  return (
    <Reorder.Item
      value={inv}
      dragListener={false}
      dragControls={controls}
      className="cursor-default px-3 py-3 text-sm hover:bg-white/[0.03] md:grid md:grid-cols-[24px_minmax(120px,1fr)_56px_80px_104px_80px_minmax(72px,0.9fr)_minmax(88px,1fr)] md:items-center md:gap-x-1.5"
      whileDrag={{
        scale: 1.01,
        boxShadow:
          "0 10px 30px -10px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(255,255,255,0.08)",
        backgroundColor: "rgba(99,102,241,0.06)",
      }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    >
      {/* Mobile layout */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onPointerDown={(e) => controls.start(e)}
              aria-label="Drag to reorder"
              className="-ml-1 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-white/5 hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 truncate font-medium">
                <span className="truncate">{stock ? inv.symbol : inv.label}</span>
                {sessionExtra && (
                  <SessionChip
                    label={sessionExtra.label}
                    price={sessionExtra.price}
                    pct={sessionExtra.pct}
                    currency={nv.currency}
                  />
                )}
              </span>
              <span className="truncate text-xs text-muted">
                {stock
                  ? `${CATEGORY_META[inv.category].short} · ${nv.currency}`
                  : CATEGORY_META[inv.category].label}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div
              className="font-semibold tabular-nums"
              title={formatCurrency(value, rowCurrency)}
            >
              {formatCurrencySmart(value, rowCurrency)}
            </div>
            {pl !== null && plPct !== null ? (
              <div
                className={cn(
                  "mt-0.5 text-xs font-semibold tabular-nums",
                  pl >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
                title={`${pl >= 0 ? "+" : "−"}${formatCurrency(Math.abs(pl), rowCurrency)}`}
              >
                {pl >= 0 ? "+" : "−"}
                {formatCurrencySmart(Math.abs(pl), rowCurrency, 1000)}{" "}
                <span className="text-muted">({formatPct(plPct)})</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-1 flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {stock ? "Qty · Price" : "Type"}
            </span>
            <span className="truncate text-xs tabular-nums">
              {stock && nv.unitPrice !== undefined
                ? `${formatQuantity(inv.quantity)} · ${formatCurrency(nv.unitPrice, nv.currency)}`
                : stock
                  ? `${formatQuantity(inv.quantity)}`
                  : inv.interestRate !== undefined
                    ? `${inv.interestRate}% p.a.`
                    : "—"}
            </span>
          </div>
          {stock && (
            <div className="flex flex-col items-end gap-0.5">
              <Sparkline
                points={sparkPoints}
                prevClose={
                  prices[inv.symbol]?.previousClose ??
                  intraday?.prevClose ??
                  null
                }
                prevCloseCurrency={prices[inv.symbol]?.currency ?? nv.currency}
                stale={sessionStale}
                sessionStart={sessionStale ? null : intraday?.sessionStart}
                sessionEnd={sessionStale ? null : intraday?.sessionEnd}
              />
              {sessionDeltaPct !== null ? (
                <span
                  className={cn(
                    "text-[10px] font-semibold leading-tight tabular-nums",
                    sessionDeltaPct >= 0 ? "text-emerald-400" : "text-rose-400",
                    sessionStale && "opacity-70",
                  )}
                >
                  {sessionDeltaPct >= 0 ? "+" : ""}
                  {sessionDeltaPct.toFixed(2)}%
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Desktop cells */}
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label="Drag to reorder"
        className="-ml-1 hidden h-7 w-7 cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-white/5 hover:text-foreground active:cursor-grabbing md:flex"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="hidden min-w-0 flex-col md:flex">
        <span className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{stock ? inv.symbol : inv.label}</span>
          {sessionExtra && (
            <SessionChip
              label={sessionExtra.label}
              price={sessionExtra.price}
              pct={sessionExtra.pct}
              currency={nv.currency}
            />
          )}
        </span>
        <span className="truncate text-xs text-muted">
          {stock
            ? `${CATEGORY_META[inv.category].short} · ${nv.currency}`
            : CATEGORY_META[inv.category].label}
        </span>
      </div>
      <span className="hidden whitespace-nowrap text-right tabular-nums md:inline">
        {stock ? formatQuantity(inv.quantity) : "—"}
      </span>
      <span className="hidden whitespace-nowrap text-right tabular-nums md:inline">
        {stock && nv.unitPrice !== undefined
          ? formatCurrency(nv.unitPrice, nv.currency)
          : stock
            ? "—"
            : inv.interestRate !== undefined
              ? `${inv.interestRate}% p.a.`
              : "—"}
      </span>
      <div className="hidden flex-col items-center justify-center gap-0.5 md:flex">
        {stock ? (
          <>
            <Sparkline
              points={sparkPoints}
              prevClose={
                prices[inv.symbol]?.previousClose ??
                intraday?.prevClose ??
                null
              }
              prevCloseCurrency={prices[inv.symbol]?.currency ?? nv.currency}
              stale={sessionStale}
              sessionStart={sessionStale ? null : intraday?.sessionStart}
              sessionEnd={sessionStale ? null : intraday?.sessionEnd}
            />
            {sessionDeltaPct !== null ? (
              <span
                title={
                  sessionStale && intraday?.sessionDate
                    ? `Last session: ${intraday.sessionDate}`
                    : "Today"
                }
                className={cn(
                  "text-[10px] font-semibold leading-tight tabular-nums",
                  sessionDeltaPct >= 0
                    ? "text-emerald-400"
                    : "text-rose-400",
                  sessionStale && "opacity-70",
                )}
              >
                {sessionDeltaAbs !== null && sessionCurrency ? (
                  <>
                    {sessionDeltaAbs >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(sessionDeltaAbs), sessionCurrency)}
                    {" · "}
                  </>
                ) : null}
                {sessionDeltaPct >= 0 ? "+" : ""}
                {sessionDeltaPct.toFixed(2)}%
                {sessionStale ? " · prev" : ""}
              </span>
            ) : (
              <span className="text-[10px] text-muted">—</span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted">—</span>
        )}
      </div>
      <span
        className="hidden whitespace-nowrap text-right tabular-nums md:inline"
        title={
          stock
            ? formatCurrency(inv.avgCost, inv.currency)
            : inv.principal !== undefined
              ? formatCurrency(inv.principal, inv.currency)
              : undefined
        }
      >
        {stock
          ? formatCurrencySmart(inv.avgCost, inv.currency)
          : inv.principal !== undefined
            ? formatCurrencySmart(inv.principal, inv.currency)
            : "—"}
      </span>
      <span
        className="hidden whitespace-nowrap text-right font-semibold tabular-nums md:inline"
        title={formatCurrency(value, rowCurrency)}
      >
        {formatCurrencySmart(value, rowCurrency)}
      </span>
      <span className="hidden whitespace-nowrap text-right md:inline">
        {pl === null || plPct === null ? (
          <span className="text-xs text-muted">—</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
              pl >= 0 ? "text-emerald-400" : "text-rose-400",
            )}
            title={`${pl >= 0 ? "+" : "−"}${formatCurrency(Math.abs(pl), rowCurrency)}`}
          >
            {pl >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span>{formatCurrencySmart(Math.abs(pl), rowCurrency, 1000)}</span>
            <span className="text-muted">({formatPct(plPct)})</span>
          </span>
        )}
      </span>
    </Reorder.Item>
  );
}

function SessionChip({
  label,
  price,
  pct,
  currency,
}: {
  label: "PRE" | "AH";
  price: number;
  pct?: number;
  currency: Currency;
}) {
  const positive = typeof pct === "number" ? pct >= 0 : true;
  const tooltipPrefix = label === "PRE" ? "Pre-market" : "After-hours";
  return (
    <span
      title={`${tooltipPrefix}: ${formatCurrency(price, currency)}${
        typeof pct === "number" ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""
      } — not used in P/L`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wider",
        positive
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-rose-400/30 bg-rose-500/10 text-rose-300",
      )}
    >
      <span>{label}</span>
      {typeof pct === "number" && (
        <span className="tabular-nums">
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </span>
  );
}
