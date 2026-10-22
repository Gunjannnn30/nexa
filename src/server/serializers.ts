import type { User } from "@prisma/client";
import { initials } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PublicUserDTO = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  statusText: string | null;
  initials: string;
  isSelf?: boolean;
};

export type AttachmentDTO = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
};

export type ContextCardDTO = {
  id: string;
  type: string;
  title: string;
  data: unknown;
};

export type ReactionGroupDTO = {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
};

export type PollDTO = {
  id: string;
  question: string;
  allowsMultiple: boolean;
  closesAt: string | null;
  options: { id: string; label: string; votes: number; mine: boolean }[];
  totalVotes: number;
  closed: boolean;
};

export type MessageDTO = {
  id: string;
  clientId: string | null;
  conversationId: string;
  sender: PublicUserDTO;
  body: string;
  type: "TEXT" | "SYSTEM" | "POLL";
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: {
    id: string;
    body: string;
    deletedAt: string | null;
    sender: { id: string; name: string; username: string };
  } | null;
  forwardedFrom: { id: string; senderName: string } | null;
  attachments: AttachmentDTO[];
  reactions: ReactionGroupDTO[];
  receipts: { deliveredCount: number; readCount: number; recipientCount: number; status: "SENT" | "DELIVERED" | "READ" };
  poll: PollDTO | null;
  contextCards: ContextCardDTO[];
  mentions: { id: string; username: string; name: string }[];
  isStarred: boolean;
  isPinned: boolean;
};

export type ConversationMemberDTO = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: PublicUserDTO;
};

export type ConversationDTO = {
  id: string;
  type: "DIRECT" | "GROUP" | "ROOM" | "BRANCH";
  title: string;
  description: string | null;
  avatarUrl: string | null;
  createdById: string | null;
  createdAt: string;
  lastMessageAt: string;
  isTemporary: boolean;
  expiresAt: string | null;
  members: ConversationMemberDTO[];
  peer: PublicUserDTO | null;
  lastMessage: {
    id: string;
    body: string;
    type: string;
    senderId: string;
    senderName: string;
    createdAt: string;
    deletedAt: string | null;
    hasAttachments: boolean;
  } | null;
  unreadCount: number;
  isArchived: boolean;
  isFavorite: boolean;
  mutedUntil: string | null;
  notificationLevel: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastReadAt: string | null;
  workspaceId: string | null;
  pinnedCount: number;
  branch: { id: string; sourceConversationId: string; sourceConversationTitle: string | null; messageId: string } | null;
};

export type UserSettingsDTO = {
  theme: string;
  language: string;
  readReceipts: boolean;
  lastSeenVisible: boolean;
  discoverable: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  messagePreview: boolean;
  digestEnabled: boolean;
  digestHour: number;
  aiMemoryEnabled: boolean;
};

export function publicUser(user: Partial<User> | null | undefined, viewerId?: string): PublicUserDTO {
  const name = user?.name ?? "Unknown";
  return {
    id: user?.id ?? "",
    username: user?.username ?? "unknown",
    name,
    avatarUrl: user?.avatarUrl ?? null,
    bio: user?.bio ?? null,
    statusText: user?.statusText ?? null,
    initials: initials(name),
    ...(viewerId ? { isSelf: user?.id === viewerId } : {}),
  };
}

export function serializeAttachment(a: any): AttachmentDTO {
  return {
    id: a.id,
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
    kind: a.kind,
    width: a.width ?? null,
    height: a.height ?? null,
    durationMs: a.durationMs ?? null,
    url: `/api/attachments/${a.id}`,
  };
}

