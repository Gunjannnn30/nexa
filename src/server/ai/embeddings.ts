import { getEmbeddingConfig } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/server/authorization";
import { embed } from "@/server/ai/provider";

export async function indexMessageEmbedding(messageId: string) {
  const config = getEmbeddingConfig();
  if (!config.configured) return false;
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      body: true,
      deletedAt: true,
      attachments: { select: { originalName: true } },
    },
  });
  if (!message || message.deletedAt) return false;
  const text = [
    message.body,
    ...message.attachments.map((attachment) => attachment.originalName),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
  if (text.trim().length < 2) return false;
  const [vector] = await embed([text]);
  if (!vector) return false;
  await prisma.messageEmbedding.upsert({
    where: { messageId },
    create: { messageId, model: config.model, vector },
    update: { model: config.model, vector },
  });
  return true;
}

export async function backfillConversationEmbeddings(userId: string, conversationId: string) {
  const config = getEmbeddingConfig();
  if (!config.configured) throw new Error("Embeddings are not configured.");
  await requireMembership(userId, conversationId);
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      embedding: null,
      OR: [{ body: { not: "" } }],
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { id: true, body: true, attachments: { select: { originalName: true } } },
  });
  let indexed = 0;
  for (const message of messages) {
    const text = [message.body, ...message.attachments.map((a) => a.originalName)]
      .filter(Boolean)
      .join("\n")
      .slice(0, 6000);
    if (!text.trim()) continue;
    try {
      const [vector] = await embed([text]);
      if (!vector) continue;
      await prisma.messageEmbedding.upsert({
        where: { messageId: message.id },
        create: { messageId: message.id, model: config.model, vector },
        update: { model: config.model, vector },
      });
      indexed += 1;
    } catch (error) {
      console.warn("[nexa:embeddings] failed for message", message.id, (error as Error).message);
    }
  }
  return { indexed, model: config.model };
}
