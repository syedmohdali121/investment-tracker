import type { Category, Currency, Investment } from "../types";
import type { PriceMap } from "../valuation";
import type { HistorySeries, IntradaySeries } from "../market";

export type InsightSeverity = "info" | "positive" | "negative" | "warning";

export type InsightSection =
  | "composition"
  | "performance"
  | "growth"
  | "projection"
  | "fact";

export type Insight = {
  id: string;
  section: InsightSection;
  severity: InsightSeverity;
  title: string;
  body: string;
  value?: {
    amount: number;
    currency?: Currency;
    suffix?: string;
    format?: "currency" | "percent" | "number";
  };
  meta?: {
    category?: Category;
    symbol?: string;
    score?: number;
  };
};

export type InsightContext = {
  investments: Investment[];
  prices: PriceMap;
  usdInr: number;
  display: Currency;
  history?: Record<string, HistorySeries>;
  intraday?: Record<string, IntradaySeries>;
  now?: Date;
};

export type InsightRule = (ctx: InsightContext) => Insight | Insight[] | null;
