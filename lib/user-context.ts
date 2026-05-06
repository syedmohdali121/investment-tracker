import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE } from "./auth";

/**
 * Resolve the userId for the current request. Throws when the request is
 * unauthenticated — the proxy normally prevents this from happening for
 * non-auth routes, but storage callers should fail loudly if it ever does.
 */
export async function requireCurrentUserId(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const uid = getSessionUser(token);
  if (!uid) throw new Error("UNAUTHENTICATED");
  return uid;
}
