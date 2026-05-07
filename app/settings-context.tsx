"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
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

// External store for `localStorage[STORAGE_KEY]`. Using `useSyncExternalStore`
// here (instead of useEffect+setState) avoids the `react-hooks/set-state-in-effect`
// lint warning, gives correct SSR snapshots, and propagates changes across tabs
// via the native `storage` event. Same-tab writes notify via an in-memory
// listener set because browsers don't fire `storage` for the originating tab.
const storeListeners = new Set<() => void>();
function notifySettingsChanged() {
  for (const l of storeListeners) l();
}
function subscribeSettings(cb: () => void): () => void {
  storeListeners.add(cb);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", cb);
  }
  return () => {
    storeListeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", cb);
    }
  };
}
function getSettingsSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function getSettingsServerSnapshot(): string | null {
  return null;
}

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
  const raw = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getSettingsServerSnapshot,
  );

  const settings = useMemo<Settings>(() => {
    if (!raw) return DEFAULTS;
    try {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return DEFAULTS;
    }
  }, [raw]);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const next = { ...settings, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore (private mode, quota, etc.)
      }
      notifySettingsChanged();
    },
    [settings],
  );

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    notifySettingsChanged();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}
