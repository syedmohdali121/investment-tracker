import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  isStock,
  Transaction,
  TransactionInput,
  TransactionInputSchema,
  TransactionStore,
  TransactionStoreSchema,
} from "./types";
import { applyDerivedHolding, listInvestments } from "./storage";
import { deriveFromTransactions, syntheticInitialBuy } from "./transactions";
import { requireCurrentUserId } from "./user-context";
import { userDataDir } from "./users";

async function dataFile(): Promise<string> {
  const uid = await requireCurrentUserId();
  const dir = userDataDir(uid);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "transactions.json");
}

let writeLock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => undefined);
  return run;
}

async function ensureFile(): Promise<string> {
  const file = await dataFile();
  try {
    await fs.access(file);
  } catch {
    const empty: TransactionStore = {
      transactions: [],
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(file, JSON.stringify(empty, null, 2), "utf8");
  }
  return file;
}

async function readStore(): Promise<TransactionStore> {
  const file = await ensureFile();
  const raw = await fs.readFile(file, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return TransactionStoreSchema.parse(parsed);
  } catch {
    const empty: TransactionStore = {
      transactions: [],
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(file, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeStore(store: TransactionStore): Promise<void> {
  const file = await dataFile();
  const next: TransactionStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/**
 * Ensure every existing stock investment has at least one transaction in
 * the ledger. Runs at most once per process startup; safe to call on every
 * read because it's a no-op once the ledger is populated.
 *
 * For each stock holding without any transactions, we synthesize a single
 * BUY at its `createdAt` date for `quantity × avgCost`. The user can then
 * delete or edit that synthetic entry once they enter their real history.
 */
let backfilled = new Set<string>();
async function backfillIfNeeded(): Promise<void> {
  const uid = await requireCurrentUserId();
  if (backfilled.has(uid)) return;
  await withLock(async () => {
    if (backfilled.has(uid)) return;
    const store = await readStore();
    const investments = await listInvestments();
    const seen = new Set(store.transactions.map((t) => t.investmentId));
    const additions: Transaction[] = [];
    for (const inv of investments) {
      if (!isStock(inv)) continue;
      if (seen.has(inv.id)) continue;
      if (!(inv.quantity > 0)) continue;
      additions.push(syntheticInitialBuy(inv, randomUUID()));
    }
    if (additions.length > 0) {
      store.transactions.push(...additions);
      await writeStore(store);
    }
    backfilled.add(uid);
  });
}

export async function listTransactions(
  filter?: { investmentId?: string },
): Promise<Transaction[]> {
  await backfillIfNeeded();
  const store = await readStore();
  let rows = store.transactions;
  if (filter?.investmentId) {
    rows = rows.filter((t) => t.investmentId === filter.investmentId);
  }
  return rows.slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

async function recomputeHolding(investmentId: string): Promise<void> {
  const store = await readStore();
  const txs = store.transactions.filter((t) => t.investmentId === investmentId);
  if (txs.length === 0) return;
  const derived = deriveFromTransactions(txs);
  await applyDerivedHolding(investmentId, {
    quantity: derived.quantity,
    avgCost: derived.avgCost,
    firstBuyDate: derived.firstBuyDate,
  });
}

export async function addTransaction(input: unknown): Promise<Transaction> {
  await backfillIfNeeded();
  const parsed = TransactionInputSchema.parse(input) as TransactionInput;
  // Validate that the linked investment exists and is a stock.
  const investments = await listInvestments();
  const inv = investments.find((i) => i.id === parsed.investmentId);
  if (!inv) throw new Error("Investment not found");
  if (!isStock(inv)) throw new Error("Transactions are only supported for stocks");

  return withLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    // Default fees to 0 in storage so derivation is unambiguous.
    const tx: Transaction = {
      ...parsed,
      fees: parsed.fees ?? 0,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    store.transactions.push(tx);
    await writeStore(store);
    await recomputeHolding(tx.investmentId);
    return tx;
  });
}

export async function updateTransaction(
  id: string,
  patch: unknown,
): Promise<Transaction | null> {
  await backfillIfNeeded();
  return withLock(async () => {
    const store = await readStore();
    const idx = store.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const current = store.transactions[idx];
    const merged = { ...current, ...(patch as object) };
    const validated = TransactionInputSchema.parse({
      ...merged,
    });
    const next: Transaction = {
      ...current,
      ...validated,
      fees: validated.fees ?? current.fees ?? 0,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    store.transactions[idx] = next;
    await writeStore(store);
    // If investmentId changed, recompute both. (Rare but cheap.)
    await recomputeHolding(next.investmentId);
    if (current.investmentId !== next.investmentId) {
      await recomputeHolding(current.investmentId);
    }
    return next;
  });
}

export async function deleteTransaction(id: string): Promise<boolean> {
  await backfillIfNeeded();
  return withLock(async () => {
    const store = await readStore();
    const idx = store.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const removed = store.transactions[idx];
    store.transactions.splice(idx, 1);
    await writeStore(store);
    await recomputeHolding(removed.investmentId);
    return true;
  });
}