export function serializeReactions(reactions: any[], viewerId: string): ReactionGroupDTO[] {
  const map = new Map<string, { count: number; userIds: string[] }>();
  for (const reaction of reactions ?? []) {
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

export function serializePoll(poll: any, viewerId: string): PollDTO | null {
  if (!poll) return null;
  const options = (poll.options ?? []).map((option: any) => {
    const votes = option.votes?.length ?? 0;
    return {
      id: option.id,
      label: option.label,
      votes,
      mine: (option.votes ?? []).some((vote: any) => vote.userId === viewerId),
    };
  });
  const totalVotes = options.reduce((sum: number, option: any) => sum + option.votes, 0);
  return {
    id: poll.id,
    question: poll.question,
    allowsMultiple: poll.allowsMultiple,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    options,
    totalVotes,
    closed: Boolean(poll.closesAt && poll.closesAt.getTime() <= Date.now()),
  };
}

export function serializeMessage(message: any, viewerId: string): MessageDTO {
  const recipients = (message.receipts ?? []) as any[];
  const recipientCount = recipients.length;
  const deliveredCount = recipients.filter((r) => r.deliveredAt).length;
  const readCount = recipients.filter((r) => r.readAt).length;
  const status =
    recipientCount > 0 && readCount === recipientCount
      ? "READ"
      : recipientCount > 0 && deliveredCount === recipientCount
        ? "DELIVERED"
        : "SENT";
  const deleted = Boolean(message.deletedAt);
  return {
    id: message.id,
    clientId: message.clientId ?? null,
    conversationId: message.conversationId,
    sender: publicUser(message.sender),
    body: deleted ? "" : message.body,
    type: message.type,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          body: message.replyTo.deletedAt ? "" : message.replyTo.body,
          deletedAt: message.replyTo.deletedAt ? message.replyTo.deletedAt.toISOString() : null,
          sender: {
            id: message.replyTo.sender?.id ?? "",
            name: message.replyTo.sender?.name ?? "Unknown",
            username: message.replyTo.sender?.username ?? "unknown",
          },
        }
      : null,
    forwardedFrom: message.forwardedFrom
      ? { id: message.forwardedFrom.id, senderName: message.forwardedFrom.sender?.name ?? "Unknown" }
      : null,
    attachments: deleted ? [] : (message.attachments ?? []).map(serializeAttachment),
    reactions: deleted ? [] : serializeReactions(message.reactions ?? [], viewerId),
    receipts: { deliveredCount, readCount, recipientCount, status },
    poll: deleted ? null : serializePoll(message.poll, viewerId),
    contextCards: deleted
      ? []
      : (message.contextCards ?? []).map((card: any) => ({
          id: card.id,
          type: card.type,
          title: card.title,
          data: card.data,
        })),
    mentions: (message.mentions ?? []).map((mention: any) => ({
      id: mention.userId,
      username: mention.user?.username ?? "unknown",
      name: mention.user?.name ?? "Unknown",
    })),
    isStarred: (message.bookmarks ?? []).length > 0,
    isPinned: (message.pins ?? []).length > 0,
  };
}

export function serializeConversation(
  conversation: any,
  viewerId: string,
  unreadCount = 0,
): ConversationDTO {
  const viewerMembership = (conversation.members ?? []).find(
    (member: any) => member.userId === viewerId,
  );
  const peerMember =
    conversation.type === "DIRECT"
      ? (conversation.members ?? []).find((member: any) => member.userId !== viewerId)
      : null;
  const last = conversation.messages?.[0];
  const title =
    conversation.title ||
    (peerMember?.user ? peerMember.user.name : conversation.type === "BRANCH" ? "Side thread" : "Conversation");
  return {
    id: conversation.id,
    type: conversation.type,
    title,
    description: conversation.description ?? null,
    avatarUrl: conversation.avatarUrl ?? peerMember?.user?.avatarUrl ?? null,
    createdById: conversation.createdById,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    isTemporary: conversation.isTemporary,
    expiresAt: conversation.expiresAt ? conversation.expiresAt.toISOString() : null,
    members: (conversation.members ?? []).map((member: any) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: publicUser(member.user),
    })),
    peer: peerMember?.user ? publicUser(peerMember.user) : null,
    lastMessage: last
      ? {
          id: last.id,
          body: last.deletedAt ? "" : last.body,
          type: last.type,
          senderId: last.senderId,
          senderName: last.sender?.name ?? "Unknown",
          createdAt: last.createdAt.toISOString(),
          deletedAt: last.deletedAt ? last.deletedAt.toISOString() : null,
          hasAttachments: (last.attachments?.length ?? 0) > 0,
        }
      : null,
    unreadCount,
    isArchived: viewerMembership?.isArchived ?? false,
    isFavorite: viewerMembership?.isFavorite ?? false,
    mutedUntil: viewerMembership?.mutedUntil ? viewerMembership.mutedUntil.toISOString() : null,
    notificationLevel: viewerMembership?.notificationLevel ?? "ALL",
    role: viewerMembership?.role ?? "MEMBER",
    lastReadAt: viewerMembership?.lastReadAt ? viewerMembership.lastReadAt.toISOString() : null,
    workspaceId: conversation.workspace?.id ?? null,
    pinnedCount: (conversation.pins ?? []).length,
    branch: conversation.branchInfo
      ? {
          id: conversation.branchInfo.id,
          sourceConversationId: conversation.branchInfo.sourceConversationId,
          sourceConversationTitle: conversation.branchInfo.sourceConversation?.title ?? null,
          messageId: conversation.branchInfo.messageId,
        }
      : null,
  };
}

export function serializeSettings(settings: any): UserSettingsDTO {
  return {
    theme: settings?.theme ?? "system",
    language: settings?.language ?? "en",
    readReceipts: settings?.readReceipts ?? true,
    lastSeenVisible: settings?.lastSeenVisible ?? true,
    discoverable: settings?.discoverable ?? true,
    notificationsEnabled: settings?.notificationsEnabled ?? true,
    soundEnabled: settings?.soundEnabled ?? true,
    messagePreview: settings?.messagePreview ?? true,
    digestEnabled: settings?.digestEnabled ?? false,
    digestHour: settings?.digestHour ?? 9,
    aiMemoryEnabled: settings?.aiMemoryEnabled ?? false,
  };
}
