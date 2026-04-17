import type { InsightRule } from "./types";
import {
  aggregateByCategory,
  costIn,
  netWorth,
  valueIn,
} from "../valuation";
import { CATEGORY_META, isStock } from "../types";
import { argMax, cagr, hhi, humanDuration, maxDrawdown } from "../analytics";
import { formatCurrency } from "../format";

export const concentrationRule: InsightRule = ({
  investments,
  prices,
  usdInr,
  display,
}) => {
  if (investments.length < 2) return null;
  const values = investments.map((i) => valueIn(i, prices, usdInr, display));
  const score = hhi(values);
  const label =
    score < 1500 ? "Diversified" : score < 2500 ? "Balanced" : "Concentrated";
  const severity =
    score < 1500 ? "positive" : score < 2500 ? "info" : "warning";
  return {
    id: "concentration",
    section: "composition",
    severity,
    title: `${label} portfolio`,
    body: `Your concentration score is ${Math.round(score)} (HHI). Under 1500 is diversified, 1500–2500 balanced, above that concentrated.`,
    value: { amount: Math.round(score), format: "number" },
    meta: { score: score / 10000 },
  };
};

export const currencyExposureRule: InsightRule = ({
  investments,
  prices,
  usdInr,
  display,
}) => {
  if (investments.length === 0) return null;
  let usd = 0;
  let inr = 0;
  for (const inv of investments) {
    const v = valueIn(inv, prices, usdInr, "INR");
    if (inv.currency === "USD") usd += v;
    else inr += v;
  }
  const total = usd + inr;
  if (total === 0) return null;
  const usdPct = (usd / total) * 100;
  const fxImpactInr = usd * 0.01;
  const fxImpactDisplay = display === "INR" ? fxImpactInr : fxImpactInr / usdInr;
  return {
    id: "currency-exposure",
    section: "composition",
    severity: "info",
    title: "Currency exposure",
    body: `${usdPct.toFixed(1)}% USD-denominated, ${(100 - usdPct).toFixed(1)}% INR. A 1% INR depreciation changes your net worth by about ${formatCurrency(fxImpactDisplay, display)}.`,
    value: { amount: usdPct, suffix: "%", format: "percent" },
  };
};

export const topCategoryRule: InsightRule = ({
  investments,
  prices,
  usdInr,
  display,
}) => {
  const agg = aggregateByCategory(investments, prices, usdInr, display);
  if (agg.length === 0) return null;
  const total = netWorth(investments, prices, usdInr, display);
  const top = argMax(agg, (a) => a.value);
  if (!top || total === 0) return null;
  const pct = (top.value / total) * 100;
  return {
    id: `top-category-${top.category}`,
    section: "composition",
    severity: "info",
    title: `${CATEGORY_META[top.category].label} leads`,
    body: `${CATEGORY_META[top.category].label} makes up ${pct.toFixed(1)}% of your portfolio, valued at ${formatCurrency(top.value, display)}.`,
    value: { amount: pct, suffix: "%", format: "percent" },
    meta: { category: top.category, score: pct / 100 },
  };
};

