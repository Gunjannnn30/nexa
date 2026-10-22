import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/env";
import { requireMembership } from "@/server/authorization";
import { messageInclude } from "@/server/includes";
import { conversationInclude } from "@/server/includes";
import {
  serializeConversation,
  serializeMessage,
  type ConversationDTO,
  type MessageDTO,
} from "@/server/serializers";
import { chatJson, embed } from "@/server/ai/provider";
import {
  searchUnderstandingMessages,
  searchUnderstandingSchema,
  type SearchUnderstanding,
} from "@/server/ai/prompts";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export type SearchResult = {
  message: MessageDTO;
  conversation: ConversationDTO;
  score: number;
  matchKind: "text" | "attachment" | "semantic";
};

export type SearchResponse = {
  results: SearchResult[];
  mode: "lexical" | "semantic";
  interpreted?: SearchUnderstanding | null;
  answer?: string | null;
  evidence?: { messageId: string; excerpt: string; senderName: string; createdAt: string }[];
  notice?: string | null;
  insufficientInformation?: boolean;
};

type RawRow = { id: string; rank: number };

const EMPTY_CONVERSATION = Prisma.empty;

function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchMessages(
  userId: string,
  input: {
    q: string;
    conversationId?: string;
    limit?: number;
    from?: Date | null;
    to?: Date | null;
    attachmentKind?: "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | null;
  },
): Promise<SearchResult[]> {
  const q = input.q.trim();
  if (!q) return [];
  if (input.conversationId) await requireMembership(userId, input.conversationId);
  const limit = Math.min(input.limit ?? 20, 50);
  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const conversationFilter = input.conversationId
    ? Prisma.sql`AND m."conversationId" = ${input.conversationId}`
    : EMPTY_CONVERSATION;
  const fromFilter = input.from ? Prisma.sql`AND m."createdAt" >= ${input.from}` : EMPTY_CONVERSATION;
  const toFilter = input.to ? Prisma.sql`AND m."createdAt" < ${input.to}` : EMPTY_CONVERSATION;
  const kindFilter = input.attachmentKind
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Attachment" ak WHERE ak."messageId" = m.id AND ak.kind::text = ${input.attachmentKind})`
    : EMPTY_CONVERSATION;

  let rows: RawRow[] = [];
  try {
    rows = await prisma.$queryRaw<RawRow[]>`
      SELECT m.id,
             ts_rank(
               to_tsvector('simple', coalesce(m.body, '')),
               websearch_to_tsquery('simple', ${q})
             )::float AS rank
      FROM "Message" m
      JOIN "Conversation" c ON c.id = m."conversationId"
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
      WHERE m."deletedAt" IS NULL
        AND (c."expiresAt" IS NULL OR c."expiresAt" > now())
        ${conversationFilter}
        ${fromFilter}
        ${toFilter}
        ${kindFilter}
        AND (
          to_tsvector('simple', coalesce(m.body, '')) @@ websearch_to_tsquery('simple', ${q})
          OR m.body ILIKE ${pattern} ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM "Attachment" a
            WHERE a."messageId" = m.id AND a."originalName" ILIKE ${pattern} ESCAPE '\\'
          )
        )
      ORDER BY rank DESC, m."createdAt" DESC
      LIMIT ${limit * 2}
    `;
  } catch (error) {
    console.error("[nexa:search] FTS query failed, using ILIKE fallback", error);
    rows = await prisma.message
      .findMany({
        where: {
          deletedAt: null,
          conversation: {
            members: { some: { userId } },
            ...(input.conversationId ? { id: input.conversationId } : {}),
          },
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lt: input.to } : {}),
                },
              }
            : {}),
          OR: [
            { body: { contains: q, mode: "insensitive" } },
            { attachments: { some: { originalName: { contains: q, mode: "insensitive" } } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true },
      })
      .then((messages) => messages.map((m) => ({ id: m.id, rank: 1 })));
  }

  if (!rows.length) return [];
  const orderedIds = rows.slice(0, limit * 2).map((row) => row.id);
  const messages = await prisma.message.findMany({
    where: { id: { in: orderedIds }, deletedAt: null },
    include: messageInclude(userId),
  });
  const conversationIds = [...new Set(messages.map((m) => m.conversationId))];
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: conversationIds } },
    include: conversationInclude(userId),
  });
  const conversationMap = new Map(
    conversations.map((conversation) => [conversation.id, serializeConversation(conversation, userId)]),
  );
  const messageMap = new Map(messages.map((message) => [message.id, message]));
  const maxRank = Math.max(...rows.map((row) => row.rank || 0), 1);
  const results: SearchResult[] = [];
  for (const row of rows) {
    const message = messageMap.get(row.id);
    const conversation = message ? conversationMap.get(message.conversationId) : null;
    if (!message || !conversation) continue;
    const matchesAttachment = (message.attachments ?? []).some((attachment) =>
      attachment.originalName.toLowerCase().includes(q.toLowerCase()),
    );
    results.push({
      message: serializeMessage(message, userId),
      conversation,
      score: Math.max(row.rank / maxRank, 0.01),
      matchKind: matchesAttachment && !message.body.toLowerCase().includes(q.toLowerCase())
        ? "attachment"
        : "text",
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function vectorSearch(
  userId: string,
  query: string,
  input: { conversationId?: string; from?: Date | null; to?: Date | null; limit: number },
) {
  const embeddingConfig = env.EMBEDDING_PROVIDER;
  if (embeddingConfig === "none") return [] as { id: string; similarity: number }[];
  try {
    const [queryVector] = await embed([query]);
    if (!queryVector) return [];
    const conversationFilter = input.conversationId
      ? Prisma.sql`AND m."conversationId" = ${input.conversationId}`
      : EMPTY_CONVERSATION;
    const rows = await prisma.$queryRaw<{ messageId: string; vector: unknown }[]>`
      SELECT e."messageId", e.vector
      FROM "MessageEmbedding" e
      JOIN "Message" m ON m.id = e."messageId"
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
      WHERE m."deletedAt" IS NULL
        ${conversationFilter}
      ORDER BY e."createdAt" DESC
      LIMIT 1000
    `;
    const scored = rows
      .map((row) => {
        const vector = Array.isArray(row.vector) ? (row.vector as number[]) : [];
        return { id: row.messageId, similarity: cosine(queryVector, vector) };
      })
      .filter((row) => row.similarity > 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, input.limit);
    return scored;
  } catch (error) {
    console.warn("[nexa:search] vector search unavailable", (error as Error).message);
    return [];
  }
}

function normalizeWsDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function semanticSearch(
  userId: string,
  input: { q: string; conversationId?: string; limit?: number },
): Promise<SearchResponse> {
  if (input.conversationId) await requireMembership(userId, input.conversationId);
  const limit = Math.min(input.limit ?? 20, 50);
  const aiConfig = getAiConfig();
  let interpreted: SearchUnderstanding | null = null;
  let notice: string | null = null;
  let keywords = input.q;

  if (aiConfig.configured) {
    try {
      const understood = await chatJson(searchUnderstandingMessages(input.q), searchUnderstandingSchema, {
        temperature: 0.1,
        maxTokens: 300,
      });
      interpreted = understood.data;
      keywords = understood.data.keywords.trim() || input.q;
    } catch (error) {
      notice =
        error instanceof AppError
          ? `Search interpretation unavailable: ${error.message} Using keyword search.`
          : "Search interpretation unavailable. Using keyword search.";
    }
  } else {
    notice = `AI is not configured, so this is a keyword search. Add ${aiConfig.missing.join(", ")} to enable semantic search with cited answers.`;
  }

  const from = normalizeWsDate(interpreted?.from);
  const to = normalizeWsDate(interpreted?.to);
  const attachmentKind = interpreted?.attachmentKind ?? null;

  let results = await searchMessages(userId, {
    q: keywords,
    conversationId: input.conversationId,
    limit,
    from,
    to,
    attachmentKind,
  });
  if (!results.length && keywords !== input.q) {
    results = await searchMessages(userId, {
      q: input.q,
      conversationId: input.conversationId,
      limit,
      attachmentKind,
    });
  }

  const vectors = await vectorSearch(userId, keywords, {
    conversationId: input.conversationId,
    from,
    to,
    limit,
  });
  if (vectors.length) {
    const existing = new Map(results.map((result) => [result.message.id, result]));
    for (const vector of vectors) {
      const existingResult = existing.get(vector.id);
      if (existingResult) {
        existingResult.score = Math.max(existingResult.score, vector.similarity);
        existingResult.matchKind = "semantic";
      }
    }
    if (!results.length) {
      const messages = await prisma.message.findMany({
        where: { id: { in: vectors.map((v) => v.id) }, deletedAt: null },
        include: messageInclude(userId),
      });
      const conversationIds = [...new Set(messages.map((m) => m.conversationId))];
      const conversations = await prisma.conversation.findMany({
        where: { id: { in: conversationIds } },
        include: conversationInclude(userId),
      });
      const conversationMap = new Map(
        conversations.map((c) => [c.id, serializeConversation(c, userId)]),
      );
      for (const vector of vectors) {
        const message = messages.find((m) => m.id === vector.id);
        const conversation = message ? conversationMap.get(message.conversationId) : null;
        if (!message || !conversation) continue;
        results.push({
          message: serializeMessage(message, userId),
          conversation,
          score: vector.similarity,
          matchKind: "semantic",
        });
      }
    }
  }
  results = results
    .sort((a, b) => b.score - a.score || +new Date(b.message.createdAt) - +new Date(a.message.createdAt))
    .slice(0, limit);

  let answer: string | null = null;
  let evidence: SearchResponse["evidence"] = [];
  let insufficientInformation = false;
  if (aiConfig.configured && results.length) {
    try {
      const promptMessages = await prisma.message.findMany({
        where: { id: { in: results.map((r) => r.message.id).slice(0, 30) }, deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { id: true, name: true, username: true } },
          attachments: { select: { originalName: true, kind: true, mimeType: true } },
        },
      });
      const conversationTitle = results[0]?.conversation.title ?? "your conversations";
      const { chatJson: ask } = await import("@/server/ai/provider");
      const { askMessages, askJsonSchema } = await import("@/server/ai/prompts");
      const response = await ask(
        askMessages({
          question: input.q,
          conversationTitle,
          messages: promptMessages.map((m) => ({
            id: m.id,
            body: m.body,
            createdAt: m.createdAt,
            senderName: m.sender.name,
            senderUsername: m.sender.username,
            attachments: m.attachments,
          })),
          memories: [],
        }),
        askJsonSchema,
        { temperature: 0.2, maxTokens: 700 },
      );
      const validIds = new Set(promptMessages.map((m) => m.id));
      const cited = response.data.evidenceIds.filter((id) => validIds.has(id));
      answer = response.data.answer;
      insufficientInformation = response.data.insufficientInformation;
      evidence = cited.map((id) => {
        const message = promptMessages.find((m) => m.id === id)!;
        return {
          messageId: id,
          excerpt: message.body.slice(0, 240),
          senderName: message.sender.name,
          createdAt: message.createdAt.toISOString(),
        };
      });
      if (!cited.length) {
        notice = `${notice ? `${notice} ` : ""}The answer did not cite a source message, so treat it as unverified.`;
      }
    } catch (error) {
      notice = `${notice ? `${notice} ` : ""}Could not generate an AI answer: ${
        error instanceof AppError ? error.message : "provider unavailable"
      } Keyword results are shown.`;
    }
  }

  return {
    results,
    mode: aiConfig.configured ? "semantic" : "lexical",
    interpreted,
    answer,
    evidence,
    notice,
    insufficientInformation,
  };
}

export async function buildSearchContext(
  userId: string,
  conversationId: string,
  query: string,
): Promise<{
  messages: MessageDTO[];
  promptTranscript: string;
}> {
  await requireMembership(userId, conversationId);
  const results = await searchMessages(userId, {
    q: query,
    conversationId,
    limit: 25,
  });
  const recent = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 35,
    include: messageInclude(userId),
  });
  const byId = new Map<string, MessageDTO>();
  for (const result of results) byId.set(result.message.id, result.message);
  for (const message of recent.reverse()) {
    byId.set(message.id, serializeMessage(message, userId));
  }
  return {
    messages: [...byId.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
    promptTranscript: "",
  };
}
