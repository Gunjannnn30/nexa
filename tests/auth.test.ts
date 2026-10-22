import { beforeEach, describe, expect, it } from "vitest";
import {
  authenticateUser,
  changePassword,
  deleteAccount,
  registerUser,
} from "@/server/services/users";
import {
  createSession,
  deleteSessionByToken,
  revokeAllSessions,
  validateSessionToken,
} from "@/server/session";
import {
  createTestGroup,
  createTestUser,
  prisma,
  resetDatabase,
  sendTestMessage,
  uniqueSuffix,
} from "./helpers";
import { getOrCreateDirect } from "@/server/services/conversations";

describe("authentication and accounts", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("registers a user, normalizes the email, and creates default settings", async () => {
    const suffix = uniqueSuffix();
    const user = await registerUser({
      name: "  Ada Test  ",
      email: `  ADA-${suffix}@Example.COM `,
      username: `ada_${suffix}`.slice(0, 24),
      password: "TestPass123!",
    });

    expect(user.email).toBe(`ada-${suffix}@example.com`);
    expect(user.name).toBe("Ada Test");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).not.toBe("TestPass123!");
    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    expect(settings).not.toBeNull();
  });

  it("rejects duplicate emails and usernames with a conflict", async () => {
    const user = await createTestUser("dupe");
    await expect(
      registerUser({
        name: "Someone Else",
        email: user.email.toUpperCase(),
        username: `other_${uniqueSuffix()}`.slice(0, 24),
        password: "TestPass123!",
      }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT", details: { field: "email" } });

    await expect(
      registerUser({
        name: "Someone Else",
        email: `other-${uniqueSuffix()}@test.nexa.local`,
        username: user.username.toUpperCase(),
        password: "TestPass123!",
      }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT", details: { field: "username" } });
  });

  it("authenticates by email or username and rejects bad credentials", async () => {
    const user = await createTestUser("login");

    await expect(authenticateUser(user.email, "TestPass123!")).resolves.toMatchObject({
      id: user.id,
    });
    await expect(authenticateUser(user.username, "TestPass123!")).resolves.toMatchObject({
      id: user.id,
    });
    await expect(authenticateUser(user.email, "WrongPass123!")).resolves.toBeNull();
    await expect(authenticateUser("missing@test.nexa.local", "TestPass123!")).resolves.toBeNull();
  });

  it("creates, validates, and revokes hashed sessions", async () => {
    const user = await createTestUser("session");
    const { token } = await createSession(user.id, { userAgent: "vitest" });

    const stored = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toHaveLength(64);

    await expect(validateSessionToken(token)).resolves.toMatchObject({ id: user.id });
    await expect(validateSessionToken("not-a-real-token")).resolves.toBeNull();

    await deleteSessionByToken(token);
    await expect(validateSessionToken(token)).resolves.toBeNull();
  });

  it("rejects expired sessions", async () => {
    const user = await createTestUser("expired");
    const { token } = await createSession(user.id);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(validateSessionToken(token)).resolves.toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("changes passwords only with the current password and revokes all sessions", async () => {
    const user = await createTestUser("password");
    await createSession(user.id);
    await createSession(user.id);

    await expect(changePassword(user.id, "WrongPass123!", "NewPass123!")).rejects.toMatchObject({
      status: 400,
    });
    await expect(changePassword(user.id, "TestPass123!", "NewPass123!")).resolves.toBeUndefined();

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(authenticateUser(user.email, "NewPass123!")).resolves.toMatchObject({
      id: user.id,
    });
  });

  it("requires the password to delete an account, then removes the user", async () => {
    const user = await createTestUser("delete");
    await createSession(user.id);

    await expect(deleteAccount(user.id, "WrongPass123!")).rejects.toMatchObject({ status: 400 });
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    await revokeAllSessions(user.id);
    await deleteAccount(user.id, "TestPass123!");
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("transfers groups and removes direct threads when an account with content is deleted", async () => {
    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const group = await createTestGroup(owner.id, [member.id], "Surviving group");
    await sendTestMessage(owner.id, group.id, "Message from the deleted account");
    const kept = await sendTestMessage(member.id, group.id, "Message from the remaining member");
    const dm = await getOrCreateDirect(owner.id, member.id);
    await sendTestMessage(owner.id, dm.id, "Direct history");

    await deleteAccount(owner.id, "TestPass123!");

    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(0);
    const survivingGroup = await prisma.conversation.findUnique({
      where: { id: group.id },
      include: { members: true },
    });
    expect(survivingGroup).not.toBeNull();
    expect(survivingGroup?.createdById).toBeNull();
    const successor = survivingGroup?.members.find((m) => m.userId === member.id);
    expect(successor?.role).toBe("OWNER");
    expect(
      await prisma.message.count({
        where: { conversationId: group.id, senderId: owner.id },
      }),
    ).toBe(0);
    expect(await prisma.message.count({ where: { id: kept.id } })).toBe(1);
    expect(await prisma.conversation.count({ where: { id: dm.id } })).toBe(0);
  });
});
