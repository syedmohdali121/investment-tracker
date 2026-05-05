import { z } from "zod";

export const CATEGORIES = ["US_STOCK", "INDIAN_STOCK", "EPF", "PPF"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<
  Category,
  { label: string; color: string; short: string }
> = {
  US_STOCK: { label: "US Stocks", color: "#6366f1", short: "US" },
  INDIAN_STOCK: { label: "Indian Stocks", color: "#10b981", short: "IN" },
  EPF: { label: "EPF", color: "#f59e0b", short: "EPF" },
  PPF: { label: "PPF", color: "#ec4899", short: "PPF" },
};

export const CurrencySchema = z.enum(["USD", "INR"]);
export type Currency = z.infer<typeof CurrencySchema>;

const BaseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  notes: z.string().optional(),
});

export const StockInvestmentSchema = BaseSchema.extend({
  category: z.enum(["US_STOCK", "INDIAN_STOCK"]),
  symbol: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  quantity: z.number().positive(),
  avgCost: z.number().nonnegative(),
  currency: CurrencySchema,
});

export const CashInvestmentSchema = BaseSchema.extend({
  category: z.enum(["EPF", "PPF"]),
  label: z.string().min(1),
  balance: z.number().nonnegative(),
  currency: z.literal("INR"),
  principal: z.number().nonnegative().optional(),
  interestRate: z.number().nonnegative().optional(),
});

export const InvestmentSchema = z.discriminatedUnion("category", [
  StockInvestmentSchema,
  CashInvestmentSchema,
]);

export type Investment = z.infer<typeof InvestmentSchema>;
export type StockInvestment = z.infer<typeof StockInvestmentSchema>;
export type CashInvestment = z.infer<typeof CashInvestmentSchema>;

// Input schemas for create (no id/timestamps; createdAt is optional so
// callers can backdate the purchase — important for accurate ST/LT tax
// classification).
export const StockInvestmentInputSchema = StockInvestmentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({ createdAt: z.string().optional() });
export const CashInvestmentInputSchema = CashInvestmentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({ createdAt: z.string().optional() });
export const InvestmentInputSchema = z.discriminatedUnion("category", [
  StockInvestmentInputSchema,
  CashInvestmentInputSchema,
]);
export type InvestmentInput = z.infer<typeof InvestmentInputSchema>;

export const StoreSchema = z.object({
  investments: z.array(InvestmentSchema),
  updatedAt: z.string(),
});
export type Store = z.infer<typeof StoreSchema>;

export function isStock(inv: Investment): inv is StockInvestment {
  return inv.category === "US_STOCK" || inv.category === "INDIAN_STOCK";
}
