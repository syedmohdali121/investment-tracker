import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  createSession,
  rateLimit,
  resetRateLimit,
  SESSION_COOKIE,
} from "@/lib/auth";
import { verifyUserPin } from "@/lib/users";

const Body = z.object({
  userId: z.string().min(1),
  pin: z.string().min(1),
});

export async function POST(req: NextRequest) {
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

  const ok = await verifyUserPin(parsed.data.userId, parsed.data.pin);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }
  resetRateLimit(ip);

  const token = createSession(parsed.data.userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
