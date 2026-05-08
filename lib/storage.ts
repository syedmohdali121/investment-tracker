import { randomUUID } from "node:crypto";
import {
  InvestmentInput,
  InvestmentInputSchema,
  Investment,
  isStock,
} from "./types";
import { requireCurrentUserId } from "./user-context";
import { getDb } from "./db";

/**
 * SQLite-backed storage for the investments registry.
 *
 * The on-disk representation is a flat `investments` table with nullable
 * variant-specific columns; the discriminated union (`Stock` vs `Cash`) is
 * reconstructed at the boundary by `rowToInvestment`. Domain validation
 * stays in the Zod schemas in `lib/types.ts` — those are still authoritative
 * at the API boundary, the DB just stores bytes.
 */

type InvestmentRow = {
  id: string;
  user_id: string;
  category: string;
  symbol: string | null;
  quantity: number | null;
  avg_cost: number | null;
  label: string | null;
  balance: number | null;
  principal: number | null;
  interest_rate: number | null;
  maturity_date: string | null;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sort_index: number;
};

function rowToInvestment(r: InvestmentRow): Investment {
  if (
    r.category === "US_STOCK" ||
    r.category === "INDIAN_STOCK" ||
    r.category === "MUTUAL_FUND"
  ) {
    return {
      id: r.id,
      category: r.category as Investment["category"],
      symbol: r.symbol ?? "",
      quantity: r.quantity ?? 0,
      avgCost: r.avg_cost ?? 0,
      currency: r.currency as Investment["currency"],
      ...(r.notes ? { notes: r.notes } : {}),
      createdAt: r.created_at,
      ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
    } as Investment;
  }
  return {
    id: r.id,
    category: r.category as Investment["category"],
    label: r.label ?? "",
    balance: r.balance ?? 0,
    currency: r.currency as Investment["currency"],
    ...(r.principal != null ? { principal: r.principal } : {}),
    ...(r.interest_rate != null ? { interestRate: r.interest_rate } : {}),
    ...(r.maturity_date != null ? { maturityDate: r.maturity_date } : {}),
    ...(r.notes ? { notes: r.notes } : {}),
    createdAt: r.created_at,
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
  } as Investment;
}

/** Flattens an Investment into the DB row shape, including NULLs for the
 *  variant fields the row doesn't use. */
function investmentToParams(
  inv: Investment,
  userId: string,
  sortIndex: number,
): InvestmentRow {
  const base = {
    id: inv.id,
    user_id: userId,
    category: inv.category,
    currency: inv.currency,
    notes: inv.notes ?? null,
    created_at: inv.createdAt,
    updated_at: inv.updatedAt ?? inv.createdAt,
    sort_index: sortIndex,
  };
  if (isStock(inv)) {
    return {
      ...base,
      symbol: inv.symbol,
      quantity: inv.quantity,
      avg_cost: inv.avgCost,
      label: null,
      balance: null,
      principal: null,
      interest_rate: null,
      maturity_date: null,
    };
  }
  return {
    ...base,
    symbol: null,
    quantity: null,
    avg_cost: null,
    label: inv.label,
    balance: inv.balance,
    principal: inv.principal ?? null,
    interest_rate: inv.interestRate ?? null,
    maturity_date: inv.maturityDate ?? null,
  };
}

export async function listInvestments(): Promise<Investment[]> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM investments
       WHERE user_id = ?
       ORDER BY sort_index ASC, created_at ASC`,
    )
    .all(uid) as InvestmentRow[];
  return rows.map(rowToInvestment);
}

export async function addInvestment(input: unknown): Promise<Investment> {
  const uid = await requireCurrentUserId();
  const parsed = InvestmentInputSchema.parse(input) as InvestmentInput;
  const now = new Date().toISOString();
  // Honor a user-supplied purchase date so tax holding-period logic works
  // when backfilling old positions.
  const supplied = (parsed as { createdAt?: string }).createdAt;
  const createdAt =
    supplied && Number.isFinite(Date.parse(supplied))
      ? new Date(supplied).toISOString()
      : now;
  const inv = {
    ...parsed,
    id: randomUUID(),
    createdAt,
    updatedAt: now,
  } as Investment;

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO investments (
      id, user_id, category, symbol, quantity, avg_cost,
      label, balance, principal, interest_rate, maturity_date,
      currency, notes, created_at, updated_at, sort_index
    ) VALUES (
      @id, @user_id, @category, @symbol, @quantity, @avg_cost,
      @label, @balance, @principal, @interest_rate, @maturity_date,
      @currency, @notes, @created_at, @updated_at, @sort_index
    )
  `);
  const tx = db.transaction(() => {
    const max = db
      .prepare("SELECT MAX(sort_index) AS n FROM investments WHERE user_id = ?")
      .get(uid) as { n: number | null } | undefined;
    const next = (max?.n ?? -1) + 1;
    insert.run(investmentToParams(inv, uid, next));
  });
  tx();
  return inv;
}

