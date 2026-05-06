import { Category } from "./types";

export type MarketStatus = {
  /** True if market is currently in regular-session hours. */
  isOpen: boolean;
  /** Timestamp (ms) of the next transition (open → close, or close → open). */
  nextChange: number;
  /** IANA time zone used for session boundaries. */
  tz: string;
  /** Short label like "NYSE" or "NSE". */
  exchange: string;
};

type ExchangeSpec = {
  tz: string;
  exchange: string;
  openHour: number; // local hour
  openMinute: number;
  closeHour: number;
  closeMinute: number;
};

const SPECS: Partial<Record<Category, ExchangeSpec>> = {
  US_STOCK: {
    tz: "America/New_York",
    exchange: "NYSE / NASDAQ",
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
  },
  INDIAN_STOCK: {
    tz: "Asia/Kolkata",
    exchange: "NSE / BSE",
    openHour: 9,
    openMinute: 15,
    closeHour: 15,
    closeMinute: 30,
  },
};

/**
 * Extract the calendar parts of `date` as seen in `tz`.
 * Avoids the pitfalls of Date's local-only getters.
 */
function partsInTz(
  date: Date,
  tz: string,
): { y: number; mo: number; d: number; h: number; mi: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour === "24" ? "0" : parts.hour),
    mi: Number(parts.minute),
    dow: dowMap[parts.weekday] ?? 0,
  };
}

/**
 * Convert a wall-clock time in `tz` (y/mo/d at h:mi) to a UTC timestamp.
 * Uses a two-pass correction to account for the zone's offset at that instant.
 */
function wallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
): number {
  // First guess: interpret as if it were UTC.
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  // See what that instant looks like in tz, then correct.
  const seen = partsInTz(new Date(guess), tz);
  const seenAsUtc = Date.UTC(seen.y, seen.mo - 1, seen.d, seen.h, seen.mi);
  const offset = seenAsUtc - guess; // tz is ahead of UTC by `offset` ms
  return guess - offset;
}

function isWeekday(dow: number): boolean {
  return dow >= 1 && dow <= 5;
}

export function getMarketStatus(
  category: Category,
  now: Date = new Date(),
): MarketStatus | null {
  const spec = SPECS[category];
  if (!spec) return null;
  const p = partsInTz(now, spec.tz);

  const todayOpen = wallClockToUtc(
    p.y,
    p.mo,
    p.d,
    spec.openHour,
    spec.openMinute,
    spec.tz,
  );
  const todayClose = wallClockToUtc(
    p.y,
    p.mo,
    p.d,
    spec.closeHour,
    spec.closeMinute,
    spec.tz,
  );
  const nowMs = now.getTime();

  if (isWeekday(p.dow) && nowMs >= todayOpen && nowMs < todayClose) {
    return {
      isOpen: true,
      nextChange: todayClose,
      tz: spec.tz,
      exchange: spec.exchange,
    };
  }

  // Market is closed. Find the next open.
  // Start from today (if before today's open on a weekday) or tomorrow.
  let cursor: Date;
  if (isWeekday(p.dow) && nowMs < todayOpen) {
    return {
      isOpen: false,
      nextChange: todayOpen,
      tz: spec.tz,
      exchange: spec.exchange,
    };
  }
  // Otherwise advance day-by-day until we hit a weekday.
  cursor = new Date(nowMs);
  for (let i = 0; i < 8; i++) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const cp = partsInTz(cursor, spec.tz);
    if (isWeekday(cp.dow)) {
      return {
        isOpen: false,
        nextChange: wallClockToUtc(
          cp.y,
          cp.mo,
          cp.d,
          spec.openHour,
          spec.openMinute,
          spec.tz,
        ),
        tz: spec.tz,
        exchange: spec.exchange,
      };
    }
  }
  return null;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Return the regular-session start/end (UTC ms) for the local calendar day
 * — in the exchange's timezone — that contains `withinDayMs`. Useful for
 * fixing X-axis domain on intraday charts so an in-progress session leaves
 * empty space to the right instead of stretching to fill.
 *
 * For symbols, prefer `sessionBoundsForSymbol` which routes by suffix.
 */
export function sessionBoundsForCategory(
  category: Category,
  withinDayMs: number,
): { start: number; end: number } | null {
  const spec = SPECS[category];
  if (!spec) return null;
  const p = partsInTz(new Date(withinDayMs), spec.tz);
  const start = wallClockToUtc(
    p.y,
    p.mo,
    p.d,
    spec.openHour,
    spec.openMinute,
    spec.tz,
  );
  const end = wallClockToUtc(
    p.y,
    p.mo,
    p.d,
    spec.closeHour,
    spec.closeMinute,
    spec.tz,
  );
  return { start, end };
}

/** As `sessionBoundsForCategory`, routed by Yahoo symbol suffix. */
export function sessionBoundsForSymbol(
  symbol: string,
  withinDayMs: number,
): { start: number; end: number } {
  const sym = symbol.toUpperCase();
  if (sym.endsWith(".NS") || sym.endsWith(".BO")) {
    return (
      sessionBoundsForCategory("INDIAN_STOCK", withinDayMs) ?? {
        start: withinDayMs,
        end: withinDayMs,
      }
    );
  }
  return (
    sessionBoundsForCategory("US_STOCK", withinDayMs) ?? {
      start: withinDayMs,
      end: withinDayMs,
    }
  );
}

