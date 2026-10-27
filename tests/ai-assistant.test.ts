import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as sendMessagePOST } from "@/app/api/conversations/[id]/messages/route";
import { createSession } from "@/server/session";
import type { AiRuntimeStatus, ChatMessage } from "@/server/ai/provider";

const provider = vi.hoisted(() => ({
  chat: vi.fn(),
  aiStatus: vi.fn(),
}));

vi.mock("@/server/ai/provider", () => ({
  chat: provider.chat,
  aiStatus: provider.aiStatus,
}));

import {
  AI_EMAIL,
  AI_NAME,
  AI_USERNAME,
  assertAiConfigured,
  assertAiRetryable,
  ensureAiUser,
  generateAiReply,
  getOrCreateAiConversation,
  isAiConversation,
  resetAiAssistantState,
} from "@/server/services/ai-assistant";
import { addMembers, createConversation, getOrCreateDirect } from "@/server/services/conversations";
import { createBranch } from "@/server/services/branches";
import { registerUser, updateProfile } from "@/server/services/users";
import { listMessages, sendMessage } from "@/server/services/messages";
import {
  createTestUser,
  prisma,
  resetDatabase,
  sendTestMessage,
  uniqueSuffix,
} from "./helpers";

function configuredStatus(): AiRuntimeStatus {
  return {
    provider: "gemini",
    model: "gemini-2.5-flash",
    configured: true,
    missing: [],
    embeddings: { provider: "none", model: "", configured: false, missing: [] },
    speechToText: { configured: false, model: null, missing: [] },
    timeoutMs: 60_000,
  };
}

function unconfiguredStatus(): AiRuntimeStatus {
  return {
    ...configuredStatus(),
    configured: false,
    provider: "gemini",
    missing: ["GEMINI_API_KEY"],
  };
}

function withSession(token: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      cookie: `nexa_session=${token}`,
      "content-type": "application/json",
      "x-forwarded-for": `test-${uniqueSuffix()}`,
    },
  };
}

function postJson(url: string, token: string, body: unknown) {
  return new NextRequest(url, withSession(token, { method: "POST", body: JSON.stringify(body) }));
}

