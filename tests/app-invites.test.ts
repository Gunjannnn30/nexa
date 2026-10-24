import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { GET as previewGET } from "@/app/api/app-invites/public/[token]/route";
import {
  createAppInvite,
  listAppInvites,
  previewAppInvite,
  redeemAppInvite,
  revokeAppInvite,
} from "@/server/services/app-invites";
import { createTestUser, prisma, resetDatabase, uniqueSuffix } from "./helpers";

function registerRequest(input: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `test-${uniqueSuffix()}`,
    },
    body: JSON.stringify(input),
  });
}

function newAccount(label: string) {
  const suffix = uniqueSuffix();
  return {
    name: `${label} ${suffix}`,
    email: `${label}-${suffix}@test.nexa.local`,
    username: `${label}_${suffix}`.slice(0, 24),
    password: "TestPass123!",
  };
}

describe("app sharing invites", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates a shareable registration link and exposes only safe preview data", async () => {
    const inviter = await createTestUser("invite-owner");
    const other = await createTestUser("invite-other");

    const invite = await createAppInvite(inviter.id, {
      note: "Join our NEXA workspace",
      maxUses: 2,
      expiresInDays: 7,
    });
    expect(invite.token.length).toBeGreaterThanOrEqual(8);
    expect(invite.url).toContain(`/register?invite=${encodeURIComponent(invite.token)}`);
    expect(invite).toMatchObject({
      note: "Join our NEXA workspace",
      maxUses: 2,
      usedCount: 0,
      remainingUses: 2,
      status: "active",
    });

    const preview = await previewAppInvite(invite.token);
    expect(preview).toMatchObject({
      valid: true,
      status: "active",
      reason: null,
      note: "Join our NEXA workspace",
      remainingUses: 2,
      inviter: { name: inviter.name, username: inviter.username },
    });
    expect(preview.inviter).not.toHaveProperty("email");

    const response = await previewGET(
      new NextRequest(`http://localhost:3000/api/app-invites/public/${invite.token}`, {
        headers: { "x-forwarded-for": `test-${uniqueSuffix()}` },
      }),
      { params: Promise.resolve({ token: invite.token }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invite).toMatchObject({ valid: true, status: "active" });

    expect(await listAppInvites(inviter.id)).toHaveLength(1);
    expect(await listAppInvites(other.id)).toHaveLength(0);
    // App-sharing links are not conversation/group invitations.
    expect(await prisma.groupInvite.count()).toBe(0);
  });

  it("connects a registering recipient to the inviter with contacts, a DM, and a notification", async () => {
    const inviter = await createTestUser("invite-host");
    const invite = await createAppInvite(inviter.id, { maxUses: 2 });
    const account = newAccount("invited");

    const response = await registerPOST(registerRequest({ ...account, inviteToken: invite.token }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user.username).toBe(account.username);
    expect(body.invite).toMatchObject({
      accepted: true,
      inviterName: inviter.name,
    });
    expect(body.invite.conversationId).toBeTruthy();

    const recipient = await prisma.user.findUniqueOrThrow({
      where: { username: account.username },
      select: { id: true },
    });
    expect(
      await prisma.contact.count({
        where: {
          OR: [
            { ownerId: inviter.id, contactUserId: recipient.id },
            { ownerId: recipient.id, contactUserId: inviter.id },
          ],
        },
      }),
    ).toBe(2);

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: body.invite.conversationId },
      include: { members: true, messages: true },
    });
    expect(conversation.type).toBe("DIRECT");
    expect(conversation.members.map((member) => member.userId).sort()).toEqual(
      [inviter.id, recipient.id].sort(),
    );
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      type: "SYSTEM",
      senderId: inviter.id,
    });
    expect(conversation.messages[0]?.body).toContain("invited");

    const notification = await prisma.notification.findFirst({
      where: { userId: inviter.id, actorId: recipient.id, type: "SYSTEM" },
    });
    expect(notification).toMatchObject({
      title: `${account.name} joined NEXA`,
      conversationId: conversation.id,
    });

    const storedInvite = await prisma.appInvite.findUniqueOrThrow({
      where: { id: invite.id },
      include: { redemptions: true },
    });
    expect(storedInvite.usedCount).toBe(1);
    expect(storedInvite.redemptions).toHaveLength(1);
  });

  it("returns once per person and never consumes a second use", async () => {
    const inviter = await createTestUser("invite-once");
    const invite = await createAppInvite(inviter.id, { maxUses: 1 });
    const recipient = await createTestUser("invite-repeat");

    const first = await redeemAppInvite(invite.token, recipient.id);
    const second = await redeemAppInvite(invite.token, recipient.id);
    expect(first).toMatchObject({ accepted: true, alreadyRedeemed: false });
    expect(second).toMatchObject({ accepted: true, alreadyRedeemed: true });

    const stored = await prisma.appInvite.findUniqueOrThrow({
      where: { id: invite.id },
      include: { redemptions: true },
    });
    expect(stored.usedCount).toBe(1);
    expect(stored.redemptions).toHaveLength(1);
    expect(await prisma.contact.count()).toBe(2);
    expect(await prisma.message.count({ where: { type: "SYSTEM" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: inviter.id } })).toBe(1);
  });

  it("does not let the inviter redeem their own link", async () => {
    const inviter = await createTestUser("invite-self");
    const invite = await createAppInvite(inviter.id, { maxUses: 2 });

    expect(await redeemAppInvite(invite.token, inviter.id)).toEqual({
      accepted: false,
      reason: "invalid",
    });

    const stored = await prisma.appInvite.findUniqueOrThrow({
      where: { id: invite.id },
      include: { redemptions: true },
    });
    expect(stored.usedCount).toBe(0);
    expect(stored.redemptions).toHaveLength(0);
  });

  it("keeps registration working when a link is invalid, expired, revoked, or exhausted", async () => {
    const inviter = await createTestUser("invite-stale");

    const invalidResponse = await registerPOST(
      registerRequest({ ...newAccount("invalid"), inviteToken: "not-a-real-invite-token" }),
    );
    expect(invalidResponse.status).toBe(201);
    const invalidBody = await invalidResponse.json();
    expect(invalidBody.invite).toEqual({ accepted: false, reason: "invalid" });

    const expired = await prisma.appInvite.create({
      data: {
        inviterId: inviter.id,
        token: `expired-${uniqueSuffix()}`,
        maxUses: 1,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    expect(await previewAppInvite(expired.token)).toMatchObject({
      valid: false,
      status: "expired",
    });
    expect(await redeemAppInvite(expired.token, (await createTestUser("expired-user")).id)).toEqual({
      accepted: false,
      reason: "expired",
    });

    const revoked = await createAppInvite(inviter.id, { maxUses: 1 });
    const revokedInvite = await revokeAppInvite(inviter.id, revoked.id);
    expect(revokedInvite.status).toBe("revoked");
    expect(await previewAppInvite(revoked.token)).toMatchObject({
      valid: false,
      status: "revoked",
    });

    const exhausted = await createAppInvite(inviter.id, { maxUses: 1 });
    const firstRecipient = await createTestUser("exhaust-1");
    const secondRecipient = await createTestUser("exhaust-2");
    expect(await redeemAppInvite(exhausted.token, firstRecipient.id)).toMatchObject({
      accepted: true,
      alreadyRedeemed: false,
    });
    expect(await redeemAppInvite(exhausted.token, secondRecipient.id)).toEqual({
      accepted: false,
      reason: "exhausted",
    });
    expect(await previewAppInvite(exhausted.token)).toMatchObject({
      valid: false,
      status: "exhausted",
      remainingUses: 0,
    });
  });

  it("consumes exactly one use when two people redeem the last slot at once", async () => {
    const inviter = await createTestUser("invite-race");
    const invite = await createAppInvite(inviter.id, { maxUses: 1 });
    const firstRecipient = await createTestUser("race-1");
    const secondRecipient = await createTestUser("race-2");

    const results = await Promise.all([
      redeemAppInvite(invite.token, firstRecipient.id),
      redeemAppInvite(invite.token, secondRecipient.id),
    ]);
    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.filter((result) => !result.accepted)).toHaveLength(1);
    const rejected = results.find((result) => !result.accepted);
    expect(rejected && "reason" in rejected ? rejected.reason : null).toMatch(/busy|exhausted/);

    const stored = await prisma.appInvite.findUniqueOrThrow({
      where: { id: invite.id },
      include: { redemptions: true },
    });
    expect(stored.usedCount).toBe(1);
    expect(stored.redemptions).toHaveLength(1);
  });

  it("only lets the creator revoke and list an invite", async () => {
    const inviter = await createTestUser("invite-rights");
    const stranger = await createTestUser("invite-stranger");
    const invite = await createAppInvite(inviter.id, { maxUses: 3 });

    await expect(revokeAppInvite(stranger.id, invite.id)).rejects.toMatchObject({ status: 404 });
    expect(await listAppInvites(stranger.id)).toHaveLength(0);

    const revoked = await revokeAppInvite(inviter.id, invite.id);
    expect(revoked.revokedAt).toBeTruthy();
    const recipient = await createTestUser("after-revoke");
    expect(await redeemAppInvite(invite.token, recipient.id)).toEqual({
      accepted: false,
      reason: "revoked",
    });
  });
});
