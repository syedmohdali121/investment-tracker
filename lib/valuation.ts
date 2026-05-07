import { Category, Currency, Investment, isStock } from "./types";

/**
 * Per-symbol price data used by valuation, P/L, and chip rendering.
 *
 * SINGLE SOURCE OF TRUTH for client-side price entries — all consumers
 * (dashboard, insights, holdings table, contribution list) should construct
 * entries via `quoteToPriceEntry` so newly-added fields automatically
 * propagate. If you add a field here, also add it to `quoteToPriceEntry`.
 */
export type PriceEntry = {
  price: number;
  currency: Currency;
  previousClose?: number;
  marketState?: "PRE" | "PREPRE" | "REGULAR" | "POST" | "POSTPOST" | "CLOSED";
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
};

export type PriceMap = Record<string, PriceEntry>;

/**
 * Build a `PriceEntry` from a quote-shaped object (from `/api/quotes` or
 * `getQuotes`). Strips fields irrelevant to valuation/display so the map
 * stays narrow.
 */
export function quoteToPriceEntry(q: PriceEntry): PriceEntry {
  return {
    price: q.price,
    currency: q.currency,
    previousClose: q.previousClose,
    marketState: q.marketState,
    preMarketPrice: q.preMarketPrice,
    preMarketChangePercent: q.preMarketChangePercent,
    postMarketPrice: q.postMarketPrice,
    postMarketChangePercent: q.postMarketChangePercent,
  };
}

/**
 * Effective price to use when computing "session P/L" (Today's P/L). When
 * `extendedHours` is true and the symbol is in an active extended session,
 * returns the extended-hours price; otherwise returns the regular-session
 * price (`q.price`). NEVER used for net worth, total P/L, valuation, or
 * tax — those always use `q.price` (the regular-session close).
 */
export function sessionPrice(
  q: PriceEntry,
  extendedHours: boolean,
): number {
  if (extendedHours) {
    if (
      (q.marketState === "PRE" || q.marketState === "PREPRE") &&
      typeof q.preMarketPrice === "number"
    ) {
      return q.preMarketPrice;
    }
    if (
      (q.marketState === "POST" || q.marketState === "POSTPOST") &&
      typeof q.postMarketPrice === "number"
    ) {
      return q.postMarketPrice;
    }
  }
  return q.price;
}

export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  usdInr: number,
): number {
  if (from === to) return amount;
  if (from === "USD" && to === "INR") return amount * usdInr;
  if (from === "INR" && to === "USD") return amount / usdInr;
  return amount;
}

/** Current value of an investment in its native currency. */
export function nativeValue(inv: Investment, prices: PriceMap): {
  value: number;
  currency: Currency;
  unitPrice?: number;
  costBasis?: number;
} {
  if (isStock(inv)) {
    const q = prices[inv.symbol];
    const unit = q?.price ?? inv.avgCost;
    const currency = q?.currency ?? inv.currency;
    return {
      value: unit * inv.quantity,
      currency,
      unitPrice: unit,
      costBasis: inv.avgCost * inv.quantity,
    };
  }
  return { value: inv.balance, currency: inv.currency };
}

export function valueIn(
  inv: Investment,
  prices: PriceMap,
  usdInr: number,
  display: Currency,
): number {
  const nv = nativeValue(inv, prices);
  return convert(nv.value, nv.currency, display, usdInr);
}

export function costIn(
  inv: Investment,
  usdInr: number,
  display: Currency,
): number | null {
  if (isStock(inv)) {
    return convert(inv.avgCost * inv.quantity, inv.currency, display, usdInr);
  }
  if (inv.principal === undefined) return null;
  return convert(inv.principal, inv.currency, display, usdInr);
}

export function netWorth(
  investments: Investment[],
  prices: PriceMap,
  usdInr: number,
  display: Currency,
): number {
  return investments.reduce(
    (sum, inv) => sum + valueIn(inv, prices, usdInr, display),
    0,
  );
}

export function aggregateByCategory(
  investments: Investment[],
  prices: PriceMap,
  usdInr: number,
  display: Currency,
): Array<{ category: Category; value: number; count: number }> {
  const map = new Map<Category, { value: number; count: number }>();
  for (const inv of investments) {
    const v = valueIn(inv, prices, usdInr, display);
    const cur = map.get(inv.category) ?? { value: 0, count: 0 };
    map.set(inv.category, { value: cur.value + v, count: cur.count + 1 });
  }
  return Array.from(map.entries()).map(([category, { value, count }]) => ({
    category,
    value,
    count,
  }));
}

export function symbolsOf(investments: Investment[]): string[] {
  return Array.from(
    new Set(investments.filter(isStock).map((i) => i.symbol)),
  );
}
