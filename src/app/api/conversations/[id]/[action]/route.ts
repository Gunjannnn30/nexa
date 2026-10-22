import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createGroupInviteSchema } from "@/lib/schemas";
import { AppError } from "@/lib/errors";
import { handleApi, parseBody, requireUser } from "@/server/http";
import {
  addMembers,
  createGroupInvite,
  leaveConversation,
  removeMember,
  setArchived,
  setFavorite,
  setMemberRole,
  setMuted,
  setNotificationLevel,
} from "@/server/services/conversations";
import {
  markConversationDelivered,
  markConversationRead,
} from "@/server/services/messages";

export const runtime = "nodejs";

const boolBody = z.object({ value: z.boolean() });
const muteBody = z.object({ hours: z.number().int().min(1).max(24 * 30).nullable() });
const levelBody = z.object({ level: z.enum(["ALL", "MENTIONS", "NONE"]) });
const membersBody = z.object({ userIds: z.array(z.string().min(1)).min(1).max(49) });
const memberBody = z.object({ userId: z.string().min(1) });
const roleBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id, action } = await params;

    switch (action) {
      case "read":
        return NextResponse.json(await markConversationRead(user.id, id));
      case "delivered":
        await markConversationDelivered(user.id, id);
        return NextResponse.json({ ok: true });
      case "archive": {
        const input = await parseBody(req, boolBody);
        return NextResponse.json(await setArchived(user.id, id, input.value));
      }
      case "favorite": {
        const input = await parseBody(req, boolBody);
        return NextResponse.json(await setFavorite(user.id, id, input.value));
      }
      case "mute": {
        const input = await parseBody(req, muteBody);
        return NextResponse.json(await setMuted(user.id, id, input.hours));
      }
      case "notification-level": {
        const input = await parseBody(req, levelBody);
        return NextResponse.json(await setNotificationLevel(user.id, id, input.level));
      }
      case "members": {
        const input = await parseBody(req, membersBody);
        return NextResponse.json({ conversation: await addMembers(user.id, id, input.userIds) });
      }
      case "remove-member": {
        const input = await parseBody(req, memberBody);
        await removeMember(user.id, id, input.userId);
        return NextResponse.json({ ok: true });
      }
      case "leave":
        await leaveConversation(user.id, id);
        return NextResponse.json({ ok: true });
      case "role": {
        const input = await parseBody(req, roleBody);
        await setMemberRole(user.id, id, input.userId, input.role);
        return NextResponse.json({ ok: true });
      }
      case "invite": {
        const input = await parseBody(req, createGroupInviteSchema);
        return NextResponse.json(
          { invite: await createGroupInvite(user.id, id, input.identifier) },
          { status: 201 },
        );
      }
      default:
        throw new AppError(404, "NOT_FOUND", "Unknown conversation action.");
    }
  });
}
