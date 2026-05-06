import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  destroyUserSessions,
  createSession,
  getSessionUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import { changeUserPin, getUser, renameUser } from "@/lib/users";

/** Returns the currently logged-in user's public info, or `{ user: null }`. */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const uid = getSessionUser(token);
  if (!uid) return NextResponse.json({ user: null });
  const user = await getUser(uid);
  return NextResponse.json({ user });
}

const RenameBody = z.object({
  name: z.string().min(1).max(40),
});
const PinBody = z.object({
  currentPin: z.string().min(1),
  newPin: z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits"),
});

/**
 * Update the current user. Body shape:
 *   - `{ name }`                  → rename
 *   - `{ currentPin, newPin }`    → change PIN (rotates the session: any other
 *                                   devices are signed out, current request
 *                                   gets a fresh cookie so the user stays in)
 */
export async function PATCH(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const uid = getSessionUser(token);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pinParsed = PinBody.safeParse(body);
  if (pinParsed.success) {
    const result = await changeUserPin(
      uid,
      pinParsed.data.currentPin,
      pinParsed.data.newPin,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    destroyUserSessions(uid);
    const fresh = createSession(uid);
    jar.set(SESSION_COOKIE, fresh, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return NextResponse.json({ ok: true });
  }

  const renameParsed = RenameBody.safeParse(body);
  if (renameParsed.success) {
    const result = await renameUser(uid, renameParsed.data.name);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ user: result.user });
  }

  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
