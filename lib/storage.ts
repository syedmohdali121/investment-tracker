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

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "investments.json");

let writeLock: Promise<unknown> = Promise.resolve();

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const empty: Store = { investments: [], updatedAt: new Date().toISOString() };
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2), "utf8");
  }
}

export async function readStore(): Promise<Store> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return StoreSchema.parse(parsed);
  } catch {
    const empty: Store = { investments: [], updatedAt: new Date().toISOString() };
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeStore(store: Store): Promise<void> {
  const next: Store = { ...store, updatedAt: new Date().toISOString() };
  const tmp = DATA_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => undefined);
  return run;
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
    const inv = {
      ...parsed,
      id: randomUUID(),
      createdAt: now,
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
    const next = {
      ...current,
      ...validated,
      id: current.id,
      createdAt: current.createdAt,
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
