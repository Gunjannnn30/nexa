import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { PublicUserDTO, UserSettingsDTO } from "@/server/serializers";
import { publicUser, serializeSettings } from "@/server/serializers";
import { deleteStorageObject } from "@/server/storage";

const publicSelect = {
  id: true,
  username: true,
  name: true,
  email: true,
  avatarUrl: true,
  bio: true,
  statusText: true,
  lastSeenAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function registerUser(input: {
  name: string;
  email: string;
  username: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    throw conflict(
      existing.email === email ? "An account with that email already exists." : "That username is taken.",
      { field: existing.email === email ? "email" : "username" },
    );
  }
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      username,
      passwordHash,
      settings: { create: {} },
    },
    select: publicSelect,
  });
  return user;
}

export async function authenticateUser(identifier: string, password: string) {
  const trimmed = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: trimmed }, { username: trimmed }] },
  });
  if (!user) {
    // Equalise timing roughly against user enumeration.
    await bcrypt.compare(password, "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBq6z3n4FhTW5.6c9Qp8f3P8v0G9Oq");
    return null;
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return user;
}

export async function findUserByIdentifier(identifier: string) {
  const value = identifier.trim().toLowerCase();
  const isEmail = value.includes("@");
  return prisma.user.findFirst({
    where: isEmail ? { email: value } : { username: value },
    select: { ...publicSelect, settings: { select: { discoverable: true } } },
  });
}

export async function updateProfile(
  userId: string,
  input: { name?: string; username?: string; bio?: string | null; statusText?: string | null; avatarUrl?: string | null },
): Promise<PublicUserDTO> {
  if (input.username) {
    const taken = await prisma.user.findFirst({
      where: { username: input.username, id: { not: userId } },
      select: { id: true },
    });
    if (taken) throw conflict("That username is taken.", { field: "username" });
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
      ...(input.statusText !== undefined ? { statusText: input.statusText || null } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
    },
    select: publicSelect,
  });
  return publicUser(user, userId);
}

export async function getOwnProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicSelect, settings: true },
  });
  if (!user) throw notFound("User not found.");
  return {
    ...publicUser(user, userId),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    settings: serializeSettings(user.settings),
  };
}

export async function updateSettings(userId: string, input: Partial<UserSettingsDTO>) {
  const current = await prisma.userSettings.findUnique({ where: { userId } });
  const data: Prisma.UserSettingsUpdateInput = {};
  if (input.theme !== undefined) data.theme = input.theme;
  if (input.language !== undefined) data.language = input.language;
  if (input.readReceipts !== undefined) data.readReceipts = input.readReceipts;
  if (input.lastSeenVisible !== undefined) data.lastSeenVisible = input.lastSeenVisible;
  if (input.discoverable !== undefined) data.discoverable = input.discoverable;
  if (input.notificationsEnabled !== undefined) data.notificationsEnabled = input.notificationsEnabled;
  if (input.soundEnabled !== undefined) data.soundEnabled = input.soundEnabled;
  if (input.messagePreview !== undefined) data.messagePreview = input.messagePreview;
  if (input.digestEnabled !== undefined) data.digestEnabled = input.digestEnabled;
  if (input.digestHour !== undefined) data.digestHour = input.digestHour;
  if (input.aiMemoryEnabled !== undefined) {
    data.aiMemoryEnabled = input.aiMemoryEnabled;
    if (input.aiMemoryEnabled && !current?.aiMemoryConsentAt) data.aiMemoryConsentAt = new Date();
  }
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...(data as object) },
    update: data,
  });
  return serializeSettings(settings);
}

export async function searchUsers(viewerId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: viewerId } },
        {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        { settings: { is: { discoverable: true } } },
        { blockedBy: { none: { blockerId: viewerId } } },
        { blocks: { none: { blockedId: viewerId } } },
      ],
    },
    select: publicSelect,
    take: 20,
    orderBy: { username: "asc" },
  });
  const contacts = await prisma.contact.findMany({
    where: { ownerId: viewerId, contactUserId: { in: users.map((u) => u.id) } },
    select: { contactUserId: true },
  });
  const contactIds = new Set(contacts.map((c) => c.contactUserId));
  return users.map((user) => ({
    ...publicUser(user),
    isContact: contactIds.has(user.id),
  }));
}

export async function listContacts(viewerId: string) {
  const contacts = await prisma.contact.findMany({
    where: {
      ownerId: viewerId,
      contactUser: { blockedBy: { none: { blockerId: viewerId } } },
    },
    include: {
      contactUser: {
        select: {
          ...publicSelect,
          settings: { select: { lastSeenVisible: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return contacts.map((contact) => ({
    id: contact.id,
    nickname: contact.nickname,
    createdAt: contact.createdAt.toISOString(),
    user: publicUser(contact.contactUser),
  }));
}

export async function addContact(viewerId: string, identifier: string, nickname?: string) {
  const target = await findUserByIdentifier(identifier);
  if (!target) throw notFound("No user found with that username or email.");
  if (target.id === viewerId) throw badRequest("You cannot add yourself.");
  if (target.settings?.discoverable === false) {
    throw forbidden("This person has turned off contact discovery.");
  }
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: target.id },
        { blockerId: target.id, blockedId: viewerId },
      ],
    },
  });
  if (blocked) throw forbidden("This contact cannot be added.");
  return prisma.contact.upsert({
    where: { ownerId_contactUserId: { ownerId: viewerId, contactUserId: target.id } },
    create: { ownerId: viewerId, contactUserId: target.id, nickname: nickname ?? null },
    update: { nickname: nickname ?? null },
    include: { contactUser: { select: publicSelect } },
  });
}

export async function removeContact(viewerId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, ownerId: viewerId },
  });
  if (!contact) throw notFound("Contact not found.");
  await prisma.contact.delete({ where: { id: contact.id } });
}

