import { beforeEach, describe, expect, it } from "vitest";
import {
  addMembers,
  createConversation,
  getOrCreateDirect,
  leaveConversation,
  setMemberRole,
} from "@/server/services/conversations";
import { listMessages } from "@/server/services/messages";
import { blockUser } from "@/server/services/users";
import { createTestGroup, createTestUser, prisma, resetDatabase, sendTestMessage } from "./helpers";

describe("conversation permissions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("only lets admins add members", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const newcomer = await createTestUser("newcomer");
    const conversation = await createTestGroup(owner.id, [member.id]);

    await expect(addMembers(member.id, conversation.id, [newcomer.id])).rejects.toMatchObject({
      status: 403,
    });
    await addMembers(owner.id, conversation.id, [newcomer.id]);
    expect(
      await prisma.conversationMember.count({ where: { conversationId: conversation.id } }),
    ).toBe(3);
  });

  it("only lets the owner change member roles", async () => {
    const owner = await createTestUser("owner");
    const admin = await createTestUser("admin");
    const member = await createTestUser("member");
    const conversation = await createTestGroup(owner.id, [admin.id, member.id]);

    await setMemberRole(owner.id, conversation.id, admin.id, "ADMIN");
    await expect(
      setMemberRole(admin.id, conversation.id, member.id, "ADMIN"),
    ).rejects.toMatchObject({ status: 403 });

    const promoted = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: conversation.id, userId: admin.id } },
    });
    expect(promoted.role).toBe("ADMIN");
  });

  it("transfers ownership when the owner leaves a group", async () => {
    const owner = await createTestUser("owner");
    const admin = await createTestUser("admin");
    const conversation = await createTestGroup(owner.id, [admin.id]);
    await setMemberRole(owner.id, conversation.id, admin.id, "ADMIN");

    await leaveConversation(owner.id, conversation.id);
    const successor = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: conversation.id, userId: admin.id } },
    });
    expect(successor.role).toBe("OWNER");
    await expect(listMessages(owner.id, conversation.id)).rejects.toMatchObject({ status: 404 });
  });

  it("reuses a direct conversation in either direction", async () => {
    const ada = await createTestUser("ada");
    const miles = await createTestUser("miles");

    const first = await createConversation(ada.id, { kind: "direct", memberIds: [miles.id] });
    const second = await createConversation(miles.id, { kind: "direct", memberIds: [ada.id] });
    expect(second.id).toBe(first.id);
    expect(
      await prisma.conversation.count({
        where: { type: "DIRECT", OR: [{ createdById: ada.id }, { createdById: miles.id }] },
      }),
    ).toBe(1);
  });

  it("prevents direct messages when either side has blocked the other", async () => {
    const ada = await createTestUser("ada");
    const miles = await createTestUser("miles");
    const conversation = await getOrCreateDirect(ada.id, miles.id);

    await blockUser(miles.id, ada.id);
    await expect(sendTestMessage(ada.id, conversation.id, "Hello?")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("hides expired temporary rooms", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const room = await createConversation(owner.id, {
      kind: "room",
      title: "Temporary room",
      memberIds: [member.id],
      expiresInHours: 1,
    });
    await prisma.conversation.update({
      where: { id: room.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await expect(listMessages(member.id, room.id)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a group with no other members", async () => {
    const owner = await createTestUser("owner");
    await expect(
      createConversation(owner.id, { kind: "group", title: "Empty", memberIds: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
