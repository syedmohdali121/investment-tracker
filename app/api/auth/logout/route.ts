import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  destroySession(token);
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
