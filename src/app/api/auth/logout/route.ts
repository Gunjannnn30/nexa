import { NextResponse, type NextRequest } from "next/server";
import { endRequestSession } from "@/server/auth";
import { handleApi } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    await endRequestSession(req);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  });
}
