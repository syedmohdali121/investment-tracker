"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { Currency, Investment, Transaction } from "@/lib/types";
import type { PriceEntry } from "@/lib/valuation";
import { SettingsProvider, useSettings } from "./settings-context";
import { CommandPaletteProvider } from "@/components/command-palette";
import { ShortcutsProvider } from "@/components/shortcuts-provider";

type CurrencyCtx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  toggle: () => void;
};
const CurrencyContext = createContext<CurrencyCtx | null>(null);

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}

function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const stored = useSyncExternalStore(
    subscribeDisplayCurrency,
    getDisplayCurrencySnapshot,
    getDisplayCurrencyServerSnapshot,
  );
  // localStorage is the source of truth when set; otherwise fall back to the
  // user's default currency from settings. Pure derivation — no setState in
  // an effect, so no cascading renders.
  const currency: Currency =
    stored === "USD" || stored === "INR" ? stored : settings.defaultCurrency;

  const setCurrency = useCallback((c: Currency) => {
    try {
      window.localStorage.setItem(DISPLAY_CURRENCY_KEY, c);
    } catch {
      // ignore
    }
    notifyDisplayCurrencyChanged();
  }, []);

  const toggle = useCallback(() => {
    setCurrency(currency === "INR" ? "USD" : "INR");
  }, [currency, setCurrency]);

  const value = useMemo(
    () => ({ currency, setCurrency, toggle }),
    [currency, setCurrency, toggle],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

// External store for `localStorage["display-currency"]`. See settings-context
// for the rationale for using `useSyncExternalStore` over useEffect+setState.
const DISPLAY_CURRENCY_KEY = "display-currency";
const displayCurrencyListeners = new Set<() => void>();
function notifyDisplayCurrencyChanged() {
  for (const l of displayCurrencyListeners) l();
}
function subscribeDisplayCurrency(cb: () => void): () => void {
  displayCurrencyListeners.add(cb);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", cb);
  }
  return () => {
    displayCurrencyListeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", cb);
    }
  };
}
function getDisplayCurrencySnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISPLAY_CURRENCY_KEY);
  } catch {
    return null;
  }
}
function getDisplayCurrencyServerSnapshot(): string | null {
  return null;
}

let queryClient: QueryClient | null = null;
function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  return queryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <SettingsProvider>
          <CurrencyProvider>
            <CommandPaletteProvider>
              <ShortcutsProvider>{children}</ShortcutsProvider>
            </CommandPaletteProvider>
            <Toaster richColors position="top-right" theme="system" />
          </CurrencyProvider>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// ---------- Shared hooks ----------

export function useInvestments() {
  return useQuery<{ investments: Investment[] }>({
    queryKey: ["investments"],
    queryFn: async () => {
      const res = await fetch("/api/investments");
      if (!res.ok) throw new Error("Failed to load investments");
      return res.json();
    },
  });
}

export function useTransactions(investmentId?: string) {
  return useQuery<{ transactions: Transaction[] }>({
    queryKey: ["transactions", investmentId ?? "all"],
    queryFn: async () => {
      const url = investmentId
        ? `/api/transactions?investmentId=${encodeURIComponent(investmentId)}`
        : "/api/transactions";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load transactions");
      return res.json();
    },
  });
}

export function usePrices(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  const { settings } = useSettings();
  const interval = settings.refreshInterval;
  return useQuery<{
    quotes: Array<
      PriceEntry & {
        symbol: string;
        name?: string;
        change?: number;
        changePercent?: number;
        preMarketChange?: number;
        postMarketChange?: number;
      }
    >;
    asOf: string;
  }>({
    queryKey: ["quotes", key],
    enabled: symbols.length > 0,
    refetchInterval: interval > 0 ? interval : false,
    queryFn: async () => {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error("Failed to load quotes");
      return res.json();
    },
  });
}

export function useFx() {
  const { settings } = useSettings();
  const interval = settings.refreshInterval;
  return useQuery<{ usdInr: number; asOf: string }>({
    queryKey: ["fx"],
    refetchInterval: interval > 0 ? interval : false,
    queryFn: async () => {
      const res = await fetch("/api/fx");
      if (!res.ok) throw new Error("Failed to load FX");
      return res.json();
    },
  });
}

export type HistoryRange = "1d" | "5d" | "1m" | "1y" | "3y" | "5y";

export type IntradayPoint = { t: number; close: number };
export type IntradaySeries = {
  symbol: string;
  currency: "USD" | "INR";
  points: IntradayPoint[];
  prevClose: number | null;
  sessionDate: string | null;
  sessionStart: number | null;
  sessionEnd: number | null;
};

export function useIntraday(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  const { settings } = useSettings();
  const interval = settings.refreshInterval;
  return useQuery<{ series: IntradaySeries[]; asOf: string }>({
    queryKey: ["intraday", key],
    enabled: symbols.length > 0,
    staleTime: Math.max(interval, 60_000),
    refetchInterval: interval > 0 ? interval : false,
    queryFn: async () => {
      const res = await fetch(
        `/api/intraday?symbols=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error("Failed to load intraday");
      return res.json();
    },
  });
}

export type DividendEvent = { t: number; amount: number };
export type DividendSeries = {
  symbol: string;
  currency: "USD" | "INR";
  events: DividendEvent[];
};

export function useDividends(symbols: string[], years = 5) {
  const key = [...symbols].sort().join(",");
  return useQuery<{ series: DividendSeries[]; years: number; asOf: string }>({
    queryKey: ["dividends", years, key],
    enabled: symbols.length > 0,
    staleTime: 6 * 60 * 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/dividends?symbols=${encodeURIComponent(key)}&years=${years}`,
      );
      if (!res.ok) throw new Error("Failed to load dividends");
      return res.json();
    },
  });
}

export type AssetProfile = {
  symbol: string;
  sector: string | null;
  industry: string | null;
  quoteType: string | null;
};

export function useProfiles(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  return useQuery<{ profiles: AssetProfile[]; asOf: string }>({
    queryKey: ["profiles", key],
    enabled: symbols.length > 0,
    staleTime: 24 * 60 * 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/profile?symbols=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error("Failed to load profiles");
      return res.json();
    },
  });
}

export function useHistory(symbols: string[], range: HistoryRange) {
  const key = [...symbols].sort().join(",");
  return useQuery<{
    series: Array<{
      symbol: string;
      currency: "USD" | "INR";
      points: Array<{ t: number; close: number }>;
    }>;
    range: HistoryRange;
    asOf: string;
  }>({
    queryKey: ["history", range, key],
    enabled: symbols.length > 0,
    staleTime:
      range === "1d" ? 60_000 : range === "5d" ? 5 * 60_000 : 10 * 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/history?symbols=${encodeURIComponent(key)}&range=${range}`,
      );
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });
}
