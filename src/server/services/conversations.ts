import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { createConversationSchema } from "@/lib/schemas";
import type { z } from "zod";
import {
  assertNotBlocked,
  requireAdmin,
  requireMembership,
  requireOwner,
} from "@/server/authorization";
import { conversationInclude } from "@/server/includes";
import {
  serializeConversation,
  publicUser,
  type ConversationDTO,
} from "@/server/serializers";
import { emitToUsers } from "@/server/realtime";
import {
  emitNewMessage,
  markConversationRead,
  sendMessage,
} from "@/server/services/messages";
import { createNotification } from "@/server/services/notifications";
import { deleteStorageObject } from "@/server/storage";

/* eslint-disable @typescript-eslint/no-explicit-any */

type CreateInput = z.infer<typeof createConversationSchema>;

function directKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

async function unreadCountFor(conversationId: string, userId: string, lastReadAt: Date | null) {
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      createdAt: { gt: lastReadAt ?? new Date(0) },
    },
  });
}

async function buildConversationDTO(conversation: any, viewerId: string): Promise<ConversationDTO> {
  const membership = conversation.members.find((m: any) => m.userId === viewerId);
  const unread = membership
    ? await unreadCountFor(conversation.id, viewerId, membership.lastReadAt)
    : 0;
  return serializeConversation(conversation, viewerId, unread);
}

export async function getConversationDTO(viewerId: string, conversationId: string) {
  await requireMembership(viewerId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude(viewerId),
  });
  if (!conversation) throw notFound("Conversation not found.");
  return buildConversationDTO(conversation, viewerId);
}

