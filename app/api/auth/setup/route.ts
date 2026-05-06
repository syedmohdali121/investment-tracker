import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSession, hasPin, setupPin, SESSION_COOKIE } from "@/lib/auth";

const Body = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits"),
});

export async function POST(req: NextRequest) {
  if (await hasPin()) {
    return NextResponse.json(
      { error: "PIN already set. Use /api/auth/login." },
      { status: 409 },
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid PIN" },
      { status: 400 },
    );
  }
  await setupPin(parsed.data.pin);
  const token = createSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // No `expires`/`maxAge` → session cookie, dies on browser close.
  });
  return NextResponse.json({ ok: true });
}
