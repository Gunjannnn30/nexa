import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { getOwnProfile } from "@/server/services/users";
import { unreadNotificationCount } from "@/server/services/notifications";
import { listIncomingInvites } from "@/server/services/conversations";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const [profile, notifications, invites] = await Promise.all([
      getOwnProfile(user.id),
      unreadNotificationCount(user.id),
      listIncomingInvites(user.id),
    ]);
    return NextResponse.json({ user: profile, unreadNotifications: notifications, invites });
  });
}