export async function listConversations(
  viewerId: string,
  options: { filter?: string; query?: string; includeArchived?: boolean } = {},
) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: viewerId },
    include: {
      conversation: {
        include: conversationInclude(viewerId),
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
  });
  const now = Date.now();
  const list: ConversationDTO[] = [];
  for (const membership of memberships) {
    const conversation = membership.conversation;
    if (conversation.isTemporary && conversation.expiresAt && conversation.expiresAt.getTime() <= now) {
      continue;
    }
    const dto = await buildConversationDTO(conversation, viewerId);
    list.push(dto);
  }
  const query = options.query?.trim().toLowerCase();
  const filtered = list.filter((conversation) => {
    const filter = options.filter ?? "all";
    if (filter === "archived" && !conversation.isArchived) return false;
    if (filter !== "archived" && conversation.isArchived && !options.includeArchived) return false;
    if (filter === "unread" && conversation.unreadCount === 0) return false;
    if (filter === "groups" && conversation.type === "DIRECT") return false;
    if (filter === "rooms" && conversation.type !== "ROOM") return false;
    if (filter === "favorites" && !conversation.isFavorite) return false;
    if (query) {
      const haystack = [
        conversation.title,
        conversation.description ?? "",
        conversation.lastMessage?.body ?? "",
        ...conversation.members.map((m) => `${m.user.name} ${m.user.username}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  filtered.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
  return filtered;
}

export async function createSystemMessage(conversationId: string, senderId: string, body: string) {
  const message = await prisma.message.create({
    data: { conversationId, senderId, body, type: "SYSTEM" },
    select: { id: true },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
  await emitNewMessage(conversationId, message.id);
  return message.id;
}

async function emitConversationNew(conversationId: string, userIds: string[]) {
  for (const userId of userIds) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude(userId),
    });
    if (!conversation) continue;
    emitToUsers([userId], "conversation:new", await buildConversationDTO(conversation, userId));
  }
}

async function emitConversationUpdated(conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  emitToUsers(
    members.map((m) => m.userId),
    "conversation:updated",
    { conversationId, refresh: true },
  );
}

export async function getOrCreateDirect(viewerId: string, targetUserId: string) {
  if (targetUserId === viewerId) throw badRequest("You cannot message yourself.");
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, settings: { select: { discoverable: true } } },
  });
  if (!target) throw notFound("User not found.");
  const contact = await prisma.contact.findUnique({
    where: { ownerId_contactUserId: { ownerId: viewerId, contactUserId: targetUserId } },
    select: { id: true },
  });
  if (target.settings?.discoverable === false && !contact) {
    throw forbidden("This person has turned off contact discovery.");
  }
  await assertNotBlocked(viewerId, targetUserId);
  const key = directKey(viewerId, targetUserId);
  let conversation = await prisma.conversation.findUnique({
    where: { directKey: key },
    include: conversationInclude(viewerId),
  });
  if (!conversation) {
    try {
      conversation = await prisma.conversation.create({
        data: {
          type: "DIRECT",
          directKey: key,
          createdById: viewerId,
          members: {
            create: [{ userId: viewerId }, { userId: targetUserId }],
          },
        },
        include: conversationInclude(viewerId),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        conversation = await prisma.conversation.findUnique({
          where: { directKey: key },
          include: conversationInclude(viewerId),
        });
      } else {
        throw error;
      }
    }
  }
  if (!conversation) throw new Error("Could not create conversation.");
  // Someone may have deleted the chat from their sidebar; restore membership.
  await prisma.conversationMember.createMany({
    data: [{ conversationId: conversation.id, userId: viewerId }],
    skipDuplicates: true,
  });
  await prisma.conversationMember.createMany({
    data: [{ conversationId: conversation.id, userId: targetUserId }],
    skipDuplicates: true,
  });
  const fresh = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: conversationInclude(viewerId),
  });
  const dto = await buildConversationDTO(fresh, viewerId);
  emitToUsers([targetUserId], "conversation:new", await buildConversationDTO(fresh, targetUserId));
  return dto;
}

export async function createConversation(viewerId: string, input: CreateInput): Promise<ConversationDTO> {
  if (input.kind === "direct") {
    const target = input.memberIds[0];
    if (!target) throw badRequest("Choose someone to message.");
    return getOrCreateDirect(viewerId, target);
  }
  const title = input.title?.trim();
  if (!title) throw badRequest("Give this conversation a name.");
  const memberIds = [...new Set(input.memberIds.filter((id) => id !== viewerId))].slice(0, 49);
  if (!memberIds.length) throw badRequest("Add at least one member.");
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true },
  });
  if (users.length !== memberIds.length) throw badRequest("One or more members no longer exist.");
  const expiresAt =
    input.kind === "room" && input.expiresInHours
      ? new Date(Date.now() + input.expiresInHours * 3600_000)
      : input.kind === "room"
        ? new Date(Date.now() + 7 * 24 * 3600_000)
        : null;
  const conversation = await prisma.conversation.create({
    data: {
      type: input.kind === "room" ? "ROOM" : "GROUP",
      title,
      description: input.description ?? null,
      createdById: viewerId,
      isTemporary: input.kind === "room",
      expiresAt,
      members: {
        create: [
          { userId: viewerId, role: "OWNER" },
          ...memberIds.map((id) => ({ userId: id, role: "MEMBER" as const })),
        ],
      },
      workspace: {
        create: { name: title, createdById: viewerId, description: input.description ?? null },
      },
    },
    include: conversationInclude(viewerId),
  });
  await createSystemMessage(
    conversation.id,
    viewerId,
    `${input.kind === "room" ? "Room" : "Group"} created by member.`,
  );
  await emitConversationNew(conversation.id, [viewerId, ...memberIds]);
  if (input.firstMessage?.trim()) {
    await sendMessage(viewerId, conversation.id, {
      body: input.firstMessage.trim(),
      clientId: `first_${randomBytes(8).toString("hex")}`,
      replyToId: null,
      attachmentIds: [],
      contextCards: [],
    });
  }
  const fresh = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: conversationInclude(viewerId),
  });
  return buildConversationDTO(fresh, viewerId);
}

export async function updateConversation(
  viewerId: string,
  conversationId: string,
  input: {
    title?: string;
    description?: string | null;
    avatarUrl?: string | null;
    expiresAt?: string | null;
    isTemporary?: boolean;
  },
) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw notFound("Conversation not found.");
  await requireAdmin(viewerId, conversationId);
  if (conversation.type === "DIRECT") {
    throw forbidden("Direct conversation details cannot be changed.");
  }
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const date = new Date(input.expiresAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw badRequest("Expiration must be in the future.");
    }
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
        : {}),
      ...(input.isTemporary !== undefined ? { isTemporary: input.isTemporary } : {}),
    },
  });
  await emitConversationUpdated(conversationId);
  return getConversationDTO(viewerId, conversationId);
}

export async function setArchived(viewerId: string, conversationId: string, archived: boolean) {
  await requireMembership(viewerId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    data: { isArchived: archived },
  });
  return { archived };
}

export async function setFavorite(viewerId: string, conversationId: string, favorite: boolean) {
  await requireMembership(viewerId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    data: { isFavorite: favorite },
  });
  return { favorite };
}

export async function setMuted(
  viewerId: string,
  conversationId: string,
  hours: number | null,
) {
  await requireMembership(viewerId, conversationId);
  const mutedUntil = hours ? new Date(Date.now() + hours * 3600_000) : null;
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    data: { mutedUntil },
  });
  return { mutedUntil: mutedUntil?.toISOString() ?? null };
}

export async function setNotificationLevel(
  viewerId: string,
  conversationId: string,
  level: "ALL" | "MENTIONS" | "NONE",
) {
  await requireMembership(viewerId, conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    data: { notificationLevel: level },
  });
  return { level };
}

export async function addMembers(viewerId: string, conversationId: string, userIds: string[]) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw notFound("Conversation not found.");
  await requireAdmin(viewerId, conversationId);
  if (conversation.type === "DIRECT") throw badRequest("Direct chats have exactly two members.");
  const existing = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((m) => m.userId));
  const unique = [...new Set(userIds)].filter((id) => !existingIds.has(id));
  if (existingIds.size + unique.length > 50) throw badRequest("Groups are limited to 50 members.");
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (!users.length) return getConversationDTO(viewerId, conversationId);
  const addedIds = users.map((u) => u.id);
  await prisma.conversationMember.createMany({
    data: addedIds.map((userId) => ({ conversationId, userId, invitedById: viewerId })),
    skipDuplicates: true,
  });
  await createSystemMessage(conversationId, viewerId, `${addedIds.length} member(s) added.`);
  await emitConversationNew(conversationId, addedIds);
  await emitConversationUpdated(conversationId);
  for (const userId of addedIds) {
    await createNotification({
      userId,
      actorId: viewerId,
      conversationId,
      type: "GROUP_INVITE",
      title: "You were added to a conversation",
      body: conversation.title ?? "A group conversation",
    });
  }
  return getConversationDTO(viewerId, conversationId);
}

export async function removeMember(viewerId: string, conversationId: string, targetId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw notFound("Conversation not found.");
  const actor = await requireAdmin(viewerId, conversationId);
  if (targetId === viewerId) throw badRequest("Use Leave instead.");
  const target = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetId } },
  });
  if (!target) throw notFound("That person is not in this conversation.");
  if (target.role === "OWNER") throw forbidden("The owner cannot be removed.");
  if (target.role === "ADMIN" && actor.role !== "OWNER") {
    throw forbidden("Only the owner can remove an admin.");
  }
  await prisma.conversationMember.delete({ where: { id: target.id } });
  await createSystemMessage(conversationId, viewerId, "A member was removed.");
  emitToUsers([targetId], "conversation:removed", { conversationId });
  await emitConversationUpdated(conversationId);
}

export async function leaveConversation(viewerId: string, conversationId: string) {
  const membership = await requireMembership(viewerId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { orderBy: { joinedAt: "asc" } } },
  });
  if (!conversation) throw notFound("Conversation not found.");
  if (membership.role === "OWNER" && conversation.type !== "DIRECT") {
    const successor =
      conversation.members.find((m) => m.userId !== viewerId && m.role === "ADMIN") ??
      conversation.members.find((m) => m.userId !== viewerId);
    if (successor) {
      await prisma.conversationMember.update({
        where: { id: successor.id },
        data: { role: "OWNER" },
      });
    }
  }
  await prisma.conversationMember.delete({ where: { id: membership.id } });
  if (conversation.type !== "DIRECT") {
    await createSystemMessage(conversationId, viewerId, "A member left.");
  }
  const remaining = await prisma.conversationMember.count({ where: { conversationId } });
  if (remaining === 0) {
    await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => {});
  } else {
    await emitConversationUpdated(conversationId);
  }
}

export async function setMemberRole(
  viewerId: string,
  conversationId: string,
  targetId: string,
  role: "ADMIN" | "MEMBER",
) {
  await requireOwner(viewerId, conversationId);
  if (targetId === viewerId) throw badRequest("You cannot change your own role.");
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: targetId } },
    data: { role },
  });
  await createSystemMessage(conversationId, viewerId, `Member role changed to ${role.toLowerCase()}.`);
  await emitConversationUpdated(conversationId);
}

export async function createGroupInvite(viewerId: string, conversationId: string, identifier: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw notFound("Conversation not found.");
  await requireMembership(viewerId, conversationId);
  if (conversation.type === "DIRECT") throw badRequest("Direct chats do not need invites.");
  const value = identifier.trim().toLowerCase();
  const invitee = await prisma.user.findFirst({
    where: value.includes("@") ? { email: value } : { username: value },
    select: { id: true, name: true },
  });
  if (!invitee) throw notFound("No user found with that username or email.");
  if (invitee.id === viewerId) throw badRequest("You are already here.");
  const already = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: invitee.id } },
  });
  if (already) throw conflict("That person is already a member.");
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: invitee.id, blockedId: viewerId },
        { blockerId: viewerId, blockedId: invitee.id },
      ],
    },
  });
  if (blocked) throw forbidden("This person cannot be invited.");
  const pending = await prisma.groupInvite.findFirst({
    where: { conversationId, inviteeId: invitee.id, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (pending) throw conflict("An invite is already pending for this person.");
  const invite = await prisma.groupInvite.create({
    data: {
      conversationId,
      inviterId: viewerId,
      inviteeId: invitee.id,
      token: randomBytes(24).toString("base64url"),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  await createNotification({
    userId: invitee.id,
    actorId: viewerId,
    conversationId,
    type: "GROUP_INVITE",
    title: "Group invitation",
    body: `You were invited to join ${conversation.title ?? "a conversation"}.`,
    metadata: { inviteToken: invite.token, inviteId: invite.id },
  });
  return {
    id: invite.id,
    token: invite.token,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function listIncomingInvites(viewerId: string) {
  const invites = await prisma.groupInvite.findMany({
    where: { inviteeId: viewerId, status: "PENDING", expiresAt: { gt: new Date() } },
    include: {
      conversation: { select: { id: true, title: true, description: true, type: true } },
      inviter: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return invites.map((invite) => ({
    id: invite.id,
    token: invite.token,
    conversation: invite.conversation,
    inviter: publicUser(invite.inviter),
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  }));
}

export async function acceptInvite(viewerId: string, token: string) {
  const invite = await prisma.groupInvite.findUnique({ where: { token } });
  if (!invite || invite.inviteeId !== viewerId) throw notFound("Invitation not found.");
  if (invite.status !== "PENDING") throw badRequest("This invitation is no longer valid.");
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.groupInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    throw badRequest("This invitation has expired.");
  }
  await prisma.$transaction([
    prisma.conversationMember.createMany({
      data: [{ conversationId: invite.conversationId, userId: viewerId, invitedById: invite.inviterId }],
      skipDuplicates: true,
    }),
    prisma.groupInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } }),
    prisma.notification.updateMany({
      where: {
        userId: viewerId,
        type: "GROUP_INVITE",
        conversationId: invite.conversationId,
        isRead: false,
      },
      data: { isRead: true },
    }),
  ]);
  await createSystemMessage(invite.conversationId, viewerId, "A new member joined.");
  await emitConversationNew(invite.conversationId, [viewerId]);
  await emitConversationUpdated(invite.conversationId);
  return getConversationDTO(viewerId, invite.conversationId);
}

export async function declineInvite(viewerId: string, inviteId: string) {
  const invite = await prisma.groupInvite.findFirst({
    where: { id: inviteId, inviteeId: viewerId, status: "PENDING" },
  });
  if (!invite) throw notFound("Invitation not found.");
  await prisma.$transaction([
    prisma.groupInvite.update({ where: { id: invite.id }, data: { status: "DECLINED" } }),
    prisma.notification.updateMany({
      where: { userId: viewerId, type: "GROUP_INVITE", conversationId: invite.conversationId },
      data: { isRead: true },
    }),
  ]);
}

export async function exportRoom(viewerId: string, conversationId: string) {
  await requireMembership(viewerId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: { include: { user: true } },
      workspace: { include: { items: { orderBy: { createdAt: "asc" } } } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { sender: true, attachments: true, poll: { include: { options: { include: { votes: true } } } } },
      },
      pins: { include: { message: { include: { sender: true } } } },
    },
  });
  if (!conversation) throw notFound("Conversation not found.");
  const lines: string[] = [
    `# ${conversation.title ?? "Conversation"}`,
    "",
    conversation.description ?? "",
    "",
    `Exported ${new Date().toISOString()} from NEXA.`,
    conversation.expiresAt ? `Room expiry: ${conversation.expiresAt.toISOString()}` : "",
    "",
    "## Members",
    ...conversation.members.map((m) => `- ${m.user.name} (@${m.user.username}) — ${m.role}`),
    "",
    "## Pinned messages",
    ...(conversation.pins.length
      ? conversation.pins.map(
          (pin) => `- ${pin.message.sender.name}: ${pin.message.body.slice(0, 240)}`,
        )
      : ["_None_"]),
    "",
  ];
  if (conversation.workspace?.items.length) {
    lines.push("## Workspace", "");
    for (const item of conversation.workspace.items) {
      lines.push(
        `### ${item.type}: ${item.title}`,
        `Status: ${item.status}${item.dueAt ? ` · Due ${item.dueAt.toISOString()}` : ""}`,
        item.content ?? "",
        "",
      );
    }
  }
  lines.push("## Messages", "");
  for (const message of conversation.messages) {
    const time = message.createdAt.toISOString();
    if (message.type === "SYSTEM") {
      lines.push(`_${message.body}_ (${time})`, "");
      continue;
    }
    lines.push(`**${message.sender.name}** · ${time}`);
    lines.push(message.body || "_No text_");
    for (const attachment of message.attachments) {
      lines.push(`- Attachment: ${attachment.originalName} (${attachment.mimeType}, ${attachment.size} bytes)`);
    }
    if (message.poll) {
      lines.push("", `Poll: ${message.poll.question}`);
      for (const option of message.poll.options) {
        lines.push(`- ${option.label}: ${option.votes.length} vote(s)`);
      }
    }
    lines.push("");
  }
  const filename = `${(conversation.title ?? "nexa-room").replace(/[^\w-]+/g, "-").toLowerCase()}.md`;
  return { filename, content: lines.filter((line) => line !== undefined).join("\n") };
}

export async function deleteConversation(viewerId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conversation) throw notFound("Conversation not found.");
  await requireOwner(viewerId, conversationId);
  const attachments = await prisma.attachment.findMany({
    where: { message: { conversationId } },
    select: { storageKey: true },
  });
  await prisma.conversation.delete({ where: { id: conversationId } });
  await Promise.allSettled(attachments.map((a) => deleteStorageObject(a.storageKey)));
  emitToUsers(
    conversation.members.map((m) => m.userId),
    "conversation:removed",
    { conversationId },
  );
}

export async function markReadFallback(viewerId: string, conversationId: string) {
  return markConversationRead(viewerId, conversationId);
}

export async function getDirectPeerId(conversationId: string, viewerId: string) {
  const peer = await prisma.conversationMember.findFirst({
    where: { conversationId, userId: { not: viewerId } },
    select: { userId: true },
  });
  return peer?.userId ?? null;
}
