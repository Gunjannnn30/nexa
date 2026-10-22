import type { Prisma } from "@prisma/client";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/server/authorization";
import { publicUser } from "@/server/serializers";
import { emitToConversation } from "@/server/realtime";

async function workspaceFor(userId: string, conversationId: string) {
  await requireMembership(userId, conversationId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { title: true, description: true },
  });
  if (!conversation) throw notFound("Conversation not found.");
  const workspace = await prisma.workspace.upsert({
    where: { conversationId },
    create: {
      conversationId,
      name: conversation.title ?? "Conversation workspace",
      description: conversation.description,
      createdById: userId,
    },
    update: {},
  });
  return workspace;
}

type WorkspaceItemWithPeople = Prisma.WorkspaceItemGetPayload<{
  include: {
    assignee: { select: { id: true; username: true; name: true; avatarUrl: true } };
    creator: { select: { id: true; username: true; name: true; avatarUrl: true } };
  };
}>;

function serializeItem(item: WorkspaceItemWithPeople) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    status: item.status,
    dueAt: item.dueAt?.toISOString() ?? null,
    assignee: item.assignee ? publicUser(item.assignee) : null,
    checklist: (item.checklist as { text: string; done: boolean }[] | null) ?? [],
    sourceMessageId: item.sourceMessageId,
    sourceExcerpt: item.sourceExcerpt,
    createdBy: item.creator ? publicUser(item.creator) : null,
    completedAt: item.completedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function getWorkspace(userId: string, conversationId: string) {
  const workspace = await workspaceFor(userId, conversationId);
  const items = await prisma.workspaceItem.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: { select: { id: true, username: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    items: items.map(serializeItem),
  };
}

export async function createWorkspaceItem(
  userId: string,
  conversationId: string,
  input: {
    type: "TASK" | "CHECKLIST" | "NOTE" | "PLAN" | "DECISION";
    title: string;
    content?: string;
    status?: "TODO" | "IN_PROGRESS" | "DONE";
    dueAt?: string | null;
    assigneeId?: string | null;
    checklist?: { text: string; done: boolean }[];
    sourceMessageId?: string | null;
  },
) {
  const workspace = await workspaceFor(userId, conversationId);
  if (input.assigneeId) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: input.assigneeId } },
    });
    if (!member) throw badRequest("Assignee must be a conversation member.");
  }
  let sourceExcerpt: string | null = null;
  if (input.sourceMessageId) {
    const message = await prisma.message.findFirst({
      where: { id: input.sourceMessageId, conversationId, deletedAt: null },
      select: { body: true },
    });
    if (!message) throw badRequest("Source message not found in this conversation.");
    sourceExcerpt = message.body.slice(0, 300);
  }
  if (input.dueAt) {
    const date = new Date(input.dueAt);
    if (Number.isNaN(date.getTime())) throw badRequest("Invalid due date.");
  }
  const item = await prisma.workspaceItem.create({
    data: {
      workspaceId: workspace.id,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      status: input.status ?? "TODO",
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      assigneeId: input.assigneeId ?? null,
      checklist: input.checklist as Prisma.InputJsonValue | undefined,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceExcerpt,
      createdById: userId,
      completedAt: input.status === "DONE" ? new Date() : null,
    },
    include: {
      assignee: { select: { id: true, username: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });
  await emitToConversation(conversationId, "workspace:updated", { conversationId });
  if (input.assigneeId && input.assigneeId !== userId) {
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: input.assigneeId,
        actorId: userId,
        conversationId,
        type: "TASK_ASSIGNED",
        title: `${actor?.name ?? "Someone"} assigned you a task`,
        body: input.title,
      },
    });
  }
  return serializeItem(item);
}

