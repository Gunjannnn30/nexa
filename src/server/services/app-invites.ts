import { randomBytes } from "node:crypto";
import { notFound } from "@/lib/errors";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/server/serializers";
import {
  createSystemMessage,
  getOrCreateDirect,
} from "@/server/services/conversations";
import { createNotification } from "@/server/services/notifications";

export type AppInviteStatus = "active" | "expired" | "revoked" | "exhausted";

type InviteRecord = {
  id: string;
  token: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export function inviteStatus(invite: InviteRecord, now = new Date()): AppInviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  if (invite.usedCount >= invite.maxUses) return "exhausted";
  return "active";
}

function inviteUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/register?invite=${encodeURIComponent(token)}`;
}

type InviteWithRedemptions = InviteRecord & {
  redemptions: {
    id: string;
    createdAt: Date;
    user: { id: string; name: string; username: string; avatarUrl: string | null; isBot: boolean };
  }[];
};

function serializeInvite(invite: InviteWithRedemptions) {
  return {
    id: invite.id,
    token: invite.token,
    url: inviteUrl(invite.token),
    note: invite.note,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    remainingUses: Math.max(0, invite.maxUses - invite.usedCount),
    expiresAt: invite.expiresAt.toISOString(),
    revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
    createdAt: invite.createdAt.toISOString(),
    status: inviteStatus(invite),
    redemptions: invite.redemptions.map((redemption) => ({
      id: redemption.id,
      createdAt: redemption.createdAt.toISOString(),
      user: {
        id: redemption.user.id,
        name: redemption.user.name,
        username: redemption.user.username,
        avatarUrl: redemption.user.avatarUrl,
        initials: publicUser(redemption.user).initials,
      },
    })),
  };
}

const redemptionInclude = {
  redemptions: {
    orderBy: { createdAt: "desc" as const },
    take: 25,
    include: {
      user: {
        select: { id: true, name: true, username: true, avatarUrl: true, isBot: true },
      },
    },
  },
};

export async function createAppInvite(
  inviterId: string,
  input: { note?: string; maxUses?: number; expiresInDays?: number },
) {
  const maxUses = Math.min(Math.max(input.maxUses ?? 1, 1), 50);
  const expiresInDays = Math.min(Math.max(input.expiresInDays ?? 7, 1), 30);
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = randomBytes(18).toString("base64url");
    try {
      const invite = await prisma.appInvite.create({
        data: {
          token,
          inviterId,
          note: input.note?.trim() || null,
          maxUses,
          expiresAt,
        },
        include: redemptionInclude,
      });
      return serializeInvite(invite);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique invite token.");
}

export async function listAppInvites(inviterId: string) {
  const invites = await prisma.appInvite.findMany({
    where: { inviterId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: redemptionInclude,
  });
  return invites.map(serializeInvite);
}

export async function revokeAppInvite(inviterId: string, inviteId: string) {
  const invite = await prisma.appInvite.findFirst({
    where: { id: inviteId, inviterId },
    select: { id: true, revokedAt: true },
  });
  if (!invite) throw notFound("Invite not found.");
  if (!invite.revokedAt) {
    await prisma.appInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
  }
  const updated = await prisma.appInvite.findUniqueOrThrow({
    where: { id: invite.id },
    include: redemptionInclude,
  });
  return serializeInvite(updated);
}

/** Public preview for the registration page. Never reveals the inviter's email. */
export async function previewAppInvite(token: string) {
  const invite = await prisma.appInvite.findUnique({
    where: { token },
    include: {
      inviter: {
        select: { id: true, name: true, username: true, avatarUrl: true, isBot: true },
      },
    },
  });
  if (!invite) {
    return {
      valid: false,
      status: "invalid" as const,
      reason: "This invite link is not valid.",
      inviter: null,
      note: null,
      expiresAt: null,
      remainingUses: null,
    };
  }
  const status = inviteStatus(invite);
  const reason =
    status === "revoked"
      ? "This invite was revoked by the person who shared it."
      : status === "expired"
        ? "This invite has expired."
        : status === "exhausted"
          ? "This invite has already been used the maximum number of times."
          : null;
  return {
    valid: status === "active",
    status,
    reason,
    inviter: {
      name: invite.inviter.name,
      username: invite.inviter.username,
      avatarUrl: invite.inviter.avatarUrl,
      initials: publicUser(invite.inviter).initials,
    },
    note: invite.note,
    expiresAt: invite.expiresAt.toISOString(),
    remainingUses: Math.max(0, invite.maxUses - invite.usedCount),
  };
}

export type RedeemResult =
  | {
      accepted: true;
      alreadyRedeemed: boolean;
      inviterName: string;
      inviterUsername: string;
      conversationId: string | null;
    }
  | { accepted: false; reason: "invalid" | "expired" | "revoked" | "exhausted" | "busy" };

/**
 * Atomically consumes one use of an app invite, then connects the new account
 * with the inviter. Registration should still succeed when this returns
 * `accepted: false`; the caller surfaces an honest warning instead.
 */
export async function redeemAppInvite(token: string, userId: string): Promise<RedeemResult> {
  const normalized = token.trim();
  if (!normalized || normalized.length > 128) return { accepted: false, reason: "invalid" };

  const claim = await prisma.$transaction(async (tx) => {
    const invite = await tx.appInvite.findUnique({
      where: { token: normalized },
      include: {
        inviter: { select: { id: true, name: true, username: true } },
      },
    });
    if (!invite) return { accepted: false as const, reason: "invalid" as const };
    // Registration creates a new account, but keep this invariant explicit so
    // the service remains safe if it is reused by another onboarding flow.
    if (invite.inviterId === userId) {
      return { accepted: false as const, reason: "invalid" as const };
    }
    // Check the person's existing redemption before invite status so a retry
    // still reports the established connection after the link is exhausted,
    // revoked, or expired. No extra use is consumed in that case.
    const existing = await tx.appInviteRedemption.findUnique({
      where: { inviteId_userId: { inviteId: invite.id, userId } },
      select: { id: true },
    });
    if (existing) {
      return {
        accepted: true as const,
        alreadyRedeemed: true,
        inviter: invite.inviter,
      };
    }

    const status = inviteStatus(invite);
    if (status !== "active") return { accepted: false as const, reason: status };

    const updated = await tx.appInvite.updateMany({
      where: {
        id: invite.id,
        usedCount: invite.usedCount,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedCount: { increment: 1 } },
    });
    if (!updated.count) return { accepted: false as const, reason: "busy" as const };

    await tx.appInviteRedemption.create({ data: { inviteId: invite.id, userId } });
    return {
      accepted: true as const,
      alreadyRedeemed: false,
      inviter: invite.inviter,
    };
  });

  if (!claim.accepted) return { accepted: false, reason: claim.reason };

  const inviterId = claim.inviter.id;
  const newUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true },
  });
  if (!newUser) return { accepted: false, reason: "invalid" };

  let conversationId: string | null = null;
  try {
    await prisma.contact.createMany({
      data: [
        { ownerId: inviterId, contactUserId: userId },
        { ownerId: userId, contactUserId: inviterId },
      ],
      skipDuplicates: true,
    });

    const conversation = await getOrCreateDirect(userId, inviterId);
    conversationId = conversation.id;

    if (!claim.alreadyRedeemed) {
      await createSystemMessage(
        conversation.id,
        inviterId,
        `${claim.inviter.name} invited ${newUser.name} to NEXA. You're now connected — say hello.`,
      );
      await createNotification({
        userId: inviterId,
        actorId: userId,
        conversationId: conversation.id,
        type: "SYSTEM",
        title: `${newUser.name} joined NEXA`,
        body: `${newUser.name} accepted your invite. You're now connected.`,
      });
    }
  } catch (error) {
    console.error("[nexa:app-invite] connection failed", error);
  }

  return {
    accepted: true,
    alreadyRedeemed: claim.alreadyRedeemed,
    inviterName: claim.inviter.name,
    inviterUsername: claim.inviter.username,
    conversationId,
  };
}
