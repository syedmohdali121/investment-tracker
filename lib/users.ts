import {
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { getDb } from "./db";

/**
 * SQLite-backed multi-user PIN registry. Same hashing semantics as the
 * previous file-storage version (PBKDF2-SHA256, 200k iterations) so
 * existing PINs remain valid after the migration.
 *
 * Sessions still live in process memory (`lib/auth.ts`); a server restart
 * forces a re-login by design.
 */

const ITERATIONS = 200_000;
const KEYLEN = 32;
const DIGEST = "sha256";

const AVATAR_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#84cc16",
];

export type PublicUser = { id: string; name: string; color: string };

type UserRow = {
  id: string;
  name: string;
  color: string;
  hash: string;
  salt: string;
  iterations: number;
  created_at: string;
};

function pickColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function hashPin(pin: string, saltB64: string): string {
  const salt = Buffer.from(saltB64, "base64");
  return pbkdf2Sync(pin, salt, ITERATIONS, KEYLEN, DIGEST).toString("base64");
}

function timingSafeEqualB64(a: string, b: string): boolean {
  const ab = Buffer.from(a, "base64");
  const bb = Buffer.from(b, "base64");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function rowToPublic(r: UserRow): PublicUser {
  return { id: r.id, name: r.name, color: r.color };
}

export async function listUsers(): Promise<PublicUser[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, color FROM users ORDER BY name COLLATE NOCASE")
    .all() as Array<{ id: string; name: string; color: string }>;
  return rows;
}

export async function hasAnyUsers(): Promise<boolean> {
  const db = getDb();
  const r = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  return r.c > 0;
}

export async function getUser(userId: string): Promise<PublicUser | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT id, name, color FROM users WHERE id = ?")
    .get(userId) as { id: string; name: string; color: string } | undefined;
  return row ?? null;
}

export async function createUser(
  name: string,
  pin: string,
): Promise<PublicUser> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4–8 digits");
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE name = ? COLLATE NOCASE")
    .get(trimmed) as { id: string } | undefined;
  if (existing) {
    throw new Error("A user with this name already exists");
  }
  const id = randomUUID();
  const salt = randomBytes(32).toString("base64");
  const hash = hashPin(pin, salt);
  const row: UserRow = {
    id,
    name: trimmed,
    color: pickColor(id),
    hash,
    salt,
    iterations: ITERATIONS,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO users (id, name, color, hash, salt, iterations, created_at)
     VALUES (@id, @name, @color, @hash, @salt, @iterations, @created_at)`,
  ).run(row);
  return rowToPublic(row);
}

export async function verifyUserPin(
  userId: string,
  pin: string,
): Promise<boolean> {
  const db = getDb();
  const row = db
    .prepare("SELECT hash, salt FROM users WHERE id = ?")
    .get(userId) as { hash: string; salt: string } | undefined;
  if (!row) return false;
  return timingSafeEqualB64(hashPin(pin, row.salt), row.hash);
}

export async function renameUser(
  userId: string,
  name: string,
): Promise<
  | { ok: true; user: PublicUser }
  | { ok: false; status: 404 | 409 | 400; error: string }
> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Name is required" };
  if (trimmed.length > 40)
    return { ok: false, status: 400, error: "Name is too long" };
  const db = getDb();
  const row = db
    .prepare("SELECT id, name, color FROM users WHERE id = ?")
    .get(userId) as { id: string; name: string; color: string } | undefined;
  if (!row) return { ok: false, status: 404, error: "User not found" };
  const conflict = db
    .prepare("SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id <> ?")
    .get(trimmed, userId) as { id: string } | undefined;
  if (conflict) {
    return {
      ok: false,
      status: 409,
      error: "A user with this name already exists",
    };
  }
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(trimmed, userId);
  return { ok: true, user: { id: row.id, name: trimmed, color: row.color } };
}

export async function changeUserPin(
  userId: string,
  currentPin: string,
  newPin: string,
): Promise<
  { ok: true } | { ok: false; status: 401 | 404 | 400; error: string }
> {
  if (!/^\d{4,8}$/.test(newPin)) {
    return { ok: false, status: 400, error: "PIN must be 4–8 digits" };
  }
  const db = getDb();
  const row = db
    .prepare("SELECT hash, salt FROM users WHERE id = ?")
    .get(userId) as { hash: string; salt: string } | undefined;
  if (!row) return { ok: false, status: 404, error: "User not found" };
  if (!timingSafeEqualB64(hashPin(currentPin, row.salt), row.hash)) {
    return { ok: false, status: 401, error: "Current PIN is incorrect" };
  }
  const newSalt = randomBytes(32).toString("base64");
  const newHash = hashPin(newPin, newSalt);
  db.prepare(
    "UPDATE users SET salt = ?, hash = ?, iterations = ? WHERE id = ?",
  ).run(newSalt, newHash, ITERATIONS, userId);
  return { ok: true };
}

export async function deleteUser(
  userId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; status: 401 | 404 }> {
  const db = getDb();
  const row = db
    .prepare("SELECT hash, salt FROM users WHERE id = ?")
    .get(userId) as { hash: string; salt: string } | undefined;
  if (!row) return { ok: false, status: 404 };
  if (!timingSafeEqualB64(hashPin(pin, row.salt), row.hash)) {
    return { ok: false, status: 401 };
  }
  // FK ON DELETE CASCADE removes investments + transactions automatically.
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return { ok: true };
}
