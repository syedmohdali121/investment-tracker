"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { Currency, Investment } from "@/lib/types";

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
  const [currency, setCurrencyState] = useState<Currency>("INR");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("display-currency");
    if (saved === "USD" || saved === "INR") setCurrencyState(saved);
    setHydrated(true);
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    if (hydrated) localStorage.setItem("display-currency", c);
  };
  const toggle = () => setCurrency(currency === "INR" ? "USD" : "INR");

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, toggle }}>
      {children}
    </CurrencyContext.Provider>
  );
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
        <CurrencyProvider>
          {children}
          <Toaster richColors position="top-right" theme="system" />
        </CurrencyProvider>
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

export function usePrices(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  return useQuery<{
    quotes: Array<{
      symbol: string;
      price: number;
      currency: "USD" | "INR";
      name?: string;
      change?: number;
      changePercent?: number;
      previousClose?: number;
    }>;
    asOf: string;
  }>({
    queryKey: ["quotes", key],
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error("Failed to load quotes");
      return res.json();
    },
  });
}

export function useFx() {
  return useQuery<{ usdInr: number; asOf: string }>({
    queryKey: ["fx"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/fx");
      if (!res.ok) throw new Error("Failed to load FX");
      return res.json();
    },
  });
}

export type HistoryRange = "1d" | "5d" | "1y" | "3y" | "5y";

export type IntradayPoint = { t: number; close: number };
export type IntradaySeries = {
  symbol: string;
  currency: "USD" | "INR";
  points: IntradayPoint[];
  prevClose: number | null;
  sessionDate: string | null;
};

export function useIntraday(symbols: string[]) {
  const key = [...symbols].sort().join(",");
  return useQuery<{ series: IntradaySeries[]; asOf: string }>({
    queryKey: ["intraday", key],
    enabled: symbols.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/intraday?symbols=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error("Failed to load intraday");
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
