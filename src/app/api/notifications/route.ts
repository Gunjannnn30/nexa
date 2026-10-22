import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";
import { notificationReadSchema } from "@/lib/schemas";
import { parseBody } from "@/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    return NextResponse.json(await listNotifications(user.id, cursor));
  });
}

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const input = await parseBody(req, notificationReadSchema);
    await markNotificationsRead(user.id, input);
    return NextResponse.json({ ok: true });
  });
}
