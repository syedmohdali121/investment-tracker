import { randomUUID } from "node:crypto";
import {
  isStock,
  Transaction,
  TransactionInput,
  TransactionInputSchema,
} from "./types";
import { applyDerivedHoldingInLock } from "./storage";
import { deriveFromTransactions } from "./transactions";
import { requireCurrentUserId } from "./user-context";
import { getDb } from "./db";

/**
 * SQLite-backed transaction ledger.
 *
 * Each mutation that affects the derived holding state (BUY/SELL on a
 * stock) wraps its INSERT/UPDATE/DELETE plus the recompute in a single
 * `db.transaction(...)` so the transaction row and the derived
 * `investments.quantity` / `avg_cost` always commit (or roll back) together.
 *
 * The synthetic-buy backfill that the JSON storage did lazily on first read
 * has been retired. It can be reintroduced as part of the JSON → SQLite
 * import (`lib/db.ts`) if any user upgrades with stocks that have no
 * transactions yet.
 */

type TransactionRow = {
  id: string;
  user_id: string;
  investment_id: string;
  type: string;
  date: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    investmentId: r.investment_id,
    type: r.type as Transaction["type"],
    date: r.date,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    currency: r.currency as Transaction["currency"],
    ...(r.notes ? { notes: r.notes } : {}),
    createdAt: r.created_at,
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
  };
}

export async function listTransactions(
  filter?: { investmentId?: string },
): Promise<Transaction[]> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const rows = filter?.investmentId
    ? (db
        .prepare(
          `SELECT * FROM transactions
           WHERE user_id = ? AND investment_id = ?
           ORDER BY date DESC`,
        )
        .all(uid, filter.investmentId) as TransactionRow[])
    : (db
        .prepare(
          `SELECT * FROM transactions
           WHERE user_id = ?
           ORDER BY date DESC`,
        )
        .all(uid) as TransactionRow[]);
  return rows.map(rowToTransaction);
}

/**
 * Recompute and write the derived holding fields for `investmentId` from
 * its full transaction history. Must be called from inside a
 * `db.transaction(...)` block so the txn write and the derived rewrite
 * commit together.
 */
async function recomputeHolding(
  uid: string,
  investmentId: string,
): Promise<void> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM transactions
       WHERE user_id = ? AND investment_id = ?`,
    )
    .all(uid, investmentId) as TransactionRow[];
  if (rows.length === 0) return;
  const derived = deriveFromTransactions(rows.map(rowToTransaction));
  await applyDerivedHoldingInLock(investmentId, {
    quantity: derived.quantity,
    avgCost: derived.avgCost,
    firstBuyDate: derived.firstBuyDate,
  });
}

export async function addTransaction(input: unknown): Promise<Transaction> {
  const uid = await requireCurrentUserId();
  const parsed = TransactionInputSchema.parse(input) as TransactionInput;
  const db = getDb();

  const invRow = db
    .prepare("SELECT id, category FROM investments WHERE id = ? AND user_id = ?")
    .get(parsed.investmentId, uid) as
    | { id: string; category: Transaction["currency"] | string }
    | undefined;
  if (!invRow) throw new Error("Investment not found");
  // Reuse `isStock` semantics: only stock-shaped categories get a ledger.
  const isStockCategory =
    invRow.category === "US_STOCK" ||
    invRow.category === "INDIAN_STOCK" ||
    invRow.category === "MUTUAL_FUND";
  if (!isStockCategory) {
    // Defensive — `isStock` is also used elsewhere; mirror its message.
    void isStock; // imported for parity with the previous module
    throw new Error("Transactions are only supported for stocks");
  }

  const now = new Date().toISOString();
  const tx: Transaction = {
    ...parsed,
    fees: parsed.fees ?? 0,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  const insert = db.prepare(`
    INSERT INTO transactions (
      id, user_id, investment_id, type, date, quantity, price, fees,
      currency, notes, created_at, updated_at
    ) VALUES (
      @id, @user_id, @investment_id, @type, @date, @quantity, @price, @fees,
      @currency, @notes, @created_at, @updated_at
    )
  `);

  // Derived recompute reads back from the same DB; wrap both in one tx so
  // a partial failure rolls everything back.
  const work = db.transaction(() => {
    insert.run({
      id: tx.id,
      user_id: uid,
      investment_id: tx.investmentId,
      type: tx.type,
      date: tx.date,
      quantity: tx.quantity,
      price: tx.price,
      fees: tx.fees,
      currency: tx.currency,
      notes: tx.notes ?? null,
      created_at: tx.createdAt,
      updated_at: tx.updatedAt ?? tx.createdAt,
    });
  });
  work();
  await recomputeHolding(uid, tx.investmentId);
  return tx;
}

export async function updateTransaction(
  id: string,
  patch: unknown,
): Promise<Transaction | null> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?")
    .get(id, uid) as TransactionRow | undefined;
  if (!row) return null;
  const current = rowToTransaction(row);
  const merged = { ...current, ...(patch as object) };
  const validated = TransactionInputSchema.parse({ ...merged });
  const next: Transaction = {
    ...current,
    ...validated,
    fees: validated.fees ?? current.fees ?? 0,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const update = db.prepare(`
    UPDATE transactions SET
      investment_id = @investment_id,
      type = @type,
      date = @date,
      quantity = @quantity,
      price = @price,
      fees = @fees,
      currency = @currency,
      notes = @notes,
      updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `);

  const work = db.transaction(() => {
    update.run({
      id: next.id,
      user_id: uid,
      investment_id: next.investmentId,
      type: next.type,
      date: next.date,
      quantity: next.quantity,
      price: next.price,
      fees: next.fees,
      currency: next.currency,
      notes: next.notes ?? null,
      updated_at: next.updatedAt ?? next.createdAt,
    });
  });
  work();

  await recomputeHolding(uid, next.investmentId);
  if (current.investmentId !== next.investmentId) {
    // Reattaching a transaction is rare but cheap to handle; the old
    // holding's derived state needs a refresh too.
    await recomputeHolding(uid, current.investmentId);
  }
  return next;
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const row = db
    .prepare("SELECT investment_id FROM transactions WHERE id = ? AND user_id = ?")
    .get(id, uid) as { investment_id: string } | undefined;
  if (!row) return false;
  const result = db
    .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
    .run(id, uid);
  if (result.changes === 0) return false;
  await recomputeHolding(uid, row.investment_id);
  return true;
}
