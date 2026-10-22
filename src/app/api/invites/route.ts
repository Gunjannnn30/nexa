import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { acceptInvite, declineInvite, listIncomingInvites } from "@/server/services/conversations";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    return NextResponse.json({ invites: await listIncomingInvites(user.id) });
  });
}

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => null)) as
      | { action?: "accept" | "decline"; inviteId?: string; token?: string }
      | null;
    if (!body?.action) throw new AppError(400, "BAD_REQUEST", "action is required.");
    if (body.action === "accept") {
      if (!body.token) throw new AppError(400, "BAD_REQUEST", "token is required.");
      await acceptInvite(user.id, body.token);
      return NextResponse.json({ ok: true });
    }
    if (!body.inviteId) throw new AppError(400, "BAD_REQUEST", "inviteId is required.");
    await declineInvite(user.id, body.inviteId);
    return NextResponse.json({ ok: true });
  });
}