export const biggestWinnerRule: InsightRule = ({
  investments,
  prices,
  usdInr,
  display,
}) => {
  const rows = investments
    .filter(isStock)
    .map((inv) => {
      const value = valueIn(inv, prices, usdInr, display);
      const cost = costIn(inv, usdInr, display);
      if (cost == null || cost <= 0) return null;
      return { inv, pl: value - cost, plPct: (value - cost) / cost };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const top = argMax(rows, (r) => r.plPct);
  if (!top || top.plPct <= 0) return null;
  return {
    id: `winner-${top.inv.id}`,
    section: "performance",
    severity: "positive",
    title: `${top.inv.symbol} is your biggest winner`,
    body: `Up ${(top.plPct * 100).toFixed(1)}% — an unrealized gain of ${formatCurrency(top.pl, display)}.`,
    value: { amount: top.plPct * 100, suffix: "%", format: "percent" },
    meta: { symbol: top.inv.symbol, score: top.plPct },
  };
};

export const biggestLoserRule: InsightRule = ({
  investments,
  prices,
  usdInr,
  display,
}) => {
  const rows = investments
    .filter(isStock)
    .map((inv) => {
      const value = valueIn(inv, prices, usdInr, display);
      const cost = costIn(inv, usdInr, display);
      if (cost == null || cost <= 0) return null;
      return { inv, pl: value - cost, plPct: (value - cost) / cost };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const worst = argMax(rows, (r) => -r.plPct);
  if (!worst || worst.plPct >= 0) return null;
  return {
    id: `loser-${worst.inv.id}`,
    section: "performance",
    severity: "negative",
    title: `${worst.inv.symbol} is under water`,
    body: `Down ${(worst.plPct * 100).toFixed(1)}% — an unrealized loss of ${formatCurrency(Math.abs(worst.pl), display)}.`,
    value: { amount: worst.plPct * 100, suffix: "%", format: "percent" },
    meta: { symbol: worst.inv.symbol, score: -worst.plPct },
  };
};

export const todayMoverRule: InsightRule = ({ investments, prices }) => {
  const rows = investments.filter(isStock).map((inv) => {
    const prev = prices[inv.symbol]?.previousClose;
    const now = prices[inv.symbol]?.price;
    if (prev == null || now == null || prev <= 0) return null;
    return { inv, pct: (now - prev) / prev, abs: (now - prev) * inv.quantity };
  });
  const filtered = rows.filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );
  const big = argMax(filtered, (r) => Math.abs(r.pct));
  if (!big || Math.abs(big.pct) < 0.01) return null;
  const up = big.pct >= 0;
  return {
    id: `mover-${big.inv.id}`,
    section: "performance",
    severity: up ? "positive" : "negative",
    title: `${big.inv.symbol} is today's biggest ${up ? "gainer" : "mover"}`,
    body: `${up ? "+" : ""}${(big.pct * 100).toFixed(2)}% today. That's ${up ? "added" : "cost"} roughly ${formatCurrency(Math.abs(big.abs), big.inv.currency)} to your position.`,
    value: { amount: big.pct * 100, suffix: "%", format: "percent" },
    meta: { symbol: big.inv.symbol, score: Math.abs(big.pct) },
  };
};

export const holdingAgeRule: InsightRule = ({
  investments,
  now = new Date(),
}) => {
  if (investments.length === 0) return null;
  const oldest = argMax(investments, (i) => -new Date(i.createdAt).getTime());
  if (!oldest) return null;
  const age = humanDuration(
    now.getTime() - new Date(oldest.createdAt).getTime(),
  );
  const label = isStock(oldest) ? oldest.symbol : oldest.label;
  return {
    id: `age-${oldest.id}`,
    section: "fact",
    severity: "info",
    title: "Your longest-held position",
    body: `You've been holding ${label} for ${age}.`,
  };
};

export const drawdownRule: InsightRule = ({ history }) => {
  if (!history) return null;
  let worst: { symbol: string; pct: number } | null = null;
  for (const [symbol, series] of Object.entries(history)) {
    if (!series.points || series.points.length < 10) continue;
    const { pct } = maxDrawdown(series.points);
    if (pct < (worst?.pct ?? 0)) worst = { symbol, pct };
  }
  if (!worst || worst.pct > -0.05) return null;
  return {
    id: `drawdown-${worst.symbol}`,
    section: "growth",
    severity: "warning",
    title: `${worst.symbol} has the deepest drawdown`,
    body: `Over the last 5 years it drew down ${(worst.pct * 100).toFixed(1)}% peak-to-trough.`,
    value: { amount: worst.pct * 100, suffix: "%", format: "percent" },
    meta: { symbol: worst.symbol, score: -worst.pct },
  };
};

export const cagrRule: InsightRule = ({ history }) => {
  if (!history) return null;
  const rows: { symbol: string; cagr: number; years: number }[] = [];
  for (const [symbol, series] of Object.entries(history)) {
    const pts = series.points;
    if (!pts || pts.length < 2) continue;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const years = (last.t - first.t) / (365.25 * 24 * 60 * 60 * 1000);
    const c = cagr(first.close, last.close, years);
    if (c != null) rows.push({ symbol, cagr: c, years });
  }
  const best = argMax(rows, (r) => r.cagr);
  if (!best || best.cagr <= 0) return null;
  return {
    id: `cagr-${best.symbol}`,
    section: "growth",
    severity: "positive",
    title: `${best.symbol} has compounded the fastest`,
    body: `A CAGR of ${(best.cagr * 100).toFixed(1)}% over the last ${best.years.toFixed(1)} years.`,
    value: { amount: best.cagr * 100, suffix: "%", format: "percent" },
    meta: { symbol: best.symbol, score: best.cagr },
  };
};

export const epfProjectionRule: InsightRule = ({
  investments,
  display,
  usdInr,
}) => {
  const cash = investments.filter(
    (i) => i.category === "EPF" || i.category === "PPF",
  );
  if (cash.length === 0) return null;
  const withRates = cash.filter(
    (i): i is typeof i & { interestRate: number } =>
      typeof (i as { interestRate?: number }).interestRate === "number",
  );
  if (withRates.length === 0) return null;
  const acct = argMax(withRates, (a) => a.interestRate);
  if (!acct || acct.category === "US_STOCK" || acct.category === "INDIAN_STOCK")
    return null;
  const years = 10;
  const future =
    (acct as { balance: number }).balance *
    Math.pow(1 + acct.interestRate / 100, years);
  const displayFuture = display === "INR" ? future : future / usdInr;
  const label = (acct as { label: string }).label;
  return {
    id: `epf-projection-${acct.id}`,
    section: "projection",
    severity: "info",
    title: `${label} in ${years} years`,
    body: `Compounding at ${acct.interestRate}% p.a., your ${label} balance would grow to roughly ${formatCurrency(displayFuture, display)}.`,
    value: { amount: displayFuture, currency: display, format: "currency" },
    meta: { category: acct.category, score: acct.interestRate / 100 },
  };
};

export const ALL_RULES = [
  concentrationRule,
  currencyExposureRule,
  topCategoryRule,
  biggestWinnerRule,
  biggestLoserRule,
  todayMoverRule,
  holdingAgeRule,
  drawdownRule,
  cagrRule,
  epfProjectionRule,
];
