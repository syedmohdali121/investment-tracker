import type { StockInvestment, Transaction } from "./types";

/**
 * FIFO cost-basis lot. Each BUY pushes a lot; each SELL drains lots in
 * arrival order.
 */
export type Lot = { qty: number; costPerShare: number; openDate: string };

export type RealizedSale = {
  saleDate: string;
  qty: number;
  proceedsPerShare: number;
  costPerShare: number;
  lotOpenDate: string;
  realized: number; // proceeds - cost (per total qty)
};

export type DerivedHolding = {
  /** Net shares held after applying all BUYs and SELLs. */
  quantity: number;
  /**
   * Weighted-average cost per share for the *remaining* (unsold) lots. For
   * a holding that has never been sold this equals the simple weighted
   * average of all BUY prices (incl. fees). After a SELL it reflects only
   * what's still held under FIFO.
   */
  avgCost: number;
  /** Date of the earliest BUY transaction, or null if no buys. */
  firstBuyDate: string | null;
  /** Lots remaining after all sales (FIFO). */
  openLots: Lot[];
  /** All realized sales, derived for tax / P&L reporting. */
  realized: RealizedSale[];
  /** Total realized P/L in native currency (sum of realized.realized). */
  realizedTotal: number;
  /** Sum of dividends paid (native ccy). */
  dividendTotal: number;
  /** Sum of standalone fees charged (native ccy). */
  feeTotal: number;
};

/**
 * Reduce a list of transactions for a single investment to a derived
 * holding using FIFO cost-basis. Transactions are processed in date order;
 * ties broken by their `id` (stable). Negative-quantity oversells are
 * silently capped to the available qty so the math never blows up — the
 * UI can warn about this separately.
 */
export function deriveFromTransactions(txs: Transaction[]): DerivedHolding {
  const sorted = [...txs].sort((a, b) => {
    const da = Date.parse(a.date);
    const db = Date.parse(b.date);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });

  const lots: Lot[] = [];
  const realized: RealizedSale[] = [];
  let firstBuyDate: string | null = null;
  let dividendTotal = 0;
  let feeTotal = 0;

  for (const t of sorted) {
    switch (t.type) {
      case "BUY": {
        if (t.quantity <= 0) continue;
        const totalCost = t.quantity * t.price + (t.fees ?? 0);
        const costPerShare = totalCost / t.quantity;
        lots.push({ qty: t.quantity, costPerShare, openDate: t.date });
        if (firstBuyDate === null || Date.parse(t.date) < Date.parse(firstBuyDate)) {
          firstBuyDate = t.date;
        }
        break;
      }
      case "SELL": {
        let remaining = t.quantity;
        // SELL fees reduce proceeds proportionally across the lots drained.
        const proceedsPerShare = t.price - (t.fees ?? 0) / Math.max(t.quantity, 1e-12);
        while (remaining > 1e-12 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(lot.qty, remaining);
          const r: RealizedSale = {
            saleDate: t.date,
            qty: take,
            proceedsPerShare,
            costPerShare: lot.costPerShare,
            lotOpenDate: lot.openDate,
            realized: take * (proceedsPerShare - lot.costPerShare),
          };
          realized.push(r);
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-9) lots.shift();
        }
        // If user oversold, ignore the excess.
        break;
      }
      case "DIVIDEND":
        dividendTotal += t.price; // price field carries the cash amount
        break;
      case "FEE":
        feeTotal += t.price;
        break;
    }
  }

  const remainingQty = lots.reduce((s, l) => s + l.qty, 0);
  const remainingCost = lots.reduce((s, l) => s + l.qty * l.costPerShare, 0);
  const avgCost = remainingQty > 0 ? remainingCost / remainingQty : 0;
  const realizedTotal = realized.reduce((s, r) => s + r.realized, 0);

  return {
    quantity: round(remainingQty, 8),
    avgCost: round(avgCost, 6),
    firstBuyDate,
    openLots: lots,
    realized,
    realizedTotal,
    dividendTotal,
    feeTotal,
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/**
 * Build a synthetic initial BUY transaction representing a stock holding
 * that pre-dates the transaction ledger. Used during one-time backfill so
 * existing investments don't lose their cost basis.
 */
export function syntheticInitialBuy(
  inv: StockInvestment,
  newId: string,
): Transaction {
  return {
    id: newId,
    investmentId: inv.id,
    type: "BUY",
    date: inv.createdAt,
    quantity: inv.quantity,
    price: inv.avgCost,
    fees: 0,
    currency: inv.currency,
    notes: "Initial position (auto-backfilled from existing holding)",
    createdAt: inv.createdAt,
    updatedAt: inv.createdAt,
  };
}
