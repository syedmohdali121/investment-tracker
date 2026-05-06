import { promises as fs } from "node:fs";
import path from "node:path";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Local-only PIN gate. Hashes the user's PIN with PBKDF2 (sha256, 200k
 * iterations) and stores `{ hash, salt, iterations }` in `data/auth.json`.
 *
 * Sessions are tracked by an in-memory `Set<token>` and exposed to the client
 * as a session cookie (HttpOnly, no `Max-Age`/`Expires`) so it dies when the
 * browser closes — matching the "re-prompt on next session" requirement.
 *
 * NOTE: This is a soft front-door lock, not encryption-at-rest. Anyone with
 * file-system access can still read `data/investments.json`.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const ITERATIONS = 200_000;
const KEYLEN = 32;
const DIGEST = "sha256";

export const SESSION_COOKIE = "it_session";

const AuthFileSchema = z.object({
  hash: z.string().min(1),
  salt: z.string().min(1),
  iterations: z.number().int().positive(),
  createdAt: z.string(),
});
type AuthFile = z.infer<typeof AuthFileSchema>;

let writeLock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => undefined);
  return run;
}

async function readAuth(): Promise<AuthFile | null> {
  try {
    const raw = await fs.readFile(AUTH_FILE, "utf8");
    return AuthFileSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeAuth(file: AuthFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = AUTH_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await fs.rename(tmp, AUTH_FILE);
}

function hashPin(pin: string, saltB64: string): string {
  const salt = Buffer.from(saltB64, "base64");
  return pbkdf2Sync(pin, salt, ITERATIONS, KEYLEN, DIGEST).toString("base64");
}

export async function hasPin(): Promise<boolean> {
  return (await readAuth()) !== null;
}

export async function setupPin(pin: string): Promise<void> {
  if (await hasPin()) {
    throw new Error("PIN already set");
  }
  await withLock(async () => {
    const salt = randomBytes(32).toString("base64");
    const hash = hashPin(pin, salt);
    await writeAuth({
      hash,
      salt,
      iterations: ITERATIONS,
      createdAt: new Date().toISOString(),
    });
  });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const file = await readAuth();
  if (!file) return false;
  const candidate = hashPin(pin, file.salt);
  const a = Buffer.from(candidate, "base64");
  const b = Buffer.from(file.hash, "base64");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------- Sessions (in-memory) ----------

// In dev, Next.js may load this module in multiple bundles (proxy, route
// handlers, server components). Pin the stores on `globalThis` so every
// bundle shares the same instance — otherwise a token created by /api/auth
// won't be visible to the proxy and the user gets a redirect loop after
// login. The cost is a single property on the global object.
const GLOBAL_KEY = Symbol.for("investment-tracker.auth");
type AuthGlobals = {
  sessions: Set<string>;
  attempts: Map<string, { count: number; resetAt: number }>;
};
const g = globalThis as unknown as Record<symbol, AuthGlobals>;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = { sessions: new Set(), attempts: new Map() };
}
const sessions = g[GLOBAL_KEY].sessions;

export function createSession(): string {
  const token = randomBytes(32).toString("base64url");
  sessions.add(token);
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  return !!token && sessions.has(token);
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

// ---------- Rate limiting (in-memory, per IP) ----------

const attempts = g[GLOBAL_KEY].attempts;
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export function rateLimit(key: string): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterMs: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
