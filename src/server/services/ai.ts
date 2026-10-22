import { badRequest, notFound, AppError } from "@/lib/errors";
import { getAiConfig } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { truncate } from "@/lib/utils";
import { requireMembership } from "@/server/authorization";
import { userSelect } from "@/server/includes";
import { createNotification } from "@/server/services/notifications";
import { searchMessages } from "@/server/services/search";
import {
  askJsonSchema,
  askMessages,
  composeMessages,
  digestJsonSchema,
  digestMessages,
  extractionMessages,
  extractionSchema,
  summaryJsonSchema,
  summaryMessages,
  type PromptMessage,
} from "@/server/ai/prompts";
import { aiStatus, chat, chatJson, transcribeAudio } from "@/server/ai/provider";
import { readAttachmentBuffer } from "@/server/storage";
import { indexMessageEmbedding } from "@/server/ai/embeddings";

export { aiStatus };

type DbMessageForPrompt = {
  id: string;
  body: string;
  createdAt: Date;
  sender: { name: string; username: string };
  attachments: { originalName: string; kind: string; mimeType: string }[];
};

function toPromptMessage(message: DbMessageForPrompt): PromptMessage {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    senderName: message.sender.name,
    senderUsername: message.sender.username,
    attachments: message.attachments,
  };
}

