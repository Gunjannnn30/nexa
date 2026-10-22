import { randomUUID } from "node:crypto";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { truncate } from "@/lib/utils";
import type { sendMessageSchema } from "@/lib/schemas";
import { assertNotBlocked, requireMembership } from "@/server/authorization";
import { userSelect } from "@/server/includes";
import { messageInclude as includeForViewer } from "@/server/includes";
import {
  serializeMessage,
  type MessageDTO,
  type PollDTO,
  type ReactionGroupDTO,
} from "@/server/serializers";
import { emitToConversation, emitToUsers } from "@/server/realtime";
import { duplicateStorageObject, deleteStorageObject } from "@/server/storage";
import { createNotification } from "@/server/services/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SendInput = z.infer<typeof sendMessageSchema>;

const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_]{3,24})/g;

export async function getMessageDTO(messageId: string, viewerId: string): Promise<MessageDTO> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: includeForViewer(viewerId),
  });
  if (!message) throw notFound("Message not found.");
  return serializeMessage(message, viewerId);
}

async function emitNewMessage(conversationId: string, messageId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  for (const member of members) {
    const dto = await getMessageDTO(messageId, member.userId);
    emitToUsers([member.userId], "message:new", dto);
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { lastMessageAt: true },
  });
  emitToUsers(
    members.map((m) => m.userId),
    "conversation:updated",
    { conversationId, lastMessageAt: conversation?.lastMessageAt?.toISOString() ?? null },
  );
}

export async function emitMessageUpdate(conversationId: string, messageId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  for (const member of members) {
    const dto = await getMessageDTO(messageId, member.userId);
    emitToUsers([member.userId], "message:updated", dto);
  }
}

export async function sendMessage(
  senderId: string,
  conversationId: string,
  input: SendInput,
): Promise<MessageDTO> {
  await requireMembership(senderId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              settings: { select: { notificationsEnabled: true } },
            },
          },
        },
      },
    },
  });
  if (!conversation) throw notFound("Conversation not found.");

  if (conversation.type === "DIRECT") {
    const peer = conversation.members.find((m) => m.userId !== senderId);
    if (!peer) throw badRequest("This conversation has no recipient.");
    await assertNotBlocked(senderId, peer.userId);
  }

  const existing = await prisma.message.findFirst({
    where: { conversationId, clientId: input.clientId },
    include: includeForViewer(senderId),
  });
  if (existing) return serializeMessage(existing, senderId);

  if (input.replyToId) {
    const reply = await prisma.message.findFirst({
      where: { id: input.replyToId, conversationId },
      select: { id: true },
    });
    if (!reply) throw badRequest("The message you replied to is no longer available.");
  }

  if (input.attachmentIds.length) {
    const attachments = await prisma.attachment.findMany({
      where: {
        id: { in: input.attachmentIds },
        uploaderId: senderId,
        messageId: null,
      },
      select: { id: true },
    });
    if (attachments.length !== new Set(input.attachmentIds).size) {
      throw badRequest("One or more attachments are not available. Upload them again.");
    }
  }

  const memberIds = conversation.members.map((m) => m.userId);
  const usernames = new Set<string>();
  for (const match of input.body.matchAll(MENTION_RE)) {
    usernames.add(match[1]!.toLowerCase());
  }
  const mentioned = conversation.members.filter(
    (m) => m.userId !== senderId && usernames.has(m.user.username.toLowerCase()),
  );

  const clientId = input.clientId;
  const messageId = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId,
        senderId,
        clientId,
        body: input.body.replace(/\u0000/g, "").trim(),
        replyToId: input.replyToId || null,
        forwardedFromId: input.forwardedFromId || null,
        type: input.poll ? "POLL" : "TEXT",
        receipts: {
          create: memberIds
            .filter((id) => id !== senderId)
            .map((userId) => ({ userId, deliveredAt: null, readAt: null })),
        },
        mentions: {
          create: mentioned.map((member) => ({ userId: member.userId })),
        },
        contextCards: {
          create: (input.contextCards ?? []).map((card) => ({
            type: card.type,
            title: card.title,
            data: (card.data ?? {}) as Prisma.InputJsonValue,
          })),
        },
        ...(input.poll
          ? {
              poll: {
                create: {
                  question: input.poll.question,
                  allowsMultiple: input.poll.allowsMultiple,
                  closesAt: input.poll.closesInHours
                    ? new Date(Date.now() + input.poll.closesInHours * 3600_000)
                    : null,
                  createdById: senderId,
                  options: {
                    create: input.poll.options.map((label, index) => ({ label, order: index })),
                  },
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (input.attachmentIds.length) {
      await tx.attachment.updateMany({
        where: {
          id: { in: input.attachmentIds },
          uploaderId: senderId,
          messageId: null,
        },
        data: { messageId: message.id },
      });
    }
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    return message.id;
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.message.findFirst({
        where: { conversationId, clientId },
        select: { id: true },
      });
      if (duplicate) return duplicate.id;
    }
    throw error;
  });

  const sender = conversation.members.find((m) => m.userId === senderId)?.user;
  const now = Date.now();
  for (const member of mentioned) {
    const muted = member.mutedUntil && member.mutedUntil.getTime() > now;
    if (muted || member.notificationLevel === "NONE") continue;
    if (member.notificationLevel === "MENTIONS" || member.notificationLevel === "ALL") {
      if (member.user.settings?.notificationsEnabled === false) continue;
      await createNotification({
        userId: member.userId,
        actorId: senderId,
        conversationId,
        messageId,
        type: "MENTION",
        title: `${sender?.name ?? "Someone"} mentioned you`,
        body: truncate(input.body.replace(/\s+/g, " "), 140),
      });
    }
  }

  await emitNewMessage(conversationId, messageId);
  if (input.body.trim()) {
    void import("@/server/ai/embeddings")
      .then((module) => module.indexMessageEmbedding(messageId))
      .catch(() => {});
  }
  return getMessageDTO(messageId, senderId);
}

