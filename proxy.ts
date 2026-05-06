import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Local PIN gate. Lets through:
 *   - /lock                         (the gate UI)
 *   - /api/auth/logout              (session-scoped, callable when authed too)
 *   - /api/users (GET/POST)         (list users / create new from lock screen)
 *   - /api/users/login              (verify PIN + set cookie)
 *   - /api/users/me                 (returns null when unauthed; safe)
 *   - /_next/* and asset paths      (excluded by matcher)
 *
 * Everything else requires a valid session cookie. When missing/invalid we
 * redirect to /lock with `?next=` so the user lands back where they came
 * from after entering the PIN. API requests get a 401 JSON.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/lock" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/users" ||
    pathname === "/api/users/login" ||
    pathname === "/api/users/me" ||
    // Allow DELETE /api/users/<id> from the lock screen (PIN-confirmed in
    // the route handler itself).
    (pathname.startsWith("/api/users/") && req.method === "DELETE");
  if (isPublic) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSession(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/lock";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};

