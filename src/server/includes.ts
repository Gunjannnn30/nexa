import type { Prisma } from "@prisma/client";

export const userSelect = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  bio: true,
  statusText: true,
  isBot: true,
} satisfies Prisma.UserSelect;

export function messageInclude(viewerId: string) {
  return {
    sender: { select: userSelect },
    replyTo: { include: { sender: { select: userSelect } } },
    forwardedFrom: { include: { sender: { select: userSelect } } },
    attachments: { orderBy: { createdAt: "asc" as const } },
    reactions: { select: { userId: true, emoji: true } },
    receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
    poll: {
      include: {
        options: {
          orderBy: { order: "asc" as const },
          include: { votes: { select: { userId: true } } },
        },
      },
    },
    mentions: { include: { user: { select: userSelect } } },
    contextCards: { orderBy: { createdAt: "asc" as const } },
    bookmarks: { where: { userId: viewerId }, select: { id: true } },
    pins: { select: { id: true } },
  } satisfies Prisma.MessageInclude;
}

export function conversationInclude(viewerId: string) {
  return {
    members: {
      orderBy: { joinedAt: "asc" as const },
      include: { user: { select: userSelect } },
    },
    messages: {
      orderBy: { createdAt: "desc" as const },
      take: 1,
      include: {
        sender: { select: userSelect },
        attachments: { select: { id: true } },
      },
    },
    pins: { select: { id: true } },
    workspace: { select: { id: true } },
    branchInfo: {
      include: { sourceConversation: { select: { id: true, title: true } } },
    },
    ...(viewerId ? {} : {}),
  } satisfies Prisma.ConversationInclude;
}
