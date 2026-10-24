import { NextResponse, type NextRequest } from "next/server";
import { badRequest } from "@/lib/errors";
import { clientIp, enforceRate, handleApi } from "@/server/http";
import { previewAppInvite } from "@/server/services/app-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handleApi(async () => {
    enforceRate(`app-invites:preview:${clientIp(req)}`, 120, 60_000);
    const { token } = await params;
    if (!token || token.length > 128) throw badRequest("Invite link is not valid.");
    return NextResponse.json({ invite: await previewAppInvite(token) });
  });
}
