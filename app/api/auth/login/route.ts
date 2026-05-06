import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  createSession,
  hasPin,
  rateLimit,
  resetRateLimit,
  SESSION_COOKIE,
  verifyPin,
} from "@/lib/auth";

const Body = z.object({ pin: z.string().min(1) });

export async function POST(req: NextRequest) {
  if (!(await hasPin())) {
    return NextResponse.json(
      { error: "No PIN set. Use /api/auth/setup." },
      { status: 409 },
    );
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 400 });
  }
  const ok = await verifyPin(parsed.data.pin);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }
  resetRateLimit(ip);
  const token = createSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