export async function listMessages(
  viewerId: string,
  conversationId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  await requireMembership(viewerId, conversationId);
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: includeForViewer(viewerId),
  });
  const hasMore = messages.length > limit;
  const page = messages.slice(0, limit).reverse();
  return {
    messages: page.map((message) => serializeMessage(message, viewerId)),
    nextCursor: hasMore ? page[0]?.id ?? null : null,
    hasMore,
  };
}

export async function listMessagesAround(
  viewerId: string,
  conversationId: string,
  focusId: string,
  radius = 25,
) {
  await requireMembership(viewerId, conversationId);
  const size = Math.min(Math.max(radius, 5), 50);
  const focus = await prisma.message.findFirst({
    where: { id: focusId, conversationId },
    select: { id: true, createdAt: true },
  });
  if (!focus) throw notFound("Message not found.");
  const [olderDesc, newerAsc] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId, createdAt: { lt: focus.createdAt } },
      orderBy: { createdAt: "desc" },
      take: size,
      include: includeForViewer(viewerId),
    }),
    prisma.message.findMany({
      where: { conversationId, createdAt: { gte: focus.createdAt } },
      orderBy: { createdAt: "asc" },
      take: size + 1,
      include: includeForViewer(viewerId),
    }),
  ]);
  const older = olderDesc.reverse();
  const hasMoreNewer = newerAsc.length > size;
  const page = [...older, ...newerAsc.slice(0, size)];
  return {
    messages: page.map((message) => serializeMessage(message, viewerId)),
    nextCursor: older.length === size ? older[0]?.id ?? null : null,
    hasMore: older.length === size,
    hasMoreNewer,
    focusId,
  };
}

export async function editMessage(viewerId: string, messageId: string, body: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { type: true } } },
  });
  if (!message) throw notFound("Message not found.");
  await requireMembership(viewerId, message.conversationId);
  if (message.senderId !== viewerId) throw forbidden("You can only edit your own messages.");
  if (message.deletedAt) throw badRequest("Deleted messages cannot be edited.");
  if (message.type === "SYSTEM") throw badRequest("System messages cannot be edited.");
  await prisma.message.update({
    where: { id: messageId },
    data: { body: body.trim(), editedAt: new Date() },
  });
  await emitMessageUpdate(message.conversationId, messageId);
  return getMessageDTO(messageId, viewerId);
}

