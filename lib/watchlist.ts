import { randomUUID } from "node:crypto";
import { requireCurrentUserId } from "./user-context";
import { getDb } from "./db";

/**
 * SQLite-backed watchlist — symbols the user wants to track but doesn't (yet)
 * own. Scoped per user, deduped by symbol, and ordered by insertion.
 */
export type WatchlistItem = {
  id: string;
  symbol: string;
  name: string | null;
  createdAt: string;
};

type WatchlistRow = {
  id: string;
  symbol: string;
  name: string | null;
  created_at: string;
};

export async function listWatchlist(): Promise<WatchlistItem[]> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, symbol, name, created_at FROM watchlist
       WHERE user_id = ?
       ORDER BY sort_index ASC, created_at ASC`,
    )
    .all(uid) as WatchlistRow[];
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    createdAt: r.created_at,
  }));
}

export async function addToWatchlist(input: unknown): Promise<WatchlistItem> {
  const uid = await requireCurrentUserId();
  const raw = (input ?? {}) as { symbol?: unknown; name?: unknown };
  const symbol =
    typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
  if (!symbol) throw new Error("Symbol is required");
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;

  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  const tx = db.transaction(() => {
    const existing = db
      .prepare("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?")
      .get(uid, symbol);
    if (existing) throw new Error(`${symbol} is already on your watchlist`);
    const max = db
      .prepare("SELECT MAX(sort_index) AS n FROM watchlist WHERE user_id = ?")
      .get(uid) as { n: number | null } | undefined;
    const next = (max?.n ?? -1) + 1;
    db.prepare(
      `INSERT INTO watchlist (id, user_id, symbol, name, created_at, sort_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, uid, symbol, name, now, next);
  });
  tx();
  return { id, symbol, name, createdAt: now };
}

export async function removeFromWatchlist(symbol: string): Promise<boolean> {
  const uid = await requireCurrentUserId();
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;
  const db = getDb();
  const res = db
    .prepare("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?")
    .run(uid, sym);
  return res.changes > 0;
}

/** Persist a new card order. `ids` must be exactly the user's current set. */
export async function reorderWatchlist(ids: string[]): Promise<boolean> {
  const uid = await requireCurrentUserId();
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM watchlist WHERE user_id = ?")
    .all(uid) as Array<{ id: string }>;
  if (existing.length !== ids.length) return false;
  const have = new Set(existing.map((r) => r.id));
  if (ids.some((id) => !have.has(id))) return false;

  const update = db.prepare(
    "UPDATE watchlist SET sort_index = ? WHERE id = ? AND user_id = ?",
  );
  const tx = db.transaction(() => {
    ids.forEach((id, idx) => update.run(idx, id, uid));
  });
  tx();
  return true;
}
