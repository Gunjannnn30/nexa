import crypto from "node:crypto";
import type { User, UserSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "nexa_session";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function sessionExpiry() {
  return new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
) {
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 60) ?? null,
    },
  });
  return { token, expiresAt };
}

export type SessionUser = Pick<
  User,
  "id" | "email" | "username" | "name" | "avatarUrl" | "bio" | "statusText" | "lastSeenAt"
> & { settings: UserSettings | null };

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { settings: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    statusText: user.statusText,
    lastSeenAt: user.lastSeenAt,
    settings: user.settings,
  };
}

export async function deleteSessionByToken(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
