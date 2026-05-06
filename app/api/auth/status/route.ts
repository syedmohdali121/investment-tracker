import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasPin, isValidSession, SESSION_COOKIE } from "@/lib/auth";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return NextResponse.json({
    hasPin: await hasPin(),
    authed: isValidSession(token),
  });
}
