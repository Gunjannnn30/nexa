import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { unauthorized } from "@/lib/errors";
import {
  SESSION_COOKIE,
  type SessionUser,
  deleteSessionByToken,
  validateSessionToken,
} from "@/server/session";

/** For server components, layouts, and server actions. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** For route handlers. */
export async function getRequestUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export async function requireRequestUser(req: NextRequest): Promise<SessionUser> {
  const user = await getRequestUser(req);
  if (!user) throw unauthorized();
  return user;
}

export async function endRequestSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token);
}
