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

// ---- Transactions -----------------------------------------------------------

export const TRANSACTION_TYPES = ["BUY", "SELL", "DIVIDEND", "FEE"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * A single ledger entry against a stock investment. The investment's
 * derived quantity / avgCost / createdAt are recomputed from these whenever
 * any transaction changes.
 *
 * - BUY: increases quantity by `quantity`, adds `quantity * price + fees` to
 *   the FIFO cost-basis lots.
 * - SELL: decreases quantity (FIFO); produces realized P/L derived elsewhere.
 * - DIVIDEND: records cash income; doesn't affect quantity/cost basis.
 * - FEE: records a standalone fee/charge; doesn't affect quantity/cost basis.
 *
 * `price` is in the investment's native currency. `quantity` may be
 * fractional. `date` is an ISO timestamp (UTC) but in practice we only care
 * about the calendar day for tax bucketing.
 */
export const TransactionSchema = z.object({
  id: z.string(),
  investmentId: z.string(),
  type: z.enum(TRANSACTION_TYPES),
  date: z.string(),
  /** Shares for BUY/SELL; ignored for DIVIDEND/FEE. */
  quantity: z.number().nonnegative(),
  /** Per-share price for BUY/SELL; total amount for DIVIDEND/FEE. */
  price: z.number().nonnegative(),
  /** Optional fees / commissions, in native currency. */
  fees: z.number().nonnegative().default(0),
  currency: CurrencySchema,
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionInputSchema = TransactionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // fees is required in the stored shape (default 0) but optional on input.
  fees: z.number().nonnegative().optional(),
  // notes is optional.
  notes: z.string().optional(),
});
export type TransactionInput = z.infer<typeof TransactionInputSchema>;

export const TransactionStoreSchema = z.object({
  transactions: z.array(TransactionSchema),
  updatedAt: z.string(),
});
export type TransactionStore = z.infer<typeof TransactionStoreSchema>;

