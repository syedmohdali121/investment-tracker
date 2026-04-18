import YahooFinance from "yahoo-finance2";
import type { Currency } from "./types";

const yahooFinance = new YahooFinance();

// Silence the survey notice on first run
(yahooFinance as unknown as { suppressNotices?: (n: string[]) => void }).suppressNotices?.([
  "yahooSurvey",
]);

export type Quote = {
  symbol: string;
  price: number;
  currency: Currency;
  name?: string;
  change?: number;
  changePercent?: number;
  previousClose?: number;
};

type CacheEntry<T> = { value: T; expires: number };
const QUOTE_TTL_MS = 30_000;
const FX_TTL_MS = 60_000;

const quoteCache = new Map<string, CacheEntry<Quote>>();
let fxCache: CacheEntry<number> | null = null;

function normalizeCurrency(c: string | undefined): Currency {
  if (!c) return "USD";
  const up = c.toUpperCase();
  if (up === "INR") return "INR";
  return "USD";
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = Array.from(new Set(symbols.map((s) => s.trim()).filter(Boolean)));
  const now = Date.now();
  const toFetch: string[] = [];
  const out: Quote[] = [];

  for (const sym of unique) {
    const cached = quoteCache.get(sym);
    if (cached && cached.expires > now) {
      out.push(cached.value);
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length > 0) {
    try {
      const results = (await yahooFinance.quote(toFetch)) as unknown;
      const list = (Array.isArray(results) ? results : [results]) as Array<
        Record<string, unknown>
      >;
      for (const r of list) {
        const symbol = r?.symbol as string | undefined;
        if (!symbol) continue;
        const price =
          (r.regularMarketPrice as number | undefined) ??
          (r.postMarketPrice as number | undefined) ??
          (r.preMarketPrice as number | undefined);
        if (typeof price !== "number") continue;
        const q: Quote = {
          symbol,
          price,
          currency: normalizeCurrency(r.currency as string | undefined),
          name:
            (r.shortName as string | undefined) ??
            (r.longName as string | undefined),
          change: r.regularMarketChange as number | undefined,
          changePercent: r.regularMarketChangePercent as number | undefined,
          previousClose:
            (r.regularMarketPreviousClose as number | undefined) ??
            (r.previousClose as number | undefined),
        };
        quoteCache.set(symbol, { value: q, expires: now + QUOTE_TTL_MS });
        out.push(q);
      }
    } catch (err) {
      // fall through with whatever we have cached
      console.error("[market] getQuotes error:", err);
      // Serve stale cache as best-effort
      for (const sym of toFetch) {
        const stale = quoteCache.get(sym);
        if (stale) out.push(stale.value);
      }
    }
  }

  return out;
}

export async function getFxUsdInr(): Promise<number> {
  const now = Date.now();
  if (fxCache && fxCache.expires > now) return fxCache.value;
  try {
    const r = (await yahooFinance.quote("USDINR=X")) as unknown as Record<
      string,
      unknown
    > | null;
    const price =
      (r?.regularMarketPrice as number | undefined) ??
      (r?.postMarketPrice as number | undefined);
    if (typeof price === "number" && price > 0) {
      fxCache = { value: price, expires: now + FX_TTL_MS };
      return price;
    }
  } catch (err) {
    console.error("[market] getFxUsdInr error:", err);
  }
  // Fallback: last known, else a reasonable default
  if (fxCache) return fxCache.value;
  return 83.0;
}

export type HistoryRange = "1d" | "5d" | "1y" | "3y" | "5y";

export type HistoryPoint = { t: number; close: number };

export type HistorySeries = {
  symbol: string;
  currency: Currency;
  points: HistoryPoint[];
};

type HistoryCacheEntry = CacheEntry<HistorySeries>;
const historyCache = new Map<string, HistoryCacheEntry>();

function historyTtl(range: HistoryRange): number {
  if (range === "1d") return 60_000; // 1 min intraday
  if (range === "5d") return 5 * 60_000; // 5 min for 5-day intraday
  return 15 * 60_000; // 15 min for daily series
}

function rangeToParams(range: HistoryRange): {
  period1: Date;
  interval: "5m" | "30m" | "1d";
} {
  const now = new Date();
  if (range === "1d") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { period1: start, interval: "5m" };
  }
  if (range === "5d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { period1: start, interval: "30m" };
  }
  const years = range === "1y" ? 1 : range === "3y" ? 3 : 5;
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - years);
  return { period1: start, interval: "1d" };
}