export async function deleteMessage(viewerId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { attachments: true },
  });
  if (!message) throw notFound("Message not found.");
  const membership = await requireMembership(viewerId, message.conversationId);
  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";
  if (message.senderId !== viewerId && !isAdmin) {
    throw forbidden("You can only delete your own messages.");
  }
  if (message.deletedAt) return;
  await prisma.$transaction([
    prisma.message.update({
      where: { id: messageId },
      data: { body: "", deletedAt: new Date() },
    }),
    prisma.attachment.deleteMany({ where: { messageId } }),
    prisma.conversationPin.deleteMany({ where: { messageId } }),
    prisma.messageEmbedding.deleteMany({ where: { messageId } }),
  ]);
  await Promise.allSettled(message.attachments.map((a) => deleteStorageObject(a.storageKey)));
  emitToUsers(
    (
      await prisma.conversationMember.findMany({
        where: { conversationId: message.conversationId },
        select: { userId: true },
      })
    ).map((m) => m.userId),
    "message:deleted",
    { id: messageId, conversationId: message.conversationId },
  );
}

export async function toggleReaction(viewerId: string, messageId: string, emoji: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, deletedAt: true },
  });
  if (!message) throw notFound("Message not found.");
  await requireMembership(viewerId, message.conversationId);
  if (message.deletedAt) throw badRequest("Deleted messages cannot be reacted to.");
  if (emoji.length > 16 || /[\s<>]/.test(emoji)) throw badRequest("Invalid reaction.");
  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: viewerId, emoji } },
  });
  if (existing) await prisma.reaction.delete({ where: { id: existing.id } });
  else await prisma.reaction.create({ data: { messageId, userId: viewerId, emoji } });

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });
  emitToConversation(message.conversationId, "reactions:updated", {
    messageId,
    conversationId: message.conversationId,
    reactions,
  });
  return serializeReactionsRaw(reactions, viewerId);
}

export function serializeReactionsRaw(reactions: { emoji: string; userId: string }[], viewerId: string): ReactionGroupDTO[] {
  const map = new Map<string, { count: number; userIds: string[] }>();
  for (const reaction of reactions) {
    const entry = map.get(reaction.emoji) ?? { count: 0, userIds: [] };
    entry.count += 1;
    entry.userIds.push(reaction.userId);
    map.set(reaction.emoji, entry);
  }
  return [...map.entries()]
    .map(([emoji, value]) => ({
      emoji,
      count: value.count,
      userIds: value.userIds,
      mine: value.userIds.includes(viewerId),
    }))
    .sort((a, b) => b.count - a.count);
}

export async function toggleBookmark(viewerId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) throw notFound("Message not found.");
  await requireMembership(viewerId, message.conversationId);
  const existing = await prisma.bookmark.findUnique({
    where: { userId_messageId: { userId: viewerId, messageId } },
  });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { starred: false };
  }
  await prisma.bookmark.create({ data: { userId: viewerId, messageId } });
  return { starred: true };
}

export async function togglePin(viewerId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) throw notFound("Message not found.");
  await requireMembership(viewerId, message.conversationId);
  const existing = await prisma.conversationPin.findUnique({
    where: { conversationId_messageId: { conversationId: message.conversationId, messageId } },
  });
  if (existing) {
    await prisma.conversationPin.delete({ where: { id: existing.id } });
  } else {
    const count = await prisma.conversationPin.count({
      where: { conversationId: message.conversationId },
    });
    if (count >= 10) throw badRequest("You can pin at most 10 messages per conversation.");
    await prisma.conversationPin.create({
      data: {
        conversationId: message.conversationId,
        messageId,
        pinnedById: viewerId,
      },
    });
  }
  const pins = await prisma.conversationPin.findMany({
    where: { conversationId: message.conversationId },
    select: { messageId: true },
  });
  emitToConversation(message.conversationId, "pins:updated", {
    conversationId: message.conversationId,
    messageIds: pins.map((p) => p.messageId),
  });
  return { pinned: !existing };
}

