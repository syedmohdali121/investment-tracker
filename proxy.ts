import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Local PIN gate. Lets through:
 *   - /lock                (the gate UI)
 *   - /api/auth/*          (status / setup / login / logout)
 *   - /_next/* and asset paths (handled by matcher exclusion)
 *
 * Everything else requires a valid session cookie. When missing/invalid we
 * redirect to /lock with `?next=` so the user lands back where they came from
 * after entering the PIN.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/lock" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSession(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/lock";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  // For API requests other than auth, return 401 instead of redirecting so
  // React Query receives an error response rather than HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Run for all paths except Next.js internals and common static assets.
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
