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
  costIn,
  nativeValue,
  valueIn,
} from "@/lib/valuation";
import {
  formatCurrency,
  formatCurrencySmart,
  formatNumber,
  formatPct,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import { IntradaySeries, useIntraday } from "@/app/providers";
import { Sparkline } from "./sparkline";
import { MarketStatusBadge } from "./market-status-badge";

type IntradayMap = Record<string, IntradaySeries>;

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
  const [items, setItems] = useState<Investment[]>(investments);
  useEffect(() => {
    setItems(investments);
  }, [investments]);

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
  onReorderCategory,
}: {
  cat: Category;
  items: Investment[];
  prices: PriceMap;
  usdInr: number;
  display: Currency;
  intradayMap: IntradayMap;
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
        <div className="hidden grid-cols-[32px_minmax(140px,1.2fr)_80px_100px_150px_100px_110px_170px] gap-x-3 border-b border-white/5 px-4 py-2 text-left text-xs uppercase tracking-wider text-muted md:grid md:min-w-[940px]">
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
              usdInr={usdInr}
              display={display}
              intraday={isStock(inv) ? intradayMap[inv.symbol] : undefined}
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
  usdInr,
  display,
  intraday,
}: {
  inv: Investment;
  prices: PriceMap;
  usdInr: number;
  display: Currency;
  intraday?: IntradaySeries;
}) {
  const controls = useDragControls();
  const nv = nativeValue(inv, prices);
  const value = valueIn(inv, prices, usdInr, display);
  const cost = costIn(inv, usdInr, display);
  const pl = cost !== null ? value - cost : null;
  const plPct = cost && cost > 0 && pl !== null ? (pl / cost) * 100 : null;
  const stock = isStock(inv);

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
    const quotePrev = prices[inv.symbol]?.previousClose;
    const currentPrice =
      prices[inv.symbol]?.price ??
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

  return (
    <Reorder.Item
      value={inv}
      dragListener={false}
      dragControls={controls}
      className="cursor-default px-4 py-3 text-sm hover:bg-white/[0.03] md:grid md:min-w-[940px] md:grid-cols-[32px_minmax(140px,1.2fr)_80px_100px_150px_100px_110px_170px] md:items-center md:gap-x-3"
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
              <span className="truncate font-medium">
                {stock ? inv.symbol : inv.label}
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
              title={formatCurrency(value, display)}
            >
              {formatCurrencySmart(value, display)}
            </div>
            {pl !== null && plPct !== null ? (
              <div
                className={cn(
                  "mt-0.5 text-xs font-semibold tabular-nums",
                  pl >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
                title={`${pl >= 0 ? "+" : "−"}${formatCurrency(Math.abs(pl), display)}`}
              >
                {pl >= 0 ? "+" : "−"}
                {formatCurrencySmart(Math.abs(pl), display)}{" "}
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
                ? `${formatNumber(inv.quantity, 4)} · ${formatCurrency(nv.unitPrice, nv.currency)}`
                : stock
                  ? `${formatNumber(inv.quantity, 4)}`
                  : inv.interestRate !== undefined
                    ? `${inv.interestRate}% p.a.`
                    : "—"}
            </span>
          </div>
          {stock && (
            <div className="flex flex-col items-end gap-0.5">
              <Sparkline
                points={intraday?.points ?? []}
                prevClose={
                  prices[inv.symbol]?.previousClose ??
                  intraday?.prevClose ??
                  null
                }
                stale={sessionStale}
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
        <span className="truncate font-medium">
          {stock ? inv.symbol : inv.label}
        </span>
        <span className="truncate text-xs text-muted">
          {stock
            ? `${CATEGORY_META[inv.category].short} · ${nv.currency}`
            : CATEGORY_META[inv.category].label}
        </span>
      </div>
      <span className="hidden whitespace-nowrap text-right tabular-nums md:inline">
        {stock ? formatNumber(inv.quantity, 4) : "—"}
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
              points={intraday?.points ?? []}
              prevClose={
                prices[inv.symbol]?.previousClose ??
                intraday?.prevClose ??
                null
              }
              stale={sessionStale}
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
        title={formatCurrency(value, display)}
      >
        {formatCurrencySmart(value, display)}
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
            title={`${pl >= 0 ? "+" : "−"}${formatCurrency(Math.abs(pl), display)}`}
          >
            {pl >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span>{formatCurrencySmart(Math.abs(pl), display)}</span>
            <span className="text-muted">({formatPct(plPct)})</span>
          </span>
        )}
      </span>
    </Reorder.Item>
  );
}
