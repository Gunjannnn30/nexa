import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { authenticateUser, getOwnProfile } from "@/server/services/users";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { clientIp, enforceRate, handleApi, parseBody } from "@/server/http";
import { unauthorized } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const ip = clientIp(req);
    enforceRate(`login-ip:${ip}`, 20, 15 * 60 * 1000);
    const input = await parseBody(req, loginSchema);
    enforceRate(`login-id:${input.identifier.toLowerCase()}`, 8, 15 * 60 * 1000);
    const user = await authenticateUser(input.identifier, input.password);
    if (!user) throw unauthorized("Email/username or password is incorrect.");
    const { token, expiresAt } = await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip,
    });
    const profile = await getOwnProfile(user.id);
    const response = NextResponse.json({ user: profile });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  });
}
