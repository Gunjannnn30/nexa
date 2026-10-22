import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiSetupInfo,
  requireAiConfigured,
  summarizeConversation,
} from "@/server/services/ai";
import { createTestGroup, createTestUser, resetDatabase, sendTestMessage } from "./helpers";

describe("AI failure behaviour", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("reports that AI is unconfigured instead of returning fake output", async () => {
    const status = await aiSetupInfo();
    expect(status.configured).toBe(false);
    expect(status.provider).toBe("none");
    expect(status.missing.join(" ")).toContain("AI_PROVIDER");
    expect(status.embeddings.configured).toBe(false);
    expect(status.speechToText.configured).toBe(false);
  });

  it("throws a 503 with the missing variables", () => {
    let error: unknown = null;
    try {
      requireAiConfigured();
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      status: 503,
      code: "AI_UNAVAILABLE",
      details: { missing: ["AI_PROVIDER (set to ollama, openai, or gemini)"] },
    });
  });

  it("does not invent a summary when no provider is configured", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    await sendTestMessage(owner.id, conversation.id, "A real message that needs a summary");

    await expect(
      summarizeConversation(owner.id, { conversationId: conversation.id, kind: "GROUP" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "AI_UNAVAILABLE",
    });
  });

  it("checks membership before contacting the provider", async () => {
    const owner = await createTestUser("owner");
    const outsider = await createTestUser("outsider");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    await sendTestMessage(owner.id, conversation.id, "Private context");

    await expect(
      summarizeConversation(outsider.id, { conversationId: conversation.id, kind: "GROUP" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("Gemini configuration", () => {
  it("reads the Gemini key and model from the environment only", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-a-real-secret");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
    vi.resetModules();
    try {
      const { getAiConfig } = await import("@/lib/env");
      expect(getAiConfig()).toMatchObject({
        configured: true,
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