describe("NEXA AI assistant", () => {
  beforeEach(async () => {
    await resetDatabase();
    provider.aiStatus.mockReset();
    provider.aiStatus.mockReturnValue(configuredStatus());
    provider.chat.mockReset();
    provider.chat.mockImplementation(async (messages: ChatMessage[]) => ({
      text: `Answer to: ${messages[messages.length - 1]?.content ?? "unknown"}`,
      provider: "gemini",
      model: "gemini-2.5-flash",
    }));
  });

  it("creates one private assistant thread per person and never exposes it to others", async () => {
    const person = await createTestUser("ai-person");
    const stranger = await createTestUser("ai-stranger");
    const bot = await ensureAiUser();

    const first = await getOrCreateAiConversation(person.id);
    const second = await getOrCreateAiConversation(person.id);
    expect(first.id).toBe(second.id);
    expect(first.isAi).toBe(true);
    expect(first.title).toBe(AI_NAME);
    expect(await isAiConversation(person.id, first.id)).toBe(true);
    expect(await isAiConversation(stranger.id, first.id)).toBe(false);

    const strangerThread = await getOrCreateAiConversation(stranger.id);
    expect(strangerThread.id).not.toBe(first.id);

    await expect(getOrCreateAiConversation(bot.id)).rejects.toMatchObject({ status: 403 });
    await expect(getOrCreateDirect(person.id, bot.id)).rejects.toMatchObject({ status: 403 });
  });

  it("reserves the assistant identity and refuses to hijack it", async () => {
    const suffix = uniqueSuffix();
    await expect(
      registerUser({
        name: "Reserved Username",
        email: `reserved-${suffix}@test.nexa.local`,
        username: AI_USERNAME,
        password: "TestPass123!",
      }),
    ).rejects.toMatchObject({ status: 409, details: { field: "username" } });

    await expect(
      registerUser({
        name: "Reserved Email",
        email: AI_EMAIL,
        username: `reserved_${suffix}`.slice(0, 24),
        password: "TestPass123!",
      }),
    ).rejects.toMatchObject({ status: 409, details: { field: "email" } });

    const person = await createTestUser("reserved-update");
    await expect(updateProfile(person.id, { username: AI_USERNAME })).rejects.toMatchObject({
      status: 409,
      details: { field: "username" },
    });

    await prisma.user.create({
      data: {
        name: "Squatter",
        email: AI_EMAIL,
        username: AI_USERNAME,
        passwordHash: "not-a-real-hash",
        isBot: false,
      },
    });
    resetAiAssistantState();
    await expect(ensureAiUser()).rejects.toMatchObject({
      status: 500,
      code: "AI_IDENTITY_CONFLICT",
    });
  });

  it("keeps the assistant out of groups and side threads", async () => {
    const person = await createTestUser("ai-boundary");
    const friend = await createTestUser("ai-boundary-friend");
    const bot = await ensureAiUser();

    await expect(
      createConversation(person.id, {
        kind: "group",
        title: "Assistant group",
        memberIds: [friend.id, bot.id],
      }),
    ).rejects.toMatchObject({ status: 400 });

    const group = await createConversation(person.id, {
      kind: "group",
      title: "Human group",
      memberIds: [friend.id],
    });
    await expect(addMembers(person.id, group.id, [bot.id])).rejects.toMatchObject({
      status: 400,
    });

    const ai = await getOrCreateAiConversation(person.id);
    const source = await sendTestMessage(person.id, ai.id, "Branch this answer");
    await expect(
      createBranch(person.id, ai.id, source.id, { memberIds: [friend.id] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects sends before persistence when the provider is not configured", async () => {
    const person = await createTestUser("ai-unconfigured");
    const conversation = await getOrCreateAiConversation(person.id);
    const { token } = await createSession(person.id);
    provider.aiStatus.mockReturnValue(unconfiguredStatus());

    expect(() => assertAiConfigured()).toThrowError(
      expect.objectContaining({ status: 503, code: "AI_UNAVAILABLE" }),
    );

    const response = await sendMessagePOST(
      postJson(`http://localhost:3000/api/conversations/${conversation.id}/messages`, token, {
        body: "Are you there?",
        clientId: `test_${uniqueSuffix()}`,
      }),
      { params: Promise.resolve({ id: conversation.id }) },
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
  });

  it("enforces text-only threads and keeps the bot from sending without the server path", async () => {
    const person = await createTestUser("ai-text");
    const conversation = await getOrCreateAiConversation(person.id);
    const bot = await ensureAiUser();

    await expect(
      sendMessage(person.id, conversation.id, {
        body: "",
        clientId: `test_${uniqueSuffix()}`,
        attachmentIds: ["not-a-real-attachment"],
        contextCards: [],
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      sendMessage(bot.id, conversation.id, {
        body: "I am the bot speaking directly.",
        clientId: `test_${uniqueSuffix()}`,
        attachmentIds: [],
        contextCards: [],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("generates a real reply, records the provider prompt, and is idempotent", async () => {
    const person = await createTestUser("ai-reply");
    const conversation = await getOrCreateAiConversation(person.id);
    const source = await sendTestMessage(person.id, conversation.id, "What is NEXA?");

    await Promise.all([
      generateAiReply(person.id, conversation.id, source.id),
      generateAiReply(person.id, conversation.id, source.id),
    ]);

    expect(provider.chat).toHaveBeenCalledTimes(1);
    const prompt = provider.chat.mock.calls[0]![0] as ChatMessage[];
    expect(prompt[0]?.role).toBe("system");
    expect(prompt[0]?.content).toContain("untrusted content");
    expect(prompt[prompt.length - 1]?.content).toBe("What is NEXA?");

    const page = await listMessages(person.id, conversation.id, { limit: 20 });
    expect(page.messages).toHaveLength(2);
    expect(page.messages[1]).toMatchObject({
      body: "Answer to: What is NEXA?",
      sender: { isBot: true },
    });

    await generateAiReply(person.id, conversation.id, source.id);
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it("queues a message sent mid-generation and answers each source message once", async () => {
    const person = await createTestUser("ai-queue");
    const conversation = await getOrCreateAiConversation(person.id);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    provider.chat.mockImplementation(async (messages: ChatMessage[]) => {
      await gate;
      return {
        text: `Answer to: ${messages[messages.length - 1]?.content ?? "unknown"}`,
        provider: "gemini",
        model: "gemini-2.5-flash",
      };
    });

    const first = await sendTestMessage(person.id, conversation.id, "First question");
    const firstTurn = generateAiReply(person.id, conversation.id, first.id);
    await vi.waitFor(() => expect(provider.chat).toHaveBeenCalledTimes(1));

    const second = await sendTestMessage(person.id, conversation.id, "Second question");
    const secondTurn = generateAiReply(person.id, conversation.id, second.id);
    release();
    await Promise.all([firstTurn, secondTurn]);

    expect(provider.chat).toHaveBeenCalledTimes(2);
    const page = await listMessages(person.id, conversation.id, { limit: 20 });
    const botBodies = page.messages
      .filter((message) => message.sender.isBot)
      .map((message) => message.body);
    expect(botBodies).toEqual(["Answer to: First question", "Answer to: Second question"]);
  });

  it("allows retry only while the latest user message is unanswered", async () => {
    const person = await createTestUser("ai-retry");
    const conversation = await getOrCreateAiConversation(person.id);
    const source = await sendTestMessage(person.id, conversation.id, "Retry me");

    await expect(assertAiRetryable(person.id, conversation.id)).resolves.toBe(source.id);

    await generateAiReply(person.id, conversation.id, source.id);
    await expect(assertAiRetryable(person.id, conversation.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("renders provider markdown as clean chat text", async () => {
    const person = await createTestUser("ai-markdown");
    const conversation = await getOrCreateAiConversation(person.id);
    const source = await sendTestMessage(person.id, conversation.id, "Give me a plan");
    provider.chat.mockResolvedValueOnce({
      text: "## Plan\n\n* **First:** invite `ada`\n* Second: ship",
      provider: "gemini",
      model: "gemini-2.5-flash",
    });

    await generateAiReply(person.id, conversation.id, source.id);

    const page = await listMessages(person.id, conversation.id, { limit: 20 });
    expect(page.messages[1]?.body).toBe("Plan\n\n• First: invite ada\n• Second: ship");
  });

  it("turns provider failures into errors without persisting a fake answer", async () => {
    const person = await createTestUser("ai-failure");
    const conversation = await getOrCreateAiConversation(person.id);
    const source = await sendTestMessage(person.id, conversation.id, "Fail please");
    provider.chat.mockRejectedValue(new Error("upstream exploded"));

    await generateAiReply(person.id, conversation.id, source.id);

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.senderId).toBe(person.id);
  });
});
