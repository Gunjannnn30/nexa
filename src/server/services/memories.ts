import { badRequest, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/server/authorization";

function serializeMemory(memory: {
  id: string;
  content: string;
  source: string;
  isActive: boolean;
  conversationId: string | null;
  sourceMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: memory.id,
    content: memory.content,
    source: memory.source,
    isActive: memory.isActive,
    conversationId: memory.conversationId,
    sourceMessageId: memory.sourceMessageId,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

export async function listMemories(userId: string) {
  const [settings, memories] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId },
      select: { aiMemoryEnabled: true, aiMemoryConsentAt: true },
    }),
    prisma.personalMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  return {
    enabled: settings?.aiMemoryEnabled ?? false,
    consentAt: settings?.aiMemoryConsentAt?.toISOString() ?? null,
    memories: memories.map(serializeMemory),
  };
}

export async function createMemory(
  userId: string,
  input: {
    content: string;
    conversationId?: string | null;
    sourceMessageId?: string | null;
    source?: "USER" | "AI";
  },
) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { aiMemoryEnabled: true },
  });
  if (!settings?.aiMemoryEnabled) {
    throw badRequest("Personal AI memory is off. Enable it in Settings first.");
  }
  if (input.conversationId) {
    await requireMembership(userId, input.conversationId);
  }
  if (input.sourceMessageId) {
    const message = await prisma.message.findUnique({
      where: { id: input.sourceMessageId },
      select: { conversationId: true, deletedAt: true },
    });
    if (!message || message.deletedAt) throw notFound("Source message not found.");
    await requireMembership(userId, message.conversationId);
    if (input.conversationId && message.conversationId !== input.conversationId) {
      throw badRequest("The source message is in a different conversation.");
    }
  }
  const memory = await prisma.personalMemory.create({
    data: {
      userId,
      content: input.content,
      conversationId: input.conversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      source: input.source ?? "USER",
    },
  });
  return serializeMemory(memory);
}

export async function updateMemory(
  userId: string,
  memoryId: string,
  input: { content?: string; isActive?: boolean },
) {
  const existing = await prisma.personalMemory.findFirst({
    where: { id: memoryId, userId },
  });
  if (!existing) throw notFound("Memory not found.");
  const memory = await prisma.personalMemory.update({
    where: { id: memoryId },
    data: {
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return serializeMemory(memory);
}

export async function deleteMemory(userId: string, memoryId: string) {
  const existing = await prisma.personalMemory.findFirst({
    where: { id: memoryId, userId },
  });
  if (!existing) throw notFound("Memory not found.");
  await prisma.personalMemory.delete({ where: { id: memoryId } });
}

export async function deleteAllMemories(userId: string) {
  const result = await prisma.personalMemory.deleteMany({ where: { userId } });
  return { deleted: result.count };
}
