import { promises as fs } from "node:fs";

/**
 * Per-key serialized critical sections. Each unique `key` (typically a user
 * id) gets its own promise chain; concurrent calls under the SAME key run
 * one-at-a-time, while DIFFERENT keys run in parallel. This replaces the
 * previous module-global lock that serialized every write across all users.
 *
 * Why a Map of promises instead of a single global lock?
 *   - Two users editing in parallel no longer queue behind each other.
 *   - Within one user, both `investments.json` and `transactions.json`
 *     writes share the same key, so the cross-file pair
 *     "write transaction → recompute derived holding" is atomic against
 *     a concurrent direct `updateInvestment` for the same user.
 *
 * In-process only. If we ever shard across Node workers we'd need a real
 * filesystem lock (e.g. `proper-lockfile`).
 */
const locks = new Map<string, Promise<unknown>>();

export function withUserLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Swallow rejections in the chain so a failed task doesn't poison
  // subsequent ones.
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Atomic write: serialize to a sibling `.tmp` file, then rename. The rename
 * is atomic on POSIX filesystems, so a crash mid-write either leaves the
 * old file intact or replaces it cleanly — never a half-written file.
 */
export async function atomicWriteJson(
  file: string,
  data: unknown,
): Promise<void> {
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}
