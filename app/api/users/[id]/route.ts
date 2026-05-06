import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  destroyUserSessions,
  getSessionUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import { deleteUser } from "@/lib/users";

const Body = z.object({ pin: z.string().min(1) });

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const result = await deleteUser(id, parsed.data.pin);
  if (!result.ok) {
    if (result.status === 404) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  // Drop any active sessions for this user, including ours if applicable.
  destroyUserSessions(id);
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && getSessionUser(token) === null) {
    // We just nuked our own session — clear the cookie too.
    jar.delete(SESSION_COOKIE);
  }
  return NextResponse.json({ ok: true });
}