export async function updateInvestment(
  id: string,
  patch: unknown,
): Promise<Investment | null> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM investments WHERE id = ? AND user_id = ?")
    .get(id, uid) as InvestmentRow | undefined;
  if (!row) return null;
  const current = rowToInvestment(row);
  const merged = { ...current, ...(patch as object) } as Investment;
  const validated = InvestmentInputSchema.parse({ ...merged });
  const suppliedCreatedAt = (validated as { createdAt?: string }).createdAt;
  const nextCreatedAt =
    suppliedCreatedAt && Number.isFinite(Date.parse(suppliedCreatedAt))
      ? new Date(suppliedCreatedAt).toISOString()
      : current.createdAt;
  const next = {
    ...current,
    ...validated,
    id: current.id,
    createdAt: nextCreatedAt,
    updatedAt: new Date().toISOString(),
  } as Investment;

  const params = investmentToParams(next, uid, row.sort_index);
  db.prepare(
    `UPDATE investments SET
       category = @category,
       symbol = @symbol,
       quantity = @quantity,
       avg_cost = @avg_cost,
       label = @label,
       balance = @balance,
       principal = @principal,
       interest_rate = @interest_rate,
       maturity_date = @maturity_date,
       currency = @currency,
       notes = @notes,
       created_at = @created_at,
       updated_at = @updated_at
     WHERE id = @id AND user_id = @user_id`,
  ).run(params);
  return next;
}

export async function deleteInvestment(id: string): Promise<boolean> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const result = db
    .prepare("DELETE FROM investments WHERE id = ? AND user_id = ?")
    .run(id, uid);
  return result.changes > 0;
}

export async function reorderInvestments(ids: string[]): Promise<boolean> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM investments WHERE user_id = ?")
    .all(uid) as Array<{ id: string }>;
  if (existing.length !== ids.length) return false;
  const have = new Set(existing.map((r) => r.id));
  if (ids.some((id) => !have.has(id))) return false;

  const update = db.prepare(
    "UPDATE investments SET sort_index = ? WHERE id = ? AND user_id = ?",
  );
  const tx = db.transaction(() => {
    ids.forEach((id, idx) => update.run(idx, id, uid));
  });
  tx();
  return true;
}

/**
 * Rewrite the derived fields (`quantity`, `avgCost`, `createdAt`) of a
 * stock holding after its transaction ledger changes. The transactions
 * module is the source of truth post-backfill; this keeps the legacy
 * "current state" record in sync for the rest of the app to consume.
 */
export async function applyDerivedHolding(
  investmentId: string,
  derived: { quantity: number; avgCost: number; firstBuyDate: string | null },
): Promise<Investment | null> {
  return applyDerivedHoldingInLock(investmentId, derived);
}

/**
 * Same as `applyDerivedHolding`, kept as a separate name so callers in
 * `transactions-storage.ts` that wrap their own `db.transaction(...)`
 * around the recompute keep reading naturally. With SQLite both functions
 * are functionally identical (each statement runs in its own implicit
 * transaction or in the caller-supplied one).
 */
export async function applyDerivedHoldingInLock(
  investmentId: string,
  derived: { quantity: number; avgCost: number; firstBuyDate: string | null },
): Promise<Investment | null> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM investments WHERE id = ? AND user_id = ?")
    .get(investmentId, uid) as InvestmentRow | undefined;
  if (!row) return null;
  if (row.category !== "US_STOCK" && row.category !== "INDIAN_STOCK") {
    return rowToInvestment(row);
  }
  const updatedAt = new Date().toISOString();
  const createdAt = derived.firstBuyDate ?? row.created_at;
  db.prepare(
    `UPDATE investments
       SET quantity = ?, avg_cost = ?, created_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    derived.quantity,
    derived.avgCost,
    createdAt,
    updatedAt,
    investmentId,
    uid,
  );
  return rowToInvestment({
    ...row,
    quantity: derived.quantity,
    avg_cost: derived.avgCost,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}
