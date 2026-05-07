"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Currency } from "@/lib/types";

export type RefreshInterval = 15_000 | 60_000 | 300_000 | 0;

export const REFRESH_OPTIONS: Array<{
  value: RefreshInterval;
  label: string;
  description: string;
}> = [
  { value: 15_000, label: "15 seconds", description: "Aggressive — good while trading" },
  { value: 60_000, label: "1 minute", description: "Balanced (default)" },
  { value: 300_000, label: "5 minutes", description: "Easy on the API" },
  { value: 0, label: "Manual", description: "Only when you press refresh" },
];

export type Settings = {
  defaultCurrency: Currency;
  refreshInterval: RefreshInterval;
  locale: string;
  compactNumbers: boolean;
  /**
   * When true, Today's P/L (per-row contribution and session deltas) uses
   * the active extended-session price (pre-market or after-hours) for the
   * "current" leg. Net worth, total P/L, and tax math always use the
   * regular-session price regardless of this setting.
   */
  extendedHoursPL: boolean;
};

const DEFAULTS: Settings = {
  defaultCurrency: "INR",
  refreshInterval: 60_000,
  locale: "en-IN",
  compactNumbers: false,
  extendedHoursPL: false,
};

const STORAGE_KEY = "portfolio-pulse:settings";

type Ctx = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings((s) => ({ ...s, ...parsed }));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        if (hydrated) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [hydrated],
  );

  const reset = useCallback(() => {
    setSettings(DEFAULTS);
    if (hydrated) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [hydrated]);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}
