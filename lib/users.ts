import { promises as fs } from "node:fs";
import path from "node:path";
import {
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

/**
 * Multi-user PIN registry. Each user owns:
 *   - an entry in `data/users.json` (id, name, color, hashed PIN)
 *   - a per-user data folder at `data/users/<id>/` with their own
 *     `investments.json` and `transactions.json`
 *
 * Sessions live in memory (see `lib/auth.ts`) and map a token to a userId.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const USERS_ROOT = path.join(DATA_DIR, "users");
const LEGACY_AUTH = path.join(DATA_DIR, "auth.json");
const LEGACY_INVESTMENTS = path.join(DATA_DIR, "investments.json");
const LEGACY_TRANSACTIONS = path.join(DATA_DIR, "transactions.json");

const ITERATIONS = 200_000;
const KEYLEN = 32;
const DIGEST = "sha256";

// 8-color avatar palette (deterministic by user id hash).
const AVATAR_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ef4444", // red
  "#84cc16", // lime
];

const StoredUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  color: z.string(),
  hash: z.string(),
  salt: z.string(),
  iterations: z.number().int().positive(),
  createdAt: z.string(),
});
type StoredUser = z.infer<typeof StoredUserSchema>;

const RegistrySchema = z.object({
  users: z.array(StoredUserSchema),
  updatedAt: z.string(),
});
type Registry = z.infer<typeof RegistrySchema>;

export type PublicUser = { id: string; name: string; color: string };

let writeLock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => undefined);
  return run;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

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

// ---------- Migration from single-PIN ----------

let migrated = false;

async function migrateIfNeeded(): Promise<void> {
  if (migrated) return;
  migrated = true;
  await ensureDir(DATA_DIR);

  if (await exists(USERS_FILE)) return;

  // Carry over the legacy single-PIN setup, if any, into a "Default" user.
  if (!(await exists(LEGACY_AUTH))) {
    await writeRegistry({ users: [], updatedAt: new Date().toISOString() });
    return;
  }

  const raw = await fs.readFile(LEGACY_AUTH, "utf8");
  const parsed = z
    .object({
      hash: z.string(),
      salt: z.string(),
      iterations: z.number().int().positive(),
      createdAt: z.string().optional(),
    })
    .safeParse(JSON.parse(raw));
  if (!parsed.success) {
    await writeRegistry({ users: [], updatedAt: new Date().toISOString() });
    return;
  }

  const id = randomUUID();
  const user: StoredUser = {
    id,
    name: "Default",
    color: pickColor(id),
    hash: parsed.data.hash,
    salt: parsed.data.salt,
    iterations: parsed.data.iterations,
    createdAt: parsed.data.createdAt ?? new Date().toISOString(),
  };
  await writeRegistry({ users: [user], updatedAt: new Date().toISOString() });

  // Move existing portfolio + ledger into the user's folder.
  const userDir = userDataDir(id);
  await ensureDir(userDir);
  if (await exists(LEGACY_INVESTMENTS)) {
    await fs
      .rename(LEGACY_INVESTMENTS, path.join(userDir, "investments.json"))
      .catch(() => undefined);
  }
  if (await exists(LEGACY_TRANSACTIONS)) {
    await fs
      .rename(LEGACY_TRANSACTIONS, path.join(userDir, "transactions.json"))
      .catch(() => undefined);
  }
  // Rename the legacy auth file rather than delete, in case the user
  // wants to roll back manually.
  await fs.rename(LEGACY_AUTH, LEGACY_AUTH + ".bak").catch(() => undefined);
}

// ---------- Registry I/O ----------

async function readRegistry(): Promise<Registry> {
  await migrateIfNeeded();
  if (!(await exists(USERS_FILE))) {
    return { users: [], updatedAt: new Date().toISOString() };
  }
  const raw = await fs.readFile(USERS_FILE, "utf8");
  try {
    return RegistrySchema.parse(JSON.parse(raw));
  } catch {
    return { users: [], updatedAt: new Date().toISOString() };
  }
}

async function writeRegistry(reg: Registry): Promise<void> {
  await ensureDir(DATA_DIR);
  const next: Registry = { ...reg, updatedAt: new Date().toISOString() };
  const tmp = USERS_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, USERS_FILE);
}

// ---------- Public API ----------

export function userDataDir(userId: string): string {
  return path.join(USERS_ROOT, userId);
}

export async function listUsers(): Promise<PublicUser[]> {
  const reg = await readRegistry();
  return reg.users.map((u) => ({ id: u.id, name: u.name, color: u.color }));
}

export async function hasAnyUsers(): Promise<boolean> {
  const reg = await readRegistry();
  return reg.users.length > 0;
}

export async function getUser(userId: string): Promise<PublicUser | null> {
  const reg = await readRegistry();
  const u = reg.users.find((x) => x.id === userId);
  return u ? { id: u.id, name: u.name, color: u.color } : null;
}

export async function createUser(
  name: string,
  pin: string,
): Promise<PublicUser> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4–8 digits");
  return withLock(async () => {
    const reg = await readRegistry();
    if (
      reg.users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      throw new Error("A user with this name already exists");
    }
    const id = randomUUID();
    const salt = randomBytes(32).toString("base64");
    const hash = hashPin(pin, salt);
    const user: StoredUser = {
      id,
      name: trimmed,
      color: pickColor(id),
      hash,
      salt,
      iterations: ITERATIONS,
      createdAt: new Date().toISOString(),
    };
    reg.users.push(user);
    await writeRegistry(reg);
    await ensureDir(userDataDir(id));
    return { id: user.id, name: user.name, color: user.color };
  });
}

export async function verifyUserPin(
  userId: string,
  pin: string,
): Promise<boolean> {
  const reg = await readRegistry();
  const u = reg.users.find((x) => x.id === userId);
  if (!u) return false;
  return timingSafeEqualB64(hashPin(pin, u.salt), u.hash);
}

export async function renameUser(
  userId: string,
  name: string,
): Promise<{ ok: true; user: PublicUser } | { ok: false; status: 404 | 409 | 400; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Name is required" };
  if (trimmed.length > 40)
    return { ok: false, status: 400, error: "Name is too long" };
  return withLock(async () => {
    const reg = await readRegistry();
    const u = reg.users.find((x) => x.id === userId);
    if (!u) return { ok: false, status: 404, error: "User not found" } as const;
    if (
      reg.users.some(
        (x) =>
          x.id !== userId && x.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      return {
        ok: false,
        status: 409,
        error: "A user with this name already exists",
      } as const;
    }
    u.name = trimmed;
    await writeRegistry(reg);
    return {
      ok: true,
      user: { id: u.id, name: u.name, color: u.color },
    } as const;
  });
}

export async function changeUserPin(
  userId: string,
  currentPin: string,
  newPin: string,
): Promise<{ ok: true } | { ok: false; status: 401 | 404 | 400; error: string }> {
  if (!/^\d{4,8}$/.test(newPin)) {
    return { ok: false, status: 400, error: "PIN must be 4–8 digits" };
  }
  return withLock(async () => {
    const reg = await readRegistry();
    const u = reg.users.find((x) => x.id === userId);
    if (!u) return { ok: false, status: 404, error: "User not found" } as const;
    if (!timingSafeEqualB64(hashPin(currentPin, u.salt), u.hash)) {
      return { ok: false, status: 401, error: "Current PIN is incorrect" } as const;
    }
    const salt = randomBytes(32).toString("base64");
    u.salt = salt;
    u.hash = hashPin(newPin, salt);
    u.iterations = ITERATIONS;
    await writeRegistry(reg);
    return { ok: true } as const;
  });
}

export async function deleteUser(
  userId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; status: 401 | 404 }> {
  return withLock(async () => {
    const reg = await readRegistry();
    const u = reg.users.find((x) => x.id === userId);
    if (!u) return { ok: false, status: 404 } as const;
    if (!timingSafeEqualB64(hashPin(pin, u.salt), u.hash)) {
      return { ok: false, status: 401 } as const;
    }
    reg.users = reg.users.filter((x) => x.id !== userId);
    await writeRegistry(reg);
    await fs
      .rm(userDataDir(userId), { recursive: true, force: true })
      .catch(() => undefined);
    return { ok: true } as const;
  });
}
