import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSession, getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { createUser, hasAnyUsers, listUsers } from "@/lib/users";

/** GET → public user list + which (if any) is currently authed. */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const authedUserId = getSessionUser(token);
  const users = await listUsers();
  return NextResponse.json({ users, authedUserId });
}

const CreateBody = z.object({
  name: z.string().min(1).max(40),
  pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits"),
});

/** POST → create a new user and auto-login as them. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // We allow user creation from the lock screen by design (per the user's
  // requirement). `hasAnyUsers` is only consulted to decide first-user UX,
  // not as an authorization check.
  void hasAnyUsers;

  let user;
  try {
    user = await createUser(parsed.data.name, parsed.data.pin);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Failed to create user" },
      { status: 400 },
    );
  }

  const token = createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return NextResponse.json({ user });
}
