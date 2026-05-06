import type { Currency } from "./types";

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number, currency: Currency): string {
  if (!Number.isFinite(amount)) return "—";
  return currency === "INR"
    ? INR_FORMATTER.format(amount)
    : USD_FORMATTER.format(amount);
}

export function formatCompact(amount: number, currency: Currency): string {
  if (!Number.isFinite(amount)) return "—";
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Currency formatter that automatically switches to compact notation when the
 * value crosses a readability threshold.
 *   - INR: ≥ ₹1,000  renders as "₹2.5K" / "₹1.2L" / "₹3.4Cr"
 *   - USD: ≥ $10,000 renders as "$12K" / "$1.2M"
 * Below the threshold we keep the full grouped number so small values stay
 * exact. Pass an explicit `threshold` to override per-caller.
 */
export function formatCurrencySmart(
  amount: number,
  currency: Currency,
  threshold?: number,
): string {
  if (!Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  const t = threshold ?? (currency === "INR" ? 1_000 : 10_000);
  if (abs >= t) return formatCompact(amount, currency);
  return formatCurrency(amount, currency);
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Formats a quantity with up to `maxDigits` decimals but strips trailing
 * zeros — so `852` stays `852`, `1.5` stays `1.5`, `0.0123` stays `0.0123`.
 */
export function formatQuantity(value: number, maxDigits = 4): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  }).format(value);
}