export async function blockUser(viewerId: string, targetId: string) {
  if (targetId === viewerId) throw badRequest("You cannot block yourself.");
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw notFound("User not found.");
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } },
    create: { blockerId: viewerId, blockedId: targetId },
    update: {},
  });
}

export async function unblockUser(viewerId: string, targetId: string) {
  await prisma.block.deleteMany({ where: { blockerId: viewerId, blockedId: targetId } });
}

export async function listBlockedUsers(viewerId: string) {
  const blocks = await prisma.block.findMany({
    where: { blockerId: viewerId },
    include: { blocked: { select: userPublicSelect() } },
    orderBy: { createdAt: "desc" },
  });
  return blocks.map((block) => ({
    id: block.id,
    user: publicUser(block.blocked),
    createdAt: block.createdAt.toISOString(),
  }));
}

function userPublicSelect() {
  return {
    id: true,
    username: true,
    name: true,
    avatarUrl: true,
    bio: true,
    statusText: true,
  } satisfies Prisma.UserSelect;
}

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: string,
  details?: string,
) {
  if (reportedId === reporterId) throw badRequest("You cannot report yourself.");
  const target = await prisma.user.findUnique({ where: { id: reportedId }, select: { id: true } });
  if (!target) throw notFound("User not found.");
  const report = await prisma.report.create({
    data: { reporterId, reportedId, reason, details: details ?? null },
  });
  return { id: report.id, createdAt: report.createdAt.toISOString() };
}

export async function getPublicProfile(viewerId: string, username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      ...publicSelect,
      settings: { select: { lastSeenVisible: true, discoverable: true } },
    },
  });
  if (!user) throw notFound("User not found.");
  const [contact, blocked, blockedBy] = await Promise.all([
    prisma.contact.findUnique({
      where: { ownerId_contactUserId: { ownerId: viewerId, contactUserId: user.id } },
      select: { id: true },
    }),
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: user.id } },
      select: { id: true },
    }),
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: viewerId } },
      select: { id: true },
    }),
  ]);
  return {
    ...publicUser(user, viewerId),
    bio: blockedBy ? null : user.bio,
    statusText: blockedBy ? null : user.statusText,
    isContact: Boolean(contact),
    isBlocked: Boolean(blocked),
    blockedYou: Boolean(blockedBy),
    discoverable: user.settings?.discoverable ?? true,
    lastSeenVisible: user.settings?.lastSeenVisible ?? true,
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest("Your current password is incorrect.");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await prisma.session.deleteMany({ where: { userId } });
}

export async function exportAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      settings: true,
      contacts: { include: { contactUser: { select: publicSelect } } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: { select: { originalName: true, mimeType: true, size: true } },
          reactions: { select: { emoji: true, createdAt: true } },
        },
      },
      conversationMembers: {
        include: {
          conversation: {
            select: {
              id: true,
              type: true,
              title: true,
              description: true,
              createdAt: true,
            },
          },
        },
      },
      bookmarks: {
        include: {
          message: { select: { id: true, body: true, conversationId: true, createdAt: true } },
        },
      },
      memories: true,
      summaries: { include: { evidence: true } },
      workspaceItemsCreated: true,
      notifications: { orderBy: { createdAt: "desc" }, take: 500 },
    },
  });
  if (!user) throw notFound("Account not found.");
  const { passwordHash: _passwordHash, ...safe } = user;
  return {
    exportedAt: new Date().toISOString(),
    notice:
      "This export contains your account data and personal messages. AI summaries include source message excerpts. It does not contain other members' private profile data.",
    account: safe,
  };
}

export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw badRequest("Password is incorrect.");
  }
  const attachments = await prisma.attachment.findMany({
    where: { uploaderId: userId },
    select: { storageKey: true },
  });

  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: {
      role: true,
      conversation: {
        select: {
          id: true,
          type: true,
          members: {
            where: { userId: { not: userId } },
            orderBy: { joinedAt: "asc" },
            select: { id: true, role: true },
          },
        },
      },
    },
  });

  // Direct conversations are shared history; deleting the account removes the
  // thread for both participants. Groups and rooms survive with their other
  // members, and ownership is handed to an admin (or the earliest member).
  const directIds = memberships
    .filter((membership) => membership.conversation.type === "DIRECT")
    .map((membership) => membership.conversation.id);
  if (directIds.length) {
    await prisma.conversation.deleteMany({ where: { id: { in: directIds } } });
  }

  for (const membership of memberships) {
    const { conversation } = membership;
    if (conversation.type === "DIRECT" || membership.role !== "OWNER") continue;
    const successor =
      conversation.members.find((member) => member.role === "ADMIN") ?? conversation.members[0];
    if (successor) {
      await prisma.conversationMember.update({
        where: { id: successor.id },
        data: { role: "OWNER" },
      });
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  // Remove groups/rooms that no longer have any members after the cascade.
  await prisma.conversation.deleteMany({
    where: {
      type: { in: ["GROUP", "ROOM"] },
      members: { none: {} },
    },
  });
  await Promise.allSettled(attachments.map((a) => deleteStorageObject(a.storageKey)));
}
