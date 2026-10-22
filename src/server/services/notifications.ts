import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitToUsers } from "@/server/realtime";

export type NewNotification = {
  userId: string;
  actorId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
};

export async function createNotification(data: NewNotification) {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      actorId: data.actorId ?? null,
      conversationId: data.conversationId ?? null,
      messageId: data.messageId ?? null,
      type: data.type,
      title: data.title,
      body: data.body,
      metadata: data.metadata,
    },
  });
  emitToUsers([data.userId], "notification:new", {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    conversationId: notification.conversationId,
    messageId: notification.messageId,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  });
  return notification;
}

export async function listNotifications(userId: string, cursor?: string) {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
  });
  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
      actor: notification.actor,
      metadata: notification.metadata,
    })),
    nextCursor: notifications.length === 30 ? notifications[notifications.length - 1]!.id : null,
  };
}

export async function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markNotificationsRead(userId: string, input: { ids?: string[]; all: boolean }) {
  if (input.all) {
    await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  } else if (input.ids?.length) {
    await prisma.notification.updateMany({
      where: { userId, id: { in: input.ids } },
      data: { isRead: true },
    });
  }
  emitToUsers([userId], "notifications:read", { ids: input.ids ?? null, all: input.all });
}