export async function getHistory(
  symbol: string,
  range: HistoryRange,
): Promise<HistorySeries> {
  const cacheKey = `${symbol}|${range}`;
  const now = Date.now();
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.value;

  const { period1, interval } = rangeToParams(range);
  try {
    const result = (await yahooFinance.chart(symbol, {
      period1,
      interval,
    })) as unknown as {
      meta?: { currency?: string };
      quotes?: Array<{ date: Date | string; close: number | null }>;
    };
    const points: HistoryPoint[] = [];
    for (const q of result?.quotes ?? []) {
      if (q == null) continue;
      const close = q.close;
      if (typeof close !== "number") continue;
      const t = new Date(q.date).getTime();
      if (!Number.isFinite(t)) continue;
      points.push({ t, close });
    }
    const currency = normalizeCurrency(result?.meta?.currency);
    const series: HistorySeries = { symbol, currency, points };
    historyCache.set(cacheKey, {
      value: series,
      expires: now + historyTtl(range),
    });
    return series;
  } catch (err) {
    console.error("[market] getHistory error:", symbol, range, err);
    if (cached) return cached.value;
    return { symbol, currency: "USD", points: [] };
  }
}

export type IntradaySeries = {
  symbol: string;
  currency: Currency;
  points: HistoryPoint[]; // most recent trading session, 5m interval
  prevClose: number | null;
  sessionDate: string | null; // YYYY-MM-DD of the session
  sessionStart: number | null; // ms — regular session open
  sessionEnd: number | null; // ms — regular session close
};

const INTRADAY_TTL_MS = 60_000;
const intradayCache = new Map<string, CacheEntry<IntradaySeries>>();

export async function getIntraday(symbol: string): Promise<IntradaySeries> {
  const now = Date.now();
  const cached = intradayCache.get(symbol);
  if (cached && cached.expires > now) return cached.value;

  // 7-day lookback @ 5m guarantees we capture the most recent session
  // even over long weekends / holidays. includePrePost=false trims
  // pre-market / after-hours bars so the sparkline reflects only the
  // regular trading session.
  const period1 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  try {
    const result = (await yahooFinance.chart(symbol, {
      period1,
      interval: "5m",
      includePrePost: false,
    })) as unknown as {
      meta?: {
        currency?: string;
        chartPreviousClose?: number;
        currentTradingPeriod?: {
          regular?: { start?: number; end?: number };
        };
      };
      quotes?: Array<{ date: Date | string; close: number | null }>;
    };
    const all: HistoryPoint[] = [];
    for (const q of result?.quotes ?? []) {
      if (q == null) continue;
      const close = q.close;
      if (typeof close !== "number") continue;
      const t = new Date(q.date).getTime();
      if (!Number.isFinite(t)) continue;
      all.push({ t, close });
    }
    // Group by calendar day (UTC) and keep only the last group.
    let sessionDate: string | null = null;
    let points: HistoryPoint[] = [];
    let derivedPrevClose: number | null = null;
    if (all.length > 0) {
      const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
      const lastKey = dayKey(all[all.length - 1].t);
      sessionDate = lastKey;
      points = all.filter((p) => dayKey(p.t) === lastKey);
      // Belt-and-braces trim to the regular trading window Yahoo reports,
      // so any lingering pre/post market bars are dropped.
      const reg = result?.meta?.currentTradingPeriod?.regular;
      if (reg && typeof reg.start === "number" && typeof reg.end === "number") {
        // Yahoo reports seconds; convert to ms.
        const startMs = reg.start * 1000;
        const endMs = reg.end * 1000;
        const trimmed = points.filter((p) => p.t >= startMs && p.t <= endMs);
        if (trimmed.length > 0) points = trimmed;
      }
      // The prior session's last close — this is the correct baseline for
      // today-vs-yesterday %. Yahoo's meta.chartPreviousClose refers to the
      // close before the entire chart window (7d ago), which is wrong for us.
      const prior = all.filter((p) => dayKey(p.t) !== lastKey);
      if (prior.length > 0) derivedPrevClose = prior[prior.length - 1].close;
    }
    const currency = normalizeCurrency(result?.meta?.currency);
    const prevClose =
      derivedPrevClose ??
      (typeof result?.meta?.chartPreviousClose === "number"
        ? result.meta.chartPreviousClose
        : null);
    const reg = result?.meta?.currentTradingPeriod?.regular;
    const sessionStart =
      reg && typeof reg.start === "number" ? reg.start * 1000 : null;
    const sessionEnd =
      reg && typeof reg.end === "number" ? reg.end * 1000 : null;
    const series: IntradaySeries = {
      symbol,
      currency,
      points,
      prevClose,
      sessionDate,
      sessionStart,
      sessionEnd,
    };
    intradayCache.set(symbol, {
      value: series,
      expires: now + INTRADAY_TTL_MS,
    });
    return series;
  } catch (err) {
    console.error("[market] getIntraday error:", symbol, err);
    if (cached) return cached.value;
    return {
      symbol,
      currency: "USD",
      points: [],
      prevClose: null,
      sessionDate: null,
      sessionStart: null,
      sessionEnd: null,
    };
  }
}

