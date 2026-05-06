import { randomBytes } from "node:crypto";

/**
 * Session + rate-limit primitives shared across all server bundles.
 *
 * Each session token maps to a single `userId`. The Map and rate-limit
 * counters are pinned on `globalThis` so the proxy bundle and the route
 * handler bundles see the same instance — otherwise login in one bundle
 * wouldn't be visible to the other and the user would loop through /lock.
 *
 * Session cookies have no `Max-Age`/`Expires`, so they die on browser close.
 * A server restart wipes the in-memory map → re-login required, by design.
 */

export const SESSION_COOKIE = "it_session";

const GLOBAL_KEY = Symbol.for("investment-tracker.auth");
type AuthGlobals = {
  /** token → userId */
  sessions: Map<string, string>;
  attempts: Map<string, { count: number; resetAt: number }>;
};
const g = globalThis as unknown as Record<symbol, AuthGlobals>;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = { sessions: new Map(), attempts: new Map() };
}
const sessions = g[GLOBAL_KEY].sessions;
const attempts = g[GLOBAL_KEY].attempts;

export function createSession(userId: string): string {
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, userId);
  return token;
}

/** Returns the userId tied to this token, or `null` if the token is unknown. */
export function getSessionUser(token: string | undefined): string | null {
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export function isValidSession(token: string | undefined): boolean {
  return getSessionUser(token) !== null;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

/** Forget every session that maps to this user (used after delete). */
export function destroyUserSessions(userId: string): void {
  for (const [token, uid] of sessions.entries()) {
    if (uid === userId) sessions.delete(token);
  }
}

// ---------- Rate limiting (in-memory, per IP) ----------

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
