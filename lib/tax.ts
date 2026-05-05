import type { StockInvestment } from "./types";
import type { PriceMap } from "./valuation";
import { convert, nativeValue } from "./valuation";

/**
 * Tax classification for a stock holding. ST = short-term (held < 1 year),
 * LT = long-term (≥ 1 year). India and US treat them very differently, so
 * we tag the regime here too.
 */
export type TaxRegime = "INDIA" | "US";
export type TaxBucket = "ST" | "LT";

export type TaxRates = {
  /** India short-term capital gains on equity (listed). 20% from FY24-25. */
  inShortTermPct: number;
  /** India long-term capital gains on equity over the threshold. 12.5%. */
  inLongTermPct: number;
  /** India LTCG tax-free threshold per FY in INR. 1.25L. */
  inLongTermExemptInr: number;
  /** US short-term — defaults to ordinary income (assume 30%). User-tunable. */
  usShortTermPct: number;
  /** US long-term — assume 15% bracket by default. */
  usLongTermPct: number;
};

export const DEFAULT_TAX_RATES: TaxRates = {
  inShortTermPct: 0.2,
  inLongTermPct: 0.125,
  inLongTermExemptInr: 125000,
  usShortTermPct: 0.3,
  usLongTermPct: 0.15,
};

const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function regimeOf(stock: StockInvestment): TaxRegime {
  return stock.category === "INDIAN_STOCK" ? "INDIA" : "US";
}

export function bucketOf(stock: StockInvestment, asOf = Date.now()): TaxBucket {
  const created = Date.parse(stock.createdAt);
  if (!Number.isFinite(created)) return "ST";
  return asOf - created >= ONE_YEAR_MS ? "LT" : "ST";
}

/**
 * Holding-period tax projection for a single stock, computed in the holding's
 * native currency. Returns the unrealized gain (or loss) and a per-holding
 * tax estimate. Note: India's ₹1.25L LTCG exemption applies to the aggregate
 * LTCG across the FY, not per-holding — we apply it at the portfolio level
 * in `projectPortfolioTax`. Per-holding tax here is computed before the
 * exemption.
 */
export type HoldingTaxProjection = {
  symbol: string;
  regime: TaxRegime;
  bucket: TaxBucket;
  heldMs: number;
  qty: number;
  costNative: number;
  valueNative: number;
  gainNative: number;
  /** Tax in native currency, before any portfolio-level LTCG exemption. */
  taxNative: number;
  rate: number;
};

export function projectHoldingTax(
  stock: StockInvestment,
  prices: PriceMap,
  rates: TaxRates = DEFAULT_TAX_RATES,
  asOf = Date.now(),
): HoldingTaxProjection {
  const nv = nativeValue(stock, prices);
  const costNative = stock.avgCost * stock.quantity;
  const valueNative = nv.value;
  const gainNative = valueNative - costNative;
  const regime = regimeOf(stock);
  const bucket = bucketOf(stock, asOf);
  const heldMs = Math.max(0, asOf - Date.parse(stock.createdAt));
  let rate = 0;
  if (regime === "INDIA") {
    rate = bucket === "ST" ? rates.inShortTermPct : rates.inLongTermPct;
  } else {
    rate = bucket === "ST" ? rates.usShortTermPct : rates.usLongTermPct;
  }
  // Losses don't generate tax — they create harvestable carry-forward credit.
  const taxNative = gainNative > 0 ? gainNative * rate : 0;
  return {
    symbol: stock.symbol,
    regime,
    bucket,
    heldMs,
    qty: stock.quantity,
    costNative,
    valueNative,
    gainNative,
    taxNative,
    rate,
  };
}

export type PortfolioTaxProjection = {
  rows: Array<HoldingTaxProjection & { gainDisplay: number; taxDisplay: number }>;
  /** Aggregated LT/ST gains and losses, in display currency. */
  summary: {
    indiaSTGain: number;
    indiaSTLoss: number;
    indiaLTGain: number;
    indiaLTLoss: number;
    usSTGain: number;
    usSTLoss: number;
    usLTGain: number;
    usLTLoss: number;
  };
  /** Estimated tax if everything were sold today, in display currency. */
  totalTaxDisplay: number;
  /** India LTCG exemption applied (display ccy). */
  inLtcgExemptApplied: number;
  /** Harvestable losses (sum of negative gains by bucket × applicable rate). */
  harvestableTaxDisplay: number;
};

export function projectPortfolioTax(
  stocks: StockInvestment[],
  prices: PriceMap,
  usdInr: number,
  display: "INR" | "USD",
  rates: TaxRates = DEFAULT_TAX_RATES,
  asOf = Date.now(),
): PortfolioTaxProjection {
  const rows = stocks.map((s) => {
    const p = projectHoldingTax(s, prices, rates, asOf);
    return {
      ...p,
      gainDisplay: convert(p.gainNative, s.currency, display, usdInr),
      taxDisplay: convert(p.taxNative, s.currency, display, usdInr),
    };
  });

  const summary = {
    indiaSTGain: 0,
    indiaSTLoss: 0,
    indiaLTGain: 0,
    indiaLTLoss: 0,
    usSTGain: 0,
    usSTLoss: 0,
    usLTGain: 0,
    usLTLoss: 0,
  };
  for (const r of rows) {
    const g = r.gainDisplay;
    const isGain = g > 0;
    if (r.regime === "INDIA") {
      if (r.bucket === "ST") {
        if (isGain) summary.indiaSTGain += g;
        else summary.indiaSTLoss += -g;
      } else {
        if (isGain) summary.indiaLTGain += g;
        else summary.indiaLTLoss += -g;
      }
    } else {
      if (r.bucket === "ST") {
        if (isGain) summary.usSTGain += g;
        else summary.usSTLoss += -g;
      } else {
        if (isGain) summary.usLTGain += g;
        else summary.usLTLoss += -g;
      }
    }
  }

  // Apply India LTCG exemption in display currency.
  const exemptionDisplay = convert(
    rates.inLongTermExemptInr,
    "INR",
    display,
    usdInr,
  );
  const inLtcgNet = Math.max(0, summary.indiaLTGain - exemptionDisplay);
  const inLtcgExemptApplied = Math.min(summary.indiaLTGain, exemptionDisplay);

  const totalTaxDisplay =
    summary.indiaSTGain * rates.inShortTermPct +
    inLtcgNet * rates.inLongTermPct +
    summary.usSTGain * rates.usShortTermPct +
    summary.usLTGain * rates.usLongTermPct;

  // Harvestable: losses × rate that would otherwise apply (offsetting same-bucket gains).
  const harvestableTaxDisplay =
    summary.indiaSTLoss * rates.inShortTermPct +
    summary.indiaLTLoss * rates.inLongTermPct +
    summary.usSTLoss * rates.usShortTermPct +
    summary.usLTLoss * rates.usLongTermPct;

  return {
    rows,
    summary,
    totalTaxDisplay,
    inLtcgExemptApplied,
    harvestableTaxDisplay,
  };
}