export type DividendEvent = { t: number; amount: number };
export type DividendSeries = {
  symbol: string;
  currency: Currency;
  events: DividendEvent[];
};

const DIVIDEND_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const dividendCache = new Map<string, CacheEntry<DividendSeries>>();

/** Fetch dividend events for the last N years (default 5). */
export async function getDividends(
  symbol: string,
  years = 5,
): Promise<DividendSeries> {
  const cacheKey = `${symbol}|${years}`;
  const now = Date.now();
  const cached = dividendCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.value;

  const start = new Date(now);
  start.setFullYear(start.getFullYear() - years);
  try {
    const result = (await yahooFinance.chart(symbol, {
      period1: start,
      interval: "1d",
      events: "div",
    } as unknown as Parameters<typeof yahooFinance.chart>[1])) as unknown as {
      meta?: { currency?: string };
      events?: {
        dividends?: Record<string, { date: Date | string; amount: number }>;
      };
    };
    const events: DividendEvent[] = [];
    const raw = result?.events?.dividends ?? {};
    for (const key of Object.keys(raw)) {
      const e = raw[key];
      const t = new Date(e.date).getTime();
      if (!Number.isFinite(t)) continue;
      if (typeof e.amount !== "number") continue;
      events.push({ t, amount: e.amount });
    }
    events.sort((a, b) => a.t - b.t);
    const currency = normalizeCurrency(result?.meta?.currency);
    const series: DividendSeries = { symbol, currency, events };
    dividendCache.set(cacheKey, {
      value: series,
      expires: now + DIVIDEND_TTL_MS,
    });
    return series;
  } catch (err) {
    console.error("[market] getDividends error:", symbol, err);
    if (cached) return cached.value;
    return { symbol, currency: "USD", events: [] };
  }
}

export type AssetProfile = {
  symbol: string;
  sector: string | null;
  industry: string | null;
  quoteType: string | null;
};

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — sector rarely changes
const profileCache = new Map<string, CacheEntry<AssetProfile>>();

/**
 * Fetch sector/industry via quoteSummary. Returns nulls for crypto / ETFs /
 * commodities / any symbol without an assetProfile module. Long-cached.
 */
export async function getAssetProfile(symbol: string): Promise<AssetProfile> {
  const now = Date.now();
  const cached = profileCache.get(symbol);
  if (cached && cached.expires > now) return cached.value;

  try {
    const result = (await (
      yahooFinance as unknown as {
        quoteSummary: (
          s: string,
          opts: { modules: string[] },
        ) => Promise<unknown>;
      }
    ).quoteSummary(symbol, {
      modules: ["assetProfile", "price"],
    })) as {
      assetProfile?: { sector?: string; industry?: string };
      price?: { quoteType?: string };
    } | null;

    const profile: AssetProfile = {
      symbol,
      sector: result?.assetProfile?.sector ?? null,
      industry: result?.assetProfile?.industry ?? null,
      quoteType: result?.price?.quoteType ?? null,
    };
    profileCache.set(symbol, { value: profile, expires: now + PROFILE_TTL_MS });
    return profile;
  } catch (err) {
    console.error("[market] getAssetProfile error:", symbol, err);
    if (cached) return cached.value;
    const fallback: AssetProfile = {
      symbol,
      sector: null,
      industry: null,
      quoteType: null,
    };
    // short-cache failures so we don't hammer Yahoo
    profileCache.set(symbol, { value: fallback, expires: now + 10 * 60_000 });
    return fallback;
  }
}