export async function addContextCard(
  viewerId: string,
  messageId: string,
  card: { type: "TASK" | "DATE" | "DECISION" | "FILE" | "LINK"; title: string; data?: Record<string, unknown> },
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) throw notFound("Message not found.");
  await requireMembership(viewerId, message.conversationId);
  const count = await prisma.messageContext.count({ where: { messageId } });
  if (count >= 10) throw badRequest("A message can have at most 10 context cards.");
  const created = await prisma.messageContext.create({
    data: {
      messageId,
      type: card.type,
      title: card.title,
      data: (card.data ?? {}) as Prisma.InputJsonValue,
    },
  });
  await emitMessageUpdate(message.conversationId, messageId);
  return {
    id: created.id,
    type: created.type,
    title: created.title,
    data: created.data,
  };
}

export async function removeContextCard(viewerId: string, messageId: string, cardId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });
  if (!message) throw notFound("Message not found.");
  await requireMembership(viewerId, message.conversationId);
  await prisma.messageContext.deleteMany({ where: { id: cardId, messageId } });
  await emitMessageUpdate(message.conversationId, messageId);
}

export async function getPinnedMessages(viewerId: string, conversationId: string) {
  await requireMembership(viewerId, conversationId);
  const pins = await prisma.conversationPin.findMany({
    where: { conversationId, message: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { message: { include: includeForViewer(viewerId) } },
  });
  return pins.map((pin) => serializeMessage(pin.message, viewerId));
}

export async function listStarredMessages(viewerId: string) {
  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId: viewerId,
      message: {
        deletedAt: null,
        conversation: { members: { some: { userId: viewerId } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      message: {
        include: {
          ...includeForViewer(viewerId),
          conversation: { select: { id: true, type: true, title: true } },
        },
      },
    },
  });
  return bookmarks.map((bookmark) => ({
    starredAt: bookmark.createdAt.toISOString(),
    message: serializeMessage(bookmark.message, viewerId),
    conversation: {
      id: bookmark.message.conversationId,
      type: bookmark.message.conversation.type,
      title: bookmark.message.conversation.title,
    },
  }));
}

export async function votePoll(viewerId: string, messageId: string, optionIds: string[]) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      poll: {
        include: {
          options: { include: { votes: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!message?.poll) throw notFound("Poll not found.");
  await requireMembership(viewerId, message.conversationId);
  if (message.deletedAt) throw badRequest("This poll was deleted.");
  if (message.poll.closesAt && message.poll.closesAt.getTime() < Date.now()) {
    throw badRequest("This poll has closed.");
  }
  const optionIdSet = new Set(optionIds);
  const valid = message.poll.options.filter((option) => optionIdSet.has(option.id));
  if (valid.length !== optionIdSet.size) throw badRequest("Invalid poll option.");
  if (!message.poll.allowsMultiple && valid.length > 1) {
    throw badRequest("This poll only allows one choice.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.pollVote.deleteMany({
      where: {
        userId: viewerId,
        option: { pollId: message.poll!.id },
      },
    });
    await tx.pollVote.createMany({
      data: valid.map((option) => ({ pollOptionId: option.id, userId: viewerId })),
      skipDuplicates: true,
    });
  });

  const poll = await prisma.poll.findUnique({
    where: { id: message.poll.id },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: { votes: { select: { userId: true } } },
      },
    },
  });
  const payload = {
    messageId,
    conversationId: message.conversationId,
    question: poll!.question,
    allowsMultiple: poll!.allowsMultiple,
    closesAt: poll!.closesAt?.toISOString() ?? null,
    options: poll!.options.map((option) => ({
      id: option.id,
      label: option.label,
      userIds: option.votes.map((vote) => vote.userId),
    })),
    totalVotes: poll!.options.reduce((sum, option) => sum + option.votes.length, 0),
  };
  emitToConversation(message.conversationId, "poll:updated", payload);
  return {
    id: poll!.id,
    messageId,
    question: poll!.question,
    allowsMultiple: poll!.allowsMultiple,
    closesAt: poll!.closesAt?.toISOString() ?? null,
    closed: Boolean(poll!.closesAt && poll!.closesAt.getTime() <= Date.now()),
    totalVotes: payload.totalVotes,
    options: payload.options.map((option) => ({
      id: option.id,
      label: option.label,
      votes: option.userIds.length,
      mine: option.userIds.includes(viewerId),
    })),
  } satisfies PollDTO & { messageId: string };
}

