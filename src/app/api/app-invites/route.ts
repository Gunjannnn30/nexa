import { NextResponse, type NextRequest } from "next/server";
import { createAppInviteSchema } from "@/lib/schemas";
import { enforceRate, handleApi, parseBody, requireUser } from "@/server/http";
import { createAppInvite, listAppInvites } from "@/server/services/app-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`app-invites:list:${user.id}`, 120, 60_000);
    const invites = await listAppInvites(user.id);
    return NextResponse.json({ invites });
  });
}

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`app-invites:create:${user.id}`, 20, 60 * 60_000);
    const input = await parseBody(req, createAppInviteSchema);
    const invite = await createAppInvite(user.id, input);
    return NextResponse.json({ invite }, { status: 201 });
  });
}