export async function updateWorkspaceItem(
  userId: string,
  conversationId: string,
  itemId: string,
  input: {
    title?: string;
    content?: string | null;
    status?: "TODO" | "IN_PROGRESS" | "DONE";
    dueAt?: string | null;
    assigneeId?: string | null;
    checklist?: { text: string; done: boolean }[];
  },
) {
  const workspace = await workspaceFor(userId, conversationId);
  const existing = await prisma.workspaceItem.findFirst({
    where: { id: itemId, workspaceId: workspace.id },
  });
  if (!existing) throw notFound("Workspace item not found.");
  if (input.assigneeId) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: input.assigneeId } },
    });
    if (!member) throw badRequest("Assignee must be a conversation member.");
  }
  const item = await prisma.workspaceItem.update({
    where: { id: itemId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.status !== undefined
        ? {
            status: input.status,
            completedAt: input.status === "DONE" ? new Date() : null,
          }
        : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.checklist !== undefined
        ? { checklist: input.checklist as Prisma.InputJsonValue }
        : {}),
    },
    include: {
      assignee: { select: { id: true, username: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });
  await emitToConversation(conversationId, "workspace:updated", { conversationId });
  return serializeItem(item);
}

export async function deleteWorkspaceItem(userId: string, conversationId: string, itemId: string) {
  const workspace = await workspaceFor(userId, conversationId);
  const item = await prisma.workspaceItem.findFirst({
    where: { id: itemId, workspaceId: workspace.id },
  });
  if (!item) throw notFound("Workspace item not found.");
  const membership = await requireMembership(userId, conversationId);
  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";
  if (item.createdById !== userId && !isAdmin) {
    throw forbidden("Only the creator or a group admin can delete this item.");
  }
  await prisma.workspaceItem.delete({ where: { id: itemId } });
  await emitToConversation(conversationId, "workspace:updated", { conversationId });
}

export async function conversationTimeline(userId: string, conversationId: string) {
  await requireMembership(userId, conversationId);
  const workspace = await prisma.workspace.findUnique({ where: { conversationId } });
  const [items, files, pins, summaries, branches] = await Promise.all([
    workspace
      ? prisma.workspaceItem.findMany({
          where: { workspaceId: workspace.id },
          include: { assignee: { select: { id: true, name: true, username: true, avatarUrl: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.attachment.findMany({
      where: { message: { conversationId, deletedAt: null } },
      include: { message: { select: { id: true, senderId: true, createdAt: true, sender: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.conversationPin.findMany({
      where: { conversationId },
      include: { message: { select: { id: true, body: true, createdAt: true, sender: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiSummary.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, title: true, createdAt: true, content: true },
    }),
    prisma.branch.findMany({
      where: { sourceConversationId: conversationId },
      include: { creator: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const events: {
    id: string;
    kind: "decision" | "task" | "deadline" | "file" | "pin" | "summary" | "branch";
    title: string;
    detail?: string | null;
    at: string;
    messageId?: string | null;
    meta?: Record<string, unknown>;
  }[] = [];

  for (const item of items) {
    if (item.type === "DECISION") {
      events.push({
        id: `item-${item.id}`,
        kind: "decision",
        title: item.title,
        detail: item.content,
        at: (item.completedAt ?? item.createdAt).toISOString(),
        messageId: item.sourceMessageId,
        meta: { status: item.status },
      });
    } else {
      events.push({
        id: `item-${item.id}`,
        kind: "task",
        title: item.title,
        detail: item.content,
        at: item.createdAt.toISOString(),
        messageId: item.sourceMessageId,
        meta: { status: item.status, dueAt: item.dueAt?.toISOString() ?? null },
      });
      if (item.dueAt) {
        events.push({
          id: `due-${item.id}`,
          kind: "deadline",
          title: `Deadline: ${item.title}`,
          at: item.dueAt.toISOString(),
          messageId: item.sourceMessageId,
          meta: { status: item.status },
        });
      }
    }
  }
  for (const file of files) {
    events.push({
      id: `file-${file.id}`,
      kind: "file",
      title: file.originalName,
      detail: file.mimeType,
      at: file.createdAt.toISOString(),
      messageId: file.message?.id ?? null,
      meta: { attachmentId: file.id, size: file.size, mimeType: file.mimeType },
    });
  }
  for (const pin of pins) {
    events.push({
      id: `pin-${pin.id}`,
      kind: "pin",
      title: pin.message.body.slice(0, 140) || "Pinned message",
      detail: `Pinned by ${pin.pinnedById}`,
      at: pin.createdAt.toISOString(),
      messageId: pin.message.id,
    });
  }
  for (const summary of summaries) {
    const content = summary.content as { summary?: string } | null;
    events.push({
      id: `summary-${summary.id}`,
      kind: "summary",
      title: summary.title ?? "AI summary",
      detail: content?.summary?.slice(0, 300) ?? null,
      at: summary.createdAt.toISOString(),
      meta: { summaryId: summary.id, kind: summary.kind },
    });
  }
  for (const branch of branches) {
    events.push({
      id: `branch-${branch.id}`,
      kind: "branch",
      title: branch.title,
      detail: "Side discussion started",
      at: branch.createdAt.toISOString(),
      meta: { conversationId: branch.conversationId, messageId: branch.messageId },
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { events };
}

export async function createFromExtraction(
  userId: string,
  conversationId: string,
  items: {
    type: "TASK" | "CHECKLIST" | "NOTE" | "PLAN" | "DECISION";
    title: string;
    content?: string | null;
    dueAt?: string | null;
    assigneeId?: string | null;
    checklist?: { text: string; done: boolean }[];
    sourceMessageId?: string | null;
  }[],
) {
  const created = [];
  for (const item of items.slice(0, 15)) {
    created.push(
      await createWorkspaceItem(userId, conversationId, {
        ...item,
        content: item.content ?? undefined,
        dueAt: item.dueAt ?? null,
        assigneeId: item.assigneeId ?? null,
        checklist: item.checklist,
        sourceMessageId: item.sourceMessageId ?? null,
      }),
    );
  }
  return created;
}