export async function markConversationRead(viewerId: string, conversationId: string) {
  await requireMembership(viewerId, conversationId);
  const now = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    data: { lastReadAt: now, lastDeliveredAt: now },
  });
  const settings = await prisma.userSettings.findUnique({
    where: { userId: viewerId },
    select: { readReceipts: true },
  });
  let readAt: string | null = null;
  if (settings?.readReceipts !== false) {
    await prisma.$executeRaw`
      UPDATE "MessageReceipt" r
      SET "readAt" = COALESCE(r."readAt", ${now}),
          "deliveredAt" = COALESCE(r."deliveredAt", ${now})
      FROM "Message" m
      WHERE r."messageId" = m.id
        AND r."userId" = ${viewerId}
        AND m."conversationId" = ${conversationId}
        AND m."senderId" <> ${viewerId}
        AND r."readAt" IS NULL
    `;
    readAt = now.toISOString();
    emitToConversation(conversationId, "receipts:update", {
      conversationId,
      userId: viewerId,
      readAt,
      deliveredAt: readAt,
    });
  }
  return { readAt };
}

export async function markConversationDelivered(viewerId: string, conversationId: string) {
  await requireMembership(viewerId, conversationId);
  const now = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: viewerId } },
    data: { lastDeliveredAt: now },
  });
  await prisma.$executeRaw`
    UPDATE "MessageReceipt" r
    SET "deliveredAt" = COALESCE(r."deliveredAt", ${now})
    FROM "Message" m
    WHERE r."messageId" = m.id
      AND r."userId" = ${viewerId}
      AND m."conversationId" = ${conversationId}
      AND m."senderId" <> ${viewerId}
      AND r."deliveredAt" IS NULL
  `;
  emitToConversation(conversationId, "receipts:update", {
    conversationId,
    userId: viewerId,
    deliveredAt: now.toISOString(),
  });
}

export async function forwardMessage(
  viewerId: string,
  messageId: string,
  targetConversationIds: string[],
) {
  const source = await prisma.message.findUnique({
    where: { id: messageId },
    include: { attachments: true, poll: true },
  });
  if (!source || source.deletedAt) throw notFound("Message not found.");
  await requireMembership(viewerId, source.conversationId);
  const uniqueTargets = [...new Set(targetConversationIds)].slice(0, 5);
  if (!uniqueTargets.length) throw badRequest("Choose at least one conversation.");
  if (uniqueTargets.includes(source.conversationId)) {
    throw badRequest("Choose a different conversation to forward to.");
  }
  const results: MessageDTO[] = [];
  for (const targetId of uniqueTargets) {
    await requireMembership(viewerId, targetId);
    const attachmentIds: string[] = [];
    for (const attachment of source.attachments) {
      const extension = path.extname(attachment.storageKey);
      const storageKey = `${viewerId}/${Date.now()}-${randomUUID()}${extension}`;
      await duplicateStorageObject(attachment.storageKey, storageKey);
      const copy = await prisma.attachment.create({
        data: {
          storageKey,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          kind: attachment.kind,
          width: attachment.width,
          height: attachment.height,
          durationMs: attachment.durationMs,
          uploaderId: viewerId,
        },
      });
      attachmentIds.push(copy.id);
    }
    const body = source.poll
      ? `${source.body}\n\n[Forwarded poll: ${source.poll.question}]`
      : source.body;
    const forwarded = await sendMessage(viewerId, targetId, {
      body,
      clientId: `fwd_${randomUUID()}`,
      attachmentIds,
      contextCards: [],
      replyToId: null,
      forwardedFromId: source.id,
    });
    results.push(forwarded);
  }
  return results;
}

export async function getMessagesByIdsForAI(
  viewerId: string,
  conversationId: string,
  options: { from?: Date; to?: Date; limit?: number; messageIds?: string[] } = {},
) {
  await requireMembership(viewerId, conversationId);
  const limit = Math.min(options.limit ?? 80, 200);
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(options.from || options.to
        ? {
            createdAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {}),
      ...(options.messageIds?.length ? { id: { in: options.messageIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      sender: { select: userSelect },
      attachments: { select: { originalName: true, mimeType: true, kind: true } },
    },
  });
  return messages.reverse();
}

export { emitNewMessage };
