import type { Server } from "socket.io";
import { prisma } from "@/lib/prisma";

const globalForRealtime = globalThis as unknown as {
  nexaRealtimeServer?: Server;
};

export function setRealtimeServer(io: Server) {
  globalForRealtime.nexaRealtimeServer = io;
}

export function getRealtimeServer(): Server | null {
  return globalForRealtime.nexaRealtimeServer ?? null;
}

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  const io = getRealtimeServer();
  if (!io) return;
  for (const id of new Set(userIds)) {
    io.to(userRoom(id)).emit(event, payload);
  }
}

export async function emitToConversation(
  conversationId: string,
  event: string,
  payload: unknown,
  exceptUserId?: string,
) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  emitToUsers(
    members.map((m) => m.userId).filter((id) => id !== exceptUserId),
    event,
    payload,
  );
}

export async function conversationMemberIds(conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
