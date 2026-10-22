import type { ConversationMember } from "@prisma/client";
import { forbidden, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function getMembership(
  userId: string,
  conversationId: string,
): Promise<ConversationMember | null> {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export async function requireMembership(
  userId: string,
  conversationId: string,
): Promise<ConversationMember> {
  const membership = await getMembership(userId, conversationId);
  if (!membership) throw notFound("Conversation not found.");
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { expiresAt: true, isTemporary: true },
  });
  if (!conversation) throw notFound("Conversation not found.");
  if (conversation.isTemporary && conversation.expiresAt && conversation.expiresAt.getTime() < Date.now()) {
    throw notFound("This temporary room has expired.");
  }
  return membership;
}

export async function requireAdmin(userId: string, conversationId: string) {
  const membership = await requireMembership(userId, conversationId);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw forbidden("Only group admins can do that.");
  }
  return membership;
}

export async function requireOwner(userId: string, conversationId: string) {
  const membership = await requireMembership(userId, conversationId);
  if (membership.role !== "OWNER") throw forbidden("Only the owner can do that.");
  return membership;
}

export async function getConversationOrThrow(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw notFound("Conversation not found.");
  return conversation;
}

export async function getConversationMembers(conversationId: string) {
  return prisma.conversationMember.findMany({
    where: { conversationId },
    include: {
      user: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
}

export async function isBlockedBetween(userA: string, userB: string) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
}

export async function assertNotBlocked(userA: string, userB: string) {
  if (await isBlockedBetween(userA, userB)) {
    throw forbidden("You cannot message this person. One of you has blocked the other.");
  }
}

export function assertDirectAccess(
  viewerId: string,
  memberIds: string[],
): void {
  if (!memberIds.includes(viewerId)) throw forbidden();
}
