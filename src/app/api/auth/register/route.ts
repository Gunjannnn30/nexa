import { NextResponse, type NextRequest } from "next/server";
import { registerSchema } from "@/lib/schemas";
import { getOwnProfile } from "@/server/services/users";
import { registerUser } from "@/server/services/users";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { clientIp, enforceRate, handleApi, parseBody } from "@/server/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    enforceRate(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
    const input = await parseBody(req, registerSchema);
    const user = await registerUser(input);
    const { token, expiresAt } = await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req),
    });
    const profile = await getOwnProfile(user.id);
    const response = NextResponse.json({ user: profile }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return response;
  });
}