async function loadMemories(userId: string, conversationId?: string | null) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { aiMemoryEnabled: true },
  });
  if (!settings?.aiMemoryEnabled) return [];
  const memories = await prisma.personalMemory.findMany({
    where: {
      userId,
      isActive: true,
      OR: [{ conversationId: null }, ...(conversationId ? [{ conversationId }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { content: true },
  });
  return memories.map((memory) => memory.content);
}

async function conversationHeader(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      title: true,
      type: true,
      description: true,
      members: {
        include: { user: { select: userSelect } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!conversation) throw notFound("Conversation not found.");
  const title =
    conversation.title ??
    conversation.members[0]?.user.name ??
    "Conversation";
  return { ...conversation, displayTitle: title };
}

async function fetchPromptMessages(
  conversationId: string,
  options: { from?: Date; to?: Date; limit?: number; ids?: string[] },
) {
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      type: { not: "SYSTEM" },
      ...(options.ids?.length ? { id: { in: options.ids } } : {}),
      ...(options.from || options.to
        ? {
            createdAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 120, 200),
    include: {
      sender: { select: userSelect },
      attachments: { select: { originalName: true, kind: true, mimeType: true } },
    },
  });
  return messages.reverse();
}

function validEvidence(
  evidence: { messageId: string; note?: string }[],
  messages: { id: string; sender: { name: string }; createdAt: Date; body: string }[],
) {
  const allowed = new Set(messages.map((m) => m.id));
  return evidence
    .filter((item) => allowed.has(item.messageId))
    .slice(0, 12)
    .map((item) => {
      const message = messages.find((m) => m.id === item.messageId)!;
      return {
        messageId: item.messageId,
        note: item.note ?? "",
        excerpt: truncate(message.body, 280),
        senderName: message.sender.name,
        createdAt: message.createdAt.toISOString(),
      };
    });
}

export async function summarizeConversation(
  userId: string,
  input: {
    conversationId: string;
    kind: "UNREAD" | "RANGE" | "GROUP" | "ROOM";
    from?: string;
    to?: string;
  },
) {
  const membership = await requireMembership(userId, input.conversationId);
  const header = await conversationHeader(input.conversationId);
  const now = new Date();
  let from: Date | undefined;
  let to: Date | undefined;
  if (input.kind === "UNREAD") {
    from = membership.lastReadAt ?? new Date(Date.now() - 7 * 24 * 3600_000);
    to = now;
  } else if (input.kind === "RANGE") {
    if (!input.from) throw badRequest("Choose a start date for the summary range.");
    from = new Date(input.from);
    to = input.to ? new Date(input.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw badRequest("The summary range is invalid.");
    }
  } else {
    from = new Date(Date.now() - 14 * 24 * 3600_000);
    to = now;
  }
  const messages = await fetchPromptMessages(input.conversationId, { from, to, limit: 150 });
  if (!messages.length) {
    throw badRequest(
      input.kind === "UNREAD"
        ? "You are all caught up — there are no unread messages to summarize."
        : "There are no messages in that range to summarize.",
    );
  }
  const scopeLabel =
    input.kind === "UNREAD"
      ? `unread messages since ${(membership.lastReadAt ?? from).toISOString()}`
      : `${messages.length} messages from ${from.toISOString()} to ${to.toISOString()}`;

  const response = await chatJson(
    summaryMessages({
      messages: messages.map(toPromptMessage),
      conversationTitle: header.displayTitle,
      conversationType: header.type,
      scopeLabel,
    }),
    summaryJsonSchema,
    { temperature: 0.2, maxTokens: 1600 },
  );

  const allowedIds = new Set(messages.map((m) => m.id));
  const content = response.data;
  const evidence = validEvidence(content.evidence, messages);
  const fallbackEvidence = evidence.length
    ? evidence
    : messages.slice(-3).map((message) => ({
        messageId: message.id,
        note: "Recent source message",
        excerpt: truncate(message.body, 280),
        senderName: message.sender.name,
        createdAt: message.createdAt.toISOString(),
      }));

  const summary = await prisma.aiSummary.create({
    data: {
      conversationId: input.conversationId,
      userId,
      kind: input.kind,
      title: content.title,
      rangeStart: from,
      rangeEnd: to,
      provider: response.provider,
      model: response.model,
      content: {
        summary: content.summary,
        decisions: content.decisions.map((decision) => ({
          ...decision,
          messageIds: decision.messageIds.filter((id) => allowedIds.has(id)),
        })),
        actionItems: content.actionItems.map((item) => ({
          ...item,
          messageIds: item.messageIds.filter((id) => allowedIds.has(id)),
        })),
        unresolvedQuestions: content.unresolvedQuestions.map((question) => ({
          ...question,
          messageIds: question.messageIds.filter((id) => allowedIds.has(id)),
        })),
      },
      evidence: {
        create: fallbackEvidence.map((item) => ({
          messageId: item.messageId,
          excerpt: item.excerpt,
          note: item.note,
        })),
      },
    },
    include: {
      evidence: {
        include: {
          message: {
            select: {
              id: true,
              createdAt: true,
              sender: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return {
    id: summary.id,
    kind: summary.kind,
    title: summary.title,
    summary: content.summary,
    decisions: content.decisions,
    actionItems: content.actionItems,
    unresolvedQuestions: content.unresolvedQuestions,
    evidence: summary.evidence.map((item) => ({
      messageId: item.messageId,
      excerpt: item.excerpt,
      note: item.note,
      senderName: item.message.sender.name,
      createdAt: item.message.createdAt.toISOString(),
    })),
    provider: summary.provider,
    model: summary.model,
    rangeStart: summary.rangeStart?.toISOString() ?? null,
    rangeEnd: summary.rangeEnd?.toISOString() ?? null,
    createdAt: summary.createdAt.toISOString(),
  };
}

export async function askConversation(
  userId: string,
  input: { conversationId: string; question: string },
) {
  const header = await conversationHeader(input.conversationId);
  await requireMembership(userId, input.conversationId);
  const results = await searchMessages(userId, {
    q: input.question,
    conversationId: input.conversationId,
    limit: 25,
  });
  const recent = await fetchPromptMessages(input.conversationId, { limit: 45 });
  const byId = new Map(recent.map((message) => [message.id, message]));
  for (const result of results) {
    const message = await prisma.message.findUnique({
      where: { id: result.message.id },
      include: {
        sender: { select: userSelect },
        attachments: { select: { originalName: true, kind: true, mimeType: true } },
      },
    });
    if (message) byId.set(message.id, message);
  }
  const messages = [...byId.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  if (!messages.length) {
    return {
      answer: "There are no messages in this conversation yet, so there is nothing to ground an answer in.",
      evidence: [],
      insufficientInformation: true,
      confidence: "low" as const,
      messagesUsed: 0,
    };
  }
  const memories = await loadMemories(userId, input.conversationId);
  const response = await chatJson(
    askMessages({
      question: input.question,
      conversationTitle: header.displayTitle,
      messages: messages.map(toPromptMessage),
      memories,
    }),
    askJsonSchema,
    { temperature: 0.15, maxTokens: 900 },
  );
  const allowed = new Set(messages.map((m) => m.id));
  const cited = response.data.evidenceIds.filter((id) => allowed.has(id));
  const evidence = cited.map((id) => {
    const message = messages.find((m) => m.id === id)!;
    return {
      messageId: id,
      excerpt: truncate(message.body, 300),
      senderName: message.sender.name,
      senderUsername: message.sender.username,
      createdAt: message.createdAt.toISOString(),
    };
  });
  const insufficient =
    response.data.insufficientInformation || (!evidence.length && cited.length === 0);
  return {
    answer: response.data.answer,
    evidence,
    insufficientInformation: insufficient,
    confidence: response.data.confidence,
    messagesUsed: messages.length,
    provider: response.provider,
    model: response.model,
  };
}

export async function composeWithAi(
  userId: string,
  input: {
    action: "draft" | "rewrite" | "translate" | "grammar" | "tone" | "explain" | "announcement" | "invitation";
    text: string;
    conversationId?: string;
    messageIds: string[];
    instruction?: string;
    tone?: string;
    targetLanguage?: string;
  },
) {
  if (["rewrite", "translate", "grammar", "tone"].includes(input.action) && !input.text.trim()) {
    throw badRequest("Add the text you want NEXA to work on.");
  }
  if (input.action === "translate" && !input.targetLanguage) {
    throw badRequest("Choose a target language.");
  }
  if (["explain"].includes(input.action) && !input.messageIds.length && !input.conversationId) {
    throw badRequest("Select at least one message to explain.");
  }
  let messages: DbMessageForPrompt[] = [];
  let conversationTitle: string | undefined;
  if (input.conversationId) {
    await requireMembership(userId, input.conversationId);
    const header = await conversationHeader(input.conversationId);
    conversationTitle = header.displayTitle;
    const selected = input.messageIds.length
      ? await prisma.message.findMany({
          where: {
            id: { in: input.messageIds },
            conversationId: input.conversationId,
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
          include: {
            sender: { select: userSelect },
            attachments: { select: { originalName: true, kind: true, mimeType: true } },
          },
        })
      : [];
    const recent = await fetchPromptMessages(input.conversationId, { limit: 30 });
    const map = new Map<string, DbMessageForPrompt>();
    for (const message of recent) map.set(message.id, message);
    for (const message of selected) map.set(message.id, message);
    messages = [...map.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }
  const memories = await loadMemories(userId, input.conversationId);
  const promptText = [input.text, memories.length ? `Personal notes from the user:\n${memories.map((m) => `- ${m}`).join("\n")}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const response = await chat(
    composeMessages({
      action: input.action,
      text: promptText,
      instruction: input.instruction,
      tone: input.tone,
      targetLanguage: input.targetLanguage,
      conversationTitle,
      messages: messages.map(toPromptMessage),
    }),
    { temperature: 0.5, maxTokens: 900 },
  );
  let draft = response.text.trim();
  if (
    (draft.startsWith('"') && draft.endsWith('"')) ||
    (draft.startsWith("“") && draft.endsWith("”"))
  ) {
    draft = draft.slice(1, -1);
  }
  return {
    draft,
    action: input.action,
    provider: response.provider,
    model: response.model,
    requiresReview: true,
  };
}

export async function generateDigest(userId: string) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.digestEnabled) {
    throw badRequest("Enable Smart digest in Settings before generating one.");
  }
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: { select: { id: true, title: true, type: true, expiresAt: true } },
    },
    take: 30,
  });
  const now = Date.now();
  const messageGroups = await Promise.all(
    memberships
      .filter(
        (membership) =>
          !(membership.conversation.expiresAt && membership.conversation.expiresAt.getTime() <= now),
      )
      .map(async (membership) => {
        const messages = await prisma.message.findMany({
          where: {
            conversationId: membership.conversationId,
            deletedAt: null,
            senderId: { not: userId },
            createdAt: { gt: membership.lastReadAt ?? new Date(Date.now() - 7 * 24 * 3600_000) },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            sender: { select: userSelect },
            attachments: { select: { originalName: true, kind: true, mimeType: true } },
            conversation: { select: { title: true } },
          },
        });
        return messages;
      }),
  );
  const messages = messageGroups
    .flat()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-80);
  const tasks = await prisma.workspaceItem.findMany({
    where: {
      status: { not: "DONE" },
      OR: [
        { assigneeId: userId },
        { workspace: { conversation: { members: { some: { userId } } } } },
      ],
      dueAt: { not: null },
    },
    orderBy: { dueAt: "asc" },
    take: 10,
    include: { workspace: { include: { conversation: { select: { id: true, title: true } } } } },
  });
  if (!messages.length && !tasks.length) {
    throw badRequest("Nothing new to digest right now. You are all caught up.");
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const taskSummary = tasks
    .map(
      (task) =>
        `${task.title} (${task.status}${task.dueAt ? `, due ${task.dueAt.toISOString()}` : ""}${
          task.workspace.conversation.title ? ` in ${task.workspace.conversation.title}` : ""
        })`,
    )
    .join("; ");
  const response = await chatJson(
    digestMessages({
      messages: messages.map(toPromptMessage),
      displayName: user?.name ?? "there",
      taskSummary,
    }),
    digestJsonSchema,
    { temperature: 0.2, maxTokens: 1200 },
  );
  const allowed = new Set(messages.map((m) => m.id));
  const evidenceIds = response.data.evidence.filter((id) => allowed.has(id));
  const summary = await prisma.aiSummary.create({
    data: {
      userId,
      kind: "DIGEST",
      title: response.data.headline,
      provider: response.provider,
      model: response.model,
      content: {
        summary: response.data.summary,
        highlights: response.data.highlights,
        mentions: response.data.mentions,
        commitments: response.data.commitments,
      },
      evidence: {
        create: evidenceIds.slice(0, 20).map((id) => {
          const message = messages.find((m) => m.id === id)!;
          return { messageId: id, excerpt: truncate(message.body, 280) };
        }),
      },
    },
  });
  const notification = await createNotification({
    userId,
    type: "AI_DIGEST",
    title: `Smart digest · ${response.data.headline}`.slice(0, 160),
    body: truncate(response.data.summary, 500),
    metadata: { summaryId: summary.id },
  });
  return {
    id: summary.id,
    headline: response.data.headline,
    summary: response.data.summary,
    highlights: response.data.highlights,
    mentions: response.data.mentions,
    commitments: response.data.commitments,
    evidence: evidenceIds.slice(0, 20).map((id) => {
      const message = messages.find((m) => m.id === id)!;
      return {
        messageId: id,
        excerpt: truncate(message.body, 280),
        senderName: message.sender.name,
        createdAt: message.createdAt.toISOString(),
      };
    }),
    notificationId: notification.id,
    createdAt: summary.createdAt.toISOString(),
  };
}

export async function extractWorkspaceItems(
  userId: string,
  conversationId: string,
  messageIds: string[],
  type: "TASK" | "CHECKLIST" | "NOTE" | "PLAN" | "DECISION",
) {
  await requireMembership(userId, conversationId);
  const messages = await prisma.message.findMany({
    where: {
      id: { in: messageIds },
      conversationId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: userSelect },
      attachments: { select: { originalName: true, kind: true, mimeType: true } },
    },
  });
  if (!messages.length) throw badRequest("Select at least one message.");
  const header = await conversationHeader(conversationId);
  const response = await chatJson(
    extractionMessages({
      messageIds: messages.map((m) => m.id),
      type,
      messages: messages.map(toPromptMessage),
    }),
    extractionSchema,
    { temperature: 0.2, maxTokens: 1200 },
  );
  const allowed = new Set(messages.map((m) => m.id));
  const members = header.members;
  return {
    items: response.data.items.map((item) => {
      const matchedMember = item.assignee
        ? members.find(
            (member) =>
              member.user.name.toLowerCase() === item.assignee!.toLowerCase() ||
              member.user.username.toLowerCase() === item.assignee!.toLowerCase(),
          )
        : undefined;
      const due = item.due && !Number.isNaN(new Date(item.due).getTime()) ? new Date(item.due) : null;
      return {
        type: item.type,
        title: item.title,
        content: item.content ?? null,
        dueAt: due?.toISOString() ?? null,
        assigneeId: matchedMember?.userId ?? null,
        assigneeName: matchedMember?.user.name ?? item.assignee ?? null,
        checklist: item.checklist.map((text) => ({ text, done: false })),
        sourceMessageId: item.messageIds.find((id) => allowed.has(id)) ?? messages[0]!.id,
        messageIds: item.messageIds.filter((id) => allowed.has(id)),
      };
    }),
    provider: response.provider,
    model: response.model,
  };
}

export async function transcribeAttachment(
  userId: string,
  attachmentId: string,
  translateTo?: string,
) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: { select: { id: true, conversationId: true, deletedAt: true } },
    },
  });
  if (!attachment) throw notFound("Attachment not found.");
  if (attachment.message?.deletedAt) throw notFound("Attachment not found.");
  if (attachment.message) {
    await requireMembership(userId, attachment.message.conversationId);
  } else if (attachment.uploaderId !== userId) {
    throw notFound("Attachment not found.");
  }
  if (attachment.kind !== "AUDIO") throw badRequest("Only audio attachments can be transcribed.");
  const buffer = await readAttachmentBuffer(attachment.storageKey);
  if (!buffer) throw new AppError(503, "STORAGE_UNAVAILABLE", "Could not read the audio file.");
  const transcription = await transcribeAudio(
    buffer,
    attachment.originalName,
    attachment.mimeType,
  );
  let translation: string | null = null;
  if (translateTo) {
    const result = await chat(
      composeMessages({
        action: "translate",
        text: transcription.text,
        targetLanguage: translateTo,
        messages: [],
      }),
      { temperature: 0.2, maxTokens: 900 },
    );
    translation = result.text.trim();
  }
  return {
    attachmentId,
    transcript: transcription.text,
    translation,
    targetLanguage: translateTo ?? null,
    provider: transcription.provider,
    model: transcription.model,
  };
}

export async function backfillEmbeddings(userId: string, conversationId: string) {
  await requireMembership(userId, conversationId);
  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null, body: { not: "" }, embedding: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true },
  });
  let indexed = 0;
  for (const message of messages) {
    try {
      if (await indexMessageEmbedding(message.id)) indexed += 1;
    } catch (error) {
      console.warn("[nexa:embeddings]", (error as Error).message);
    }
  }
  return { indexed, total: messages.length };
}

export async function aiSetupInfo() {
  return aiStatus();
}

export function requireAiConfigured() {
  const config = getAiConfig();
  if (!config.configured) {
    throw new AppError(503, "AI_UNAVAILABLE", "AI is not configured.", { missing: config.missing });
  }
}
