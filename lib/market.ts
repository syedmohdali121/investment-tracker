import YahooFinance from "yahoo-finance2";
import type { Currency } from "./types";
import { isAmfiSchemeCode } from "./types";

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
  // Pre-market data — display-only, never used in P/L or valuation math.
  marketState?: "PRE" | "PREPRE" | "REGULAR" | "POST" | "POSTPOST" | "CLOSED";
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
};

type CacheEntry<T> = { value: T; expires: number };
const QUOTE_TTL_MS = 30_000;
const FX_TTL_MS = 60_000;
const AMFI_QUOTE_TTL_MS = 60 * 60_000; // NAV updates once per day; 1h is plenty
const AMFI_NAV_TTL_MS = 60 * 60_000;

const quoteCache = new Map<string, CacheEntry<Quote>>();
let fxCache: CacheEntry<number> | null = null;

type AmfiEntry = { schemeName: string; nav: number };
let amfiNavCache: CacheEntry<Map<string, AmfiEntry>> | null = null;

async function getAmfiNavMap(): Promise<Map<string, AmfiEntry>> {
  const now = Date.now();
  if (amfiNavCache && amfiNavCache.expires > now) return amfiNavCache.value;
  const res = await fetch("https://portal.amfiindia.com/spages/NAVAll.txt", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AMFI NAV fetch failed: ${res.status}`);
  const text = await res.text();
  const map = new Map<string, AmfiEntry>();
  for (const line of text.split(/\r?\n/)) {
    // Format: SchemeCode;ISINGrowth;ISINReinvest;SchemeName;NAV;Date
    if (!line || line.startsWith("Scheme Code") || !line.includes(";")) continue;
    const parts = line.split(";");
    if (parts.length < 5) continue;
    const code = parts[0].trim();
    const name = parts[3].trim();
    const navStr = parts[4].trim();
    if (!/^\d+$/.test(code)) continue;
    const nav = Number(navStr);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    map.set(code, { schemeName: name, nav });
  }
  amfiNavCache = { value: map, expires: now + AMFI_NAV_TTL_MS };
  return map;
}

/** Search AMFI scheme list by substring of name. Used by add-investment lookup. */
export async function searchMutualFunds(
  query: string,
  limit = 15,
): Promise<Array<{ schemeCode: string; schemeName: string; nav: number }>> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const map = await getAmfiNavMap();
  const results: Array<{ schemeCode: string; schemeName: string; nav: number }> = [];
  for (const [code, entry] of map) {
    if (entry.schemeName.toLowerCase().includes(q)) {
      results.push({ schemeCode: code, schemeName: entry.schemeName, nav: entry.nav });
      if (results.length >= limit) break;
    }
  }
  return results;
}

export type SymbolSearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
};

const SYMBOL_SEARCH_TTL_MS = 5 * 60_000;
const symbolSearchCache = new Map<string, CacheEntry<SymbolSearchHit[]>>();

/**
 * Free-text search for stock/ETF tickers via Yahoo. `region` biases results:
 * "IN" prefers NSE/BSE listings; "US" filters out Indian listings; undefined
 * returns whatever Yahoo ranks highest.
 */
export async function searchSymbols(
  query: string,
  region: "US" | "IN" | undefined = undefined,
  limit = 10,
): Promise<SymbolSearchHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const cacheKey = `${region ?? "ANY"}|${q.toLowerCase()}`;
  const now = Date.now();
  const cached = symbolSearchCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.value;
  try {
    const result = (await (
      yahooFinance as unknown as {
        search: (
          q: string,
          opts?: { quotesCount?: number; newsCount?: number },
        ) => Promise<{
          quotes?: Array<Record<string, unknown>>;
        }>;
      }
    ).search(q, { quotesCount: 25, newsCount: 0 })) as {
      quotes?: Array<Record<string, unknown>>;
    };
    const allowedTypes = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX"]);
    const hits: SymbolSearchHit[] = [];
    for (const r of result.quotes ?? []) {
      const symbol = r.symbol as string | undefined;
      if (!symbol) continue;
      const quoteType = (r.quoteType as string | undefined) ?? "";
      if (!allowedTypes.has(quoteType)) continue;
      const isIndian = symbol.endsWith(".NS") || symbol.endsWith(".BO");
      if (region === "IN" && !isIndian) continue;
      if (region === "US" && isIndian) continue;
      hits.push({
        symbol,
        name:
          (r.longname as string | undefined) ??
          (r.shortname as string | undefined) ??
          symbol,
        exchange: (r.exchDisp as string | undefined) ?? "",
        quoteType,
      });
      if (hits.length >= limit) break;
    }
    symbolSearchCache.set(cacheKey, {
      value: hits,
      expires: now + SYMBOL_SEARCH_TTL_MS,
    });
    return hits;
  } catch (err) {
    console.error("[market] searchSymbols error:", err);
    return cached?.value ?? [];
  }
}

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
  const amfiCodes: string[] = [];
  const out: Quote[] = [];

  for (const sym of unique) {
    const cached = quoteCache.get(sym);
    if (cached && cached.expires > now) {
      out.push(cached.value);
    } else if (isAmfiSchemeCode(sym)) {
      amfiCodes.push(sym);
    } else {
      toFetch.push(sym);
    }
  }

  if (amfiCodes.length > 0) {
    try {
      const navMap = await getAmfiNavMap();
      for (const code of amfiCodes) {
        const entry = navMap.get(code);
        if (!entry) continue;
        const q: Quote = {
          symbol: code,
          price: entry.nav,
          currency: "INR",
          name: entry.schemeName,
          previousClose: entry.nav,
        };
        quoteCache.set(code, { value: q, expires: now + AMFI_QUOTE_TTL_MS });
        out.push(q);
      }
    } catch (err) {
      console.error("[market] AMFI quotes error:", err);
      for (const code of amfiCodes) {
        const stale = quoteCache.get(code);
        if (stale) out.push(stale.value);
      }
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
        const marketStateRaw = r.marketState as string | undefined;
        const marketState =
          marketStateRaw === "PRE" ||
          marketStateRaw === "PREPRE" ||
          marketStateRaw === "REGULAR" ||
          marketStateRaw === "POST" ||
          marketStateRaw === "POSTPOST" ||
          marketStateRaw === "CLOSED"
            ? marketStateRaw
            : undefined;
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
          marketState,
          preMarketPrice: r.preMarketPrice as number | undefined,
          preMarketChange: r.preMarketChange as number | undefined,
          preMarketChangePercent: r.preMarketChangePercent as number | undefined,
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

export type HistoryRange = "1d" | "5d" | "1m" | "1y" | "3y" | "5y";

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
  includePrePost?: boolean;
} {
  const now = new Date();
  if (range === "1d") {
    // Look back 7 days so we always capture the most recent session even
    // when today is a weekend / market holiday. We'll trim down to the last
    // session's bars in getHistory().
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { period1: start, interval: "5m", includePrePost: false };
  }
  if (range === "5d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { period1: start, interval: "30m" };
  }
  if (range === "1m") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { period1: start, interval: "1d" };
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

  // AMFI doesn't expose historical NAVs through the daily file — return empty.
  if (isAmfiSchemeCode(symbol)) {
    const empty: HistorySeries = { symbol, currency: "INR", points: [] };
    historyCache.set(cacheKey, { value: empty, expires: now + historyTtl(range) });
    return empty;
  }

  const { period1, interval, includePrePost } = rangeToParams(range);
  try {
    const result = (await yahooFinance.chart(symbol, {
      period1,
      interval,
      ...(includePrePost === false ? { includePrePost: false } : {}),
    } as unknown as Parameters<typeof yahooFinance.chart>[1])) as unknown as {
      meta?: {
        currency?: string;
        previousClose?: number;
        currentTradingPeriod?: {
          regular?: { start?: number; end?: number };
        };
      };
      quotes?: Array<{ date: Date | string; close: number | null }>;
    };
    let points: HistoryPoint[] = [];
    for (const q of result?.quotes ?? []) {
      if (q == null) continue;
      const close = q.close;
      if (typeof close !== "number") continue;
      const t = new Date(q.date).getTime();
      if (!Number.isFinite(t)) continue;
      points.push({ t, close });
    }
    // For the 1D view, trim the 7-day lookback down to just the most recent
    // trading session's bars so the chart reflects "one day" even on
    // weekends / holidays.
    if (range === "1d" && points.length > 0) {
      const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
      const lastKey = dayKey(points[points.length - 1].t);
      const lastDay = points.filter((p) => dayKey(p.t) === lastKey);
      // Baseline = prior session's close. Prefer Yahoo's meta.previousClose
      // (matches the quote endpoint's regularMarketPreviousClose exactly, so
      // the 1D delta in the chart matches the "today's P/L" in the header).
      // Fall back to the last 5m bar of the prior calendar day — Yahoo's
      // intraday bars often stop 5 min before the settlement close, so the
      // two values can differ slightly.
      let baselineClose: number | null = null;
      if (typeof result?.meta?.previousClose === "number") {
        baselineClose = result.meta.previousClose;
      } else {
        const prior = points.filter((p) => dayKey(p.t) !== lastKey);
        if (prior.length > 0) baselineClose = prior[prior.length - 1].close;
      }
      points = lastDay;
      const reg = result?.meta?.currentTradingPeriod?.regular;
      if (reg && typeof reg.start === "number" && typeof reg.end === "number") {
        const startMs = reg.start * 1000;
        const endMs = reg.end * 1000;
        const trimmed = points.filter((p) => p.t >= startMs && p.t <= endMs);
        if (trimmed.length > 0) points = trimmed;
      }
      if (baselineClose !== null && points.length > 0) {
        // Place the baseline one millisecond before the first session bar so
        // it sorts first but doesn't visibly extend the x-axis.
        points = [
          { t: points[0].t - 1, close: baselineClose },
          ...points,
        ];
      }
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

/**
 * Given a calendar day (any millisecond value within the session) and a
 * symbol, return the {start, end} of that day's regular trading session in
 * UTC ms. Used as a fallback when Yahoo's response omits
 * `currentTradingPeriod.regular`, which otherwise causes the sparkline to
 * stretch evenly across the whole width regardless of elapsed time.
 *
 * `.NS` / `.BO` → NSE / BSE: 9:15–15:30 IST (UTC+5:30).
 * Everything else falls back to NYSE/Nasdaq: 9:30–16:00 ET (UTC−4 in EDT,
 * UTC−5 in EST). We approximate the DST boundary using the standard
 * second-Sunday-of-March / first-Sunday-of-November rule rather than the
 * exact 2 AM cutover; sparkline accuracy doesn't need second-level precision.
 */
function deriveSessionBounds(
  symbol: string,
  withinDayMs: number,
): { start: number; end: number } {
  const sym = symbol.toUpperCase();
  if (sym.endsWith(".NS") || sym.endsWith(".BO")) {
    // IST is UTC+5:30, no DST. 9:15 IST = 3:45 UTC; 15:30 IST = 10:00 UTC.
    const d = new Date(withinDayMs);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    let day = d.getUTCDate();
    // Bars after 18:30 UTC roll into next IST calendar day; for 5m bars in
    // a 9:15–15:30 IST session that doesn't happen, but be defensive.
    if (d.getUTCHours() < 3 || (d.getUTCHours() === 3 && d.getUTCMinutes() < 45)) {
      // Bar is in the early morning UTC; previous IST calendar day.
      day -= 1;
    }
    const start = Date.UTC(y, m, day, 3, 45, 0);
    const end = Date.UTC(y, m, day, 10, 0, 0);
    return { start, end };
  }
  // US default. Determine EDT vs EST for the calendar day.
  const d = new Date(withinDayMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const offsetHrs = isUsDst(y, m, day) ? 4 : 5; // hours EAST to add to local→UTC
  // 9:30 ET = 9:30 + offset UTC; 16:00 ET = 16:00 + offset UTC.
  const start = Date.UTC(y, m, day, 9 + offsetHrs, 30, 0);
  const end = Date.UTC(y, m, day, 16 + offsetHrs, 0, 0);
  return { start, end };
}

function isUsDst(y: number, monthIdx: number, dayOfMonth: number): boolean {
  // 2nd Sunday in March → 1st Sunday in November.
  const startOfMarch = new Date(Date.UTC(y, 2, 1));
  const dstStartDay = 8 + ((7 - startOfMarch.getUTCDay()) % 7); // 8..14
  const startOfNov = new Date(Date.UTC(y, 10, 1));
  const dstEndDay = 1 + ((7 - startOfNov.getUTCDay()) % 7); // 1..7
  if (monthIdx < 2 || monthIdx > 10) return false;
  if (monthIdx > 2 && monthIdx < 10) return true;
  if (monthIdx === 2) return dayOfMonth >= dstStartDay;
  return dayOfMonth < dstEndDay;
}

export async function getIntraday(symbol: string): Promise<IntradaySeries> {
  const now = Date.now();
  const cached = intradayCache.get(symbol);
  if (cached && cached.expires > now) return cached.value;

  // AMFI mutual funds don't have intraday data — NAV publishes once per day.
  if (isAmfiSchemeCode(symbol)) {
    const empty: IntradaySeries = {
      symbol,
      currency: "INR",
      points: [],
      prevClose: null,
      sessionDate: null,
      sessionStart: null,
      sessionEnd: null,
    };
    intradayCache.set(symbol, { value: empty, expires: now + INTRADAY_TTL_MS });
    return empty;
  }

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
    let sessionStart =
      reg && typeof reg.start === "number" ? reg.start * 1000 : null;
    let sessionEnd =
      reg && typeof reg.end === "number" ? reg.end * 1000 : null;
    // Yahoo occasionally omits `currentTradingPeriod` (especially shortly
    // after open or for some Indian symbols). Without it, the sparkline
    // can't map x by time and ends up stretching across the full width.
    // Derive a sane fallback from known exchange hours so today-in-progress
    // charts visibly fill only the elapsed fraction.
    if (sessionStart === null || sessionEnd === null) {
      const within =
        points[points.length - 1]?.t ?? all[all.length - 1]?.t ?? now;
      const fallback = deriveSessionBounds(symbol, within);
      if (sessionStart === null) sessionStart = fallback.start;
      if (sessionEnd === null) sessionEnd = fallback.end;
    }
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
