import { NextResponse, type NextRequest } from "next/server";
import { enforceRate, handleApi, requireUser } from "@/server/http";
import { revokeAppInvite } from "@/server/services/app-invites";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`app-invites:revoke:${user.id}`, 60, 60_000);
    const { id } = await params;
    const invite = await revokeAppInvite(user.id, id);
    return NextResponse.json({ invite });
  });
}
