import { badRequest, forbidden, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/server/authorization";
import { conversationInclude } from "@/server/includes";
import { emitToUsers } from "@/server/realtime";
import { getConversationDTO } from "@/server/services/conversations";
import { serializeConversation } from "@/server/serializers";

export async function createBranch(
  userId: string,
  sourceConversationId: string,
  messageId: string,
  input: { title?: string; memberIds: string[] },
) {
  await requireMembership(userId, sourceConversationId);
  const source = await prisma.message.findFirst({
    where: { id: messageId, conversationId: sourceConversationId },
    include: {
      sender: { select: { name: true } },
      conversation: {
        select: {
          title: true,
          type: true,
          members: { select: { userId: true, user: { select: { isBot: true } } } },
        },
      },
    },
  });
  if (!source) throw notFound("Message not found.");
  if (source.conversation.members.some((member) => member.user.isBot)) {
    throw badRequest("Side threads are not available in NEXA AI chats.");
  }
  const memberIds = [
    ...new Set([userId, ...input.memberIds].filter((id) => id.length > 0)),
  ].slice(0, 50);
  const sourceMemberIds = source.conversation.members.map((m) => m.userId);
  if (!memberIds.some((id) => sourceMemberIds.includes(id) && id !== userId)) {
    // Always add at least one source participant so it is a real side discussion.
    const peer = sourceMemberIds.find((id) => id !== userId);
    if (peer) memberIds.push(peer);
  }
  const existing = await prisma.branch.findFirst({
    where: { sourceConversationId, messageId, createdById: userId },
    include: { conversation: true },
  });
  if (existing) {
    return {
      branchId: existing.id,
      conversation: await getConversationDTO(userId, existing.conversationId),
      existed: true,
    };
  }
  const title =
    input.title?.trim() ||
    `Side thread · ${source.sender.name}${source.conversation.title ? ` in ${source.conversation.title}` : ""}`;
  const conversation = await prisma.conversation.create({
    data: {
      type: "BRANCH",
      title: title.slice(0, 80),
      createdById: userId,
      members: {
        create: memberIds.map((id) => ({
          userId: id,
          role: id === userId ? "OWNER" : "MEMBER",
        })),
      },
      workspace: {
        create: { name: title.slice(0, 80), createdById: userId, description: "Side thread workspace" },
      },
      branchInfo: {
        create: {
          sourceConversationId,
          messageId,
          title: title.slice(0, 80),
          createdById: userId,
        },
      },
    },
    include: conversationInclude(userId),
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: userId,
      type: "SYSTEM",
      body: `Side thread started from ${source.sender.name} in ${
        source.conversation.title ?? "a conversation"
      }: “${source.body.slice(0, 500)}”`,
    },
  });
  for (const memberId of memberIds) {
    const fresh = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: conversationInclude(memberId),
    });
    if (fresh) emitToUsers([memberId], "conversation:new", serializeConversation(fresh, memberId));
  }
  return {
    branchId: conversation.branchInfo?.id ?? null,
    conversation: await getConversationDTO(userId, conversation.id),
    existed: false,
  };
}

export async function listBranches(userId: string, conversationId: string) {
  await requireMembership(userId, conversationId);
  const branches = await prisma.branch.findMany({
    where: { sourceConversationId: conversationId },
    include: {
      creator: { select: { id: true, name: true, username: true, avatarUrl: true } },
      conversation: { select: { id: true, title: true, lastMessageAt: true } },
      message: { select: { id: true, body: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return branches.map((branch) => ({
    id: branch.id,
    title: branch.title,
    createdAt: branch.createdAt.toISOString(),
    conversationId: branch.conversationId,
    lastMessageAt: branch.conversation.lastMessageAt.toISOString(),
    message: { id: branch.message.id, body: branch.message.body.slice(0, 240) },
    creator: branch.creator,
  }));
}

export async function deleteBranch(userId: string, branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { conversation: { include: { members: true } } },
  });
  if (!branch) throw notFound("Branch not found.");
  const membership = await requireMembership(userId, branch.conversationId);
  if (membership.role !== "OWNER" && branch.createdById !== userId) {
    throw forbidden("Only the branch creator or owner can delete it.");
  }
  await prisma.conversation.delete({ where: { id: branch.conversationId } });
  emitToUsers(
    branch.conversation.members.map((m) => m.userId),
    "conversation:removed",
    { conversationId: branch.conversationId },
  );
}
