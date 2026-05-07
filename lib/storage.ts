import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  InvestmentInput,
  InvestmentInputSchema,
  Investment,
  Store,
  StoreSchema,
} from "./types";
import { requireCurrentUserId } from "./user-context";
import { userDataDir } from "./users";
import { atomicWriteJson, withUserLock } from "./file-lock";

async function dataFile(): Promise<string> {
  const uid = await requireCurrentUserId();
  const dir = userDataDir(uid);
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "investments.json");
}

/**
 * Serialize a read-modify-write pair against the current user's storage.
 * The lock key is the user id, so two different users do NOT block each
 * other and `investments.json` shares the lock with `transactions.json`
 * (both call `withUserLock(uid, ...)` via the shared helper).
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const uid = await requireCurrentUserId();
  return withUserLock(uid, fn);
}

async function ensureFile(): Promise<string> {
  const file = await dataFile();
  try {
    await fs.access(file);
  } catch {
    const empty: Store = { investments: [], updatedAt: new Date().toISOString() };
    await atomicWriteJson(file, empty);
  }
  return file;
}

export async function readStore(): Promise<Store> {
  const file = await ensureFile();
  const raw = await fs.readFile(file, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return StoreSchema.parse(parsed);
  } catch {
    const empty: Store = { investments: [], updatedAt: new Date().toISOString() };
    await atomicWriteJson(file, empty);
    return empty;
  }
}

async function writeStore(store: Store): Promise<void> {
  const file = await dataFile();
  const next: Store = { ...store, updatedAt: new Date().toISOString() };
  await atomicWriteJson(file, next);
}

export async function listInvestments(): Promise<Investment[]> {
  const store = await readStore();
  return store.investments;
}

export async function addInvestment(input: unknown): Promise<Investment> {
  const parsed = InvestmentInputSchema.parse(input) as InvestmentInput;
  return withLock(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    // Honor a user-supplied purchase date so tax holding-period logic
    // works when backfilling old positions. Fall back to "now" if missing
    // or unparseable.
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
    store.investments.push(inv);
    await writeStore(store);
    return inv;
  });
}

export async function updateInvestment(
  id: string,
  patch: unknown,
): Promise<Investment | null> {
  return withLock(async () => {
    const store = await readStore();
    const idx = store.investments.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const current = store.investments[idx];
    const merged = { ...current, ...(patch as object) } as Investment;
    // Re-validate as input shape (allowing same category)
    const validated = InvestmentInputSchema.parse({
      ...merged,
    });
    // Allow editing the purchase date so users can correct a mis-dated
    // entry (e.g. one created before backdating was supported).
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
    store.investments[idx] = next;
    await writeStore(store);
    return next;
  });
}

export async function deleteInvestment(id: string): Promise<boolean> {
  return withLock(async () => {
    const store = await readStore();
    const before = store.investments.length;
    store.investments = store.investments.filter((i) => i.id !== id);
    if (store.investments.length === before) return false;
    await writeStore(store);
    return true;
  });
}

export async function reorderInvestments(ids: string[]): Promise<boolean> {
  return withLock(async () => {
    const store = await readStore();
    if (ids.length !== store.investments.length) return false;
    const byId = new Map(store.investments.map((i) => [i.id, i]));
    if (ids.some((id) => !byId.has(id))) return false;
    store.investments = ids.map((id) => byId.get(id)!);
    await writeStore(store);
    return true;
  });
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
  return withLock(() => applyDerivedHoldingInLock(investmentId, derived));
}

/**
 * Same as `applyDerivedHolding` but does NOT acquire the user lock.
 * Call only from a context that already holds it (e.g. inside
 * `transactions-storage`'s `withLock`) — otherwise reentry on the shared
 * per-user lock would deadlock.
 */
export async function applyDerivedHoldingInLock(
  investmentId: string,
  derived: { quantity: number; avgCost: number; firstBuyDate: string | null },
): Promise<Investment | null> {
  const store = await readStore();
  const idx = store.investments.findIndex((i) => i.id === investmentId);
  if (idx === -1) return null;
  const current = store.investments[idx];
  if (current.category !== "US_STOCK" && current.category !== "INDIAN_STOCK") {
    return current;
  }
  const next: Investment = {
    ...current,
    quantity: derived.quantity,
    avgCost: derived.avgCost,
    createdAt: derived.firstBuyDate ?? current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  store.investments[idx] = next;
  await writeStore(store);
  return next;
}

