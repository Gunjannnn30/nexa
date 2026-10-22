import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteMessage,
  editMessage,
  listMessages,
  sendMessage,
  toggleReaction,
} from "@/server/services/messages";
import { createTestGroup, createTestUser, prisma, resetDatabase, sendTestMessage } from "./helpers";

describe("messages", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("sends and lists messages for members", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id], "Message tests");

    const sent = await sendTestMessage(owner.id, conversation.id, "First real message");
    expect(sent.body).toBe("First real message");
    expect(sent.sender.id).toBe(owner.id);

    const page = await listMessages(member.id, conversation.id, { limit: 20 });
    expect(page.messages.map((m) => m.id)).toContain(sent.id);
  });

  it("blocks non-members from reading or writing", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const outsider = await createTestUser("outsider");
    const conversation = await createTestGroup(owner.id, [member.id]);
    const sent = await sendTestMessage(owner.id, conversation.id, "Members only");

    await expect(
      sendTestMessage(outsider.id, conversation.id, "I should not be here"),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    await expect(listMessages(outsider.id, conversation.id, { limit: 20 })).rejects.toMatchObject({
      status: 404,
    });
    expect(await prisma.message.count({ where: { id: sent.id } })).toBe(1);
  });

  it("deduplicates retries with the same clientId", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    const input = {
      body: "Retry-safe",
      clientId: "client_retry_123",
      replyToId: null,
      attachmentIds: [],
      contextCards: [],
    };
    const first = await sendMessage(owner.id, conversation.id, input);
    const second = await sendMessage(owner.id, conversation.id, input);
    expect(second.id).toBe(first.id);
    expect(
      await prisma.message.count({
        where: { conversationId: conversation.id, body: "Retry-safe" },
      }),
    ).toBe(1);
  });

  it("allows only the author to edit a message", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    const sent = await sendTestMessage(member.id, conversation.id, "Original text");

    await expect(editMessage(owner.id, sent.id, "Admin rewrite")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    const edited = await editMessage(member.id, sent.id, "  Edited text  ");
    expect(edited.body).toBe("Edited text");
    expect(edited.editedAt).toBeTruthy();
  });

  it("soft-deletes messages and enforces author/admin permissions", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const otherMember = await createTestUser("other");
    const conversation = await createTestGroup(owner.id, [member.id, otherMember.id]);
    const sent = await sendTestMessage(member.id, conversation.id, "Delete me");

    await expect(deleteMessage(otherMember.id, sent.id)).rejects.toMatchObject({ status: 403 });

    await deleteMessage(member.id, sent.id);
    const deleted = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.body).toBe("");

    await expect(editMessage(member.id, sent.id, "Too late")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("lets admins moderate other members' messages", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    const sent = await sendTestMessage(member.id, conversation.id, "Moderate me");

    await deleteMessage(owner.id, sent.id);
    const deleted = await prisma.message.findUniqueOrThrow({ where: { id: sent.id } });
    expect(deleted.deletedAt).not.toBeNull();
  });

  it("toggles reactions and rejects invalid emoji", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [member.id]);
    const sent = await sendTestMessage(owner.id, conversation.id, "React to this");

    const added = await toggleReaction(member.id, sent.id, "🔥");
    expect(added).toEqual([
      { emoji: "🔥", count: 1, userIds: [member.id], mine: true },
    ]);
    const removed = await toggleReaction(member.id, sent.id, "🔥");
    expect(removed).toEqual([]);
    await expect(toggleReaction(member.id, sent.id, "bad emoji")).rejects.toMatchObject({
      status: 400,
    });
  });
});
