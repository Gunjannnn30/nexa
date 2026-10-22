import "dotenv/config";
import { PrismaClient, type MemberRole, type MessageType, type WorkspaceItemStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoPass123!";
const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const hoursFromNow = (hours: number) => new Date(now + hours * 3_600_000);

type SeedUser = {
  key: string;
  id: string;
  email: string;
  username: string;
  name: string;
  bio: string;
  statusText?: string;
};

const users: SeedUser[] = [
  {
    key: "ada",
    id: "seed_user_ada",
    email: "ada@nexa.demo",
    username: "ada",
    name: "Ada Okafor",
    bio: "Product lead for Atlas. I care about clear decisions and calm software.",
    statusText: "Shipping RC4 tomorrow",
  },
  {
    key: "miles",
    id: "seed_user_miles",
    email: "miles@nexa.demo",
    username: "miles",
    name: "Miles Ortega",
    bio: "Engineer. Permissions, audit logs, and the occasional CSS rescue.",
    statusText: "Fixing the last blocker",
  },
  {
    key: "june",
    id: "seed_user_june",
    email: "june@nexa.demo",
    username: "june",
    name: "June Park",
    bio: "Design director. Systems, typography, and side threads.",
  },
  {
    key: "theo",
    id: "seed_user_theo",
    email: "theo@nexa.demo",
    username: "theo",
    name: "Theo Lindqvist",
    bio: "Product designer working on onboarding and empty states.",
  },
  {
    key: "priya",
    id: "seed_user_priya",
    email: "priya@nexa.demo",
    username: "priya",
    name: "Priya Raman",
    bio: "Support lead. I turn confused messages into docs and fixes.",
  },
  {
    key: "noor",
    id: "seed_user_noor",
    email: "noor@nexa.demo",
    username: "noor",
    name: "Noor Haddad",
    bio: "Frontend engineer with strong opinions about contrast ratios.",
  },
];

const byKey = Object.fromEntries(users.map((user) => [user.key, user])) as Record<string, SeedUser>;

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        username: user.username,
        name: user.name,
        bio: user.bio,
        statusText: user.statusText ?? null,
      },
      create: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        bio: user.bio,
        statusText: user.statusText ?? null,
        passwordHash,
      },
    });
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        theme: user.key === "ada" ? "dark" : "system",
        readReceipts: true,
        lastSeenVisible: true,
        discoverable: true,
        notificationsEnabled: true,
        soundEnabled: true,
        messagePreview: true,
        digestEnabled: false,
        digestHour: 9,
        aiMemoryEnabled: user.key === "ada",
        ...(user.key === "ada" ? { aiMemoryConsentAt: new Date() } : {}),
      },
    });
  }
}

async function seedContacts() {
  const links: [string, string, string?][] = [
    ["ada", "miles"],
    ["ada", "june", "June (design)"],
    ["ada", "priya"],
    ["ada", "theo"],
    ["miles", "ada"],
    ["june", "ada"],
    ["priya", "ada"],
    ["theo", "noor"],
  ];
  for (const [owner, contact, nickname] of links) {
    await prisma.contact.upsert({
      where: {
        ownerId_contactUserId: {
          ownerId: byKey[owner]!.id,
          contactUserId: byKey[contact]!.id,
        },
      },
      update: { nickname: nickname ?? null },
      create: {
        ownerId: byKey[owner]!.id,
        contactUserId: byKey[contact]!.id,
        nickname: nickname ?? null,
      },
    });
  }
}

async function upsertConversation(input: {
  id: string;
  type: "DIRECT" | "GROUP" | "ROOM" | "BRANCH";
  title: string | null;
  description?: string | null;
  createdById: string;
  lastMessageAt: Date;
  directKey?: string | null;
  isTemporary?: boolean;
  expiresAt?: Date | null;
}) {
  return prisma.conversation.upsert({
    where: { id: input.id },
    update: {
      title: input.title,
      description: input.description ?? null,
      lastMessageAt: input.lastMessageAt,
      expiresAt: input.expiresAt ?? null,
      isTemporary: input.isTemporary ?? false,
    },
    create: {
      id: input.id,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      createdById: input.createdById,
      lastMessageAt: input.lastMessageAt,
      directKey: input.directKey ?? null,
      isTemporary: input.isTemporary ?? false,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

async function addMember(
  conversationId: string,
  userId: string,
  role: MemberRole,
  options: { lastReadAt?: Date | null; favorite?: boolean; archived?: boolean } = {},
) {
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: {
      role,
      ...(options.lastReadAt !== undefined ? { lastReadAt: options.lastReadAt } : {}),
      isFavorite: options.favorite ?? false,
      isArchived: options.archived ?? false,
    },
    create: {
      conversationId,
      userId,
      role,
      lastReadAt: options.lastReadAt ?? null,
      isFavorite: options.favorite ?? false,
      isArchived: options.archived ?? false,
    },
  });
}

async function seedMessage(input: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  type?: MessageType;
  replyToId?: string | null;
  memberIds: string[];
  readBy?: string[];
}) {
  const message = await prisma.message.upsert({
    where: { id: input.id },
    update: {
      body: input.body,
      createdAt: input.createdAt,
      type: input.type ?? "TEXT",
      replyToId: input.replyToId ?? null,
    },
    create: {
      id: input.id,
      conversationId: input.conversationId,
      senderId: input.senderId,
      clientId: `seed_${input.id}`,
      body: input.body,
      type: input.type ?? "TEXT",
      createdAt: input.createdAt,
      replyToId: input.replyToId ?? null,
    },
  });

  const readBy = new Set(input.readBy ?? input.memberIds.filter((id) => id !== input.senderId));
  const receipts = input.memberIds
    .filter((id) => id !== input.senderId)
    .map((userId) => ({
      messageId: message.id,
      userId,
      deliveredAt: new Date(input.createdAt.getTime() + 45_000),
      readAt: readBy.has(userId) ? new Date(input.createdAt.getTime() + 8 * 60_000) : null,
    }));
  if (receipts.length) {
    await prisma.messageReceipt.createMany({ data: receipts, skipDuplicates: true });
  }
  return message;
}

async function seedLaunchRoom() {
  const conversationId = "seed_conv_launch";
  const members = ["ada", "miles", "june", "priya", "theo"];
  const memberIds = members.map((key) => byKey[key]!.id);
  await upsertConversation({
    id: conversationId,
    type: "GROUP",
    title: "Launch room — Atlas",
    description: "Release coordination for Atlas RC4. Decisions and blockers only.",
    createdById: byKey.ada!.id,
    lastMessageAt: minutesAgo(30),
  });
  await addMember(conversationId, byKey.ada!.id, "OWNER", { lastReadAt: minutesAgo(90), favorite: true });
  await addMember(conversationId, byKey.miles!.id, "ADMIN", { lastReadAt: minutesAgo(20) });
  await addMember(conversationId, byKey.june!.id, "ADMIN", { lastReadAt: minutesAgo(40) });
  await addMember(conversationId, byKey.priya!.id, "MEMBER", { lastReadAt: minutesAgo(25) });
  await addMember(conversationId, byKey.theo!.id, "MEMBER", { lastReadAt: minutesAgo(60) });

  const say = (input: Omit<Parameters<typeof seedMessage>[0], "conversationId" | "memberIds">) =>
    seedMessage({ ...input, conversationId, memberIds });

  await say({
    id: "seed_msg_launch_1",
    senderId: byKey.june!.id,
    body: "Morning. Atlas release candidate 3 is on staging — build 2026.10.21-rc3. Please keep feedback in this room so nothing gets lost.",
    createdAt: hoursAgo(30),
  });
  await say({
    id: "seed_msg_launch_2",
    senderId: byKey.miles!.id,
    body: "Checked checkout and the invite flow. Two nits: the permissions empty-state copy is vague, and the audit log timestamp is stored in UTC but labeled as local time.",
    createdAt: hoursAgo(29),
  });
  await say({
    id: "seed_msg_launch_3",
    senderId: byKey.ada!.id,
    body: "Good catch. We should not ship a wrong label. @miles can you own the audit-log fix? That is the only blocker I see.",
    createdAt: hoursAgo(28),
  });
  await say({
    id: "seed_msg_launch_4",
    senderId: byKey.miles!.id,
    body: "Yes. I will push it before 4pm and ask @ada for review. The copy change is small too — I can fold it into the same branch.",
    createdAt: hoursAgo(27),
  });
  await say({
    id: "seed_msg_launch_5",
    senderId: byKey.priya!.id,
    body: "Support macros are updated, and I drafted three FAQ answers for the new permissions screen. Nothing needed from you unless the wording changes.",
    createdAt: hoursAgo(26),
    replyToId: "seed_msg_launch_2",
  });
  await say({
    id: "seed_msg_launch_6",
    senderId: byKey.theo!.id,
    body: "Design has final screenshots for the release notes. Everything matches the spec except the invite modal — and honestly, I prefer what we built.",
    createdAt: hoursAgo(25),
  });
  await say({
    id: "seed_msg_launch_7",
    senderId: byKey.june!.id,
    body: "Decision: keep the invite modal as built, and move the changelog to Friday morning. I will pin this so we stop re-litigating it.",
    createdAt: hoursAgo(24),
  });
  await say({
    id: "seed_msg_launch_8",
    senderId: byKey.miles!.id,
    body: "Audit-log fix is up and the copy is updated. RC4 is building now. Nothing else is blocking from my side.",
    createdAt: hoursAgo(2),
  });
  await say({
    id: "seed_msg_launch_9",
    senderId: byKey.ada!.id,
    body: "Then let's call it: ship RC4 tomorrow at 10:00, changelog at 09:30. If error rate crosses 2% for ten minutes, we roll back to RC2.",
    createdAt: hoursAgo(1),
    readBy: ["miles", "june", "priya", "theo"],
  });
  await say({
    id: "seed_msg_launch_10",
    senderId: byKey.priya!.id,
    body: "I will be online at 08:30 to watch support and the status page. Good luck, everyone.",
    createdAt: minutesAgo(30),
    readBy: ["miles", "june"],
  });

  await prisma.messageMention.createMany({
    data: [
      { messageId: "seed_msg_launch_3", userId: byKey.miles!.id },
      { messageId: "seed_msg_launch_4", userId: byKey.ada!.id },
    ],
    skipDuplicates: true,
  });

  await prisma.reaction.createMany({
    data: [
      { messageId: "seed_msg_launch_7", userId: byKey.ada!.id, emoji: "✅" },
      { messageId: "seed_msg_launch_7", userId: byKey.priya!.id, emoji: "✅" },
      { messageId: "seed_msg_launch_7", userId: byKey.theo!.id, emoji: "👍" },
      { messageId: "seed_msg_launch_9", userId: byKey.june!.id, emoji: "🚀" },
      { messageId: "seed_msg_launch_9", userId: byKey.miles!.id, emoji: "🚀" },
    ],
    skipDuplicates: true,
  });

  await prisma.conversationPin.upsert({
    where: { conversationId_messageId: { conversationId, messageId: "seed_msg_launch_7" } },
    update: {},
    create: {
      conversationId,
      messageId: "seed_msg_launch_7",
      pinnedById: byKey.ada!.id,
    },
  });

  await prisma.bookmark.upsert({
    where: { userId_messageId: { userId: byKey.ada!.id, messageId: "seed_msg_launch_2" } },
    update: {},
    create: { userId: byKey.ada!.id, messageId: "seed_msg_launch_2" },
  });
}

async function seedDesignRoom() {
  const conversationId = "seed_conv_design";
  const members = ["june", "ada", "noor", "theo"];
  const memberIds = members.map((key) => byKey[key]!.id);
  await upsertConversation({
    id: conversationId,
    type: "GROUP",
    title: "Design critique",
    description: "Weekly critique. Bring screens, questions, and one thing you are unsure about.",
    createdById: byKey.june!.id,
    lastMessageAt: hoursAgo(3),
  });
  await addMember(conversationId, byKey.june!.id, "OWNER", { lastReadAt: hoursAgo(2) });
  await addMember(conversationId, byKey.ada!.id, "MEMBER", { lastReadAt: hoursAgo(4), favorite: true });
  await addMember(conversationId, byKey.noor!.id, "ADMIN", { lastReadAt: hoursAgo(2) });
  await addMember(conversationId, byKey.theo!.id, "MEMBER", { lastReadAt: hoursAgo(2) });

  const say = (input: Omit<Parameters<typeof seedMessage>[0], "conversationId" | "memberIds">) =>
    seedMessage({ ...input, conversationId, memberIds });

  await say({
    id: "seed_msg_design_1",
    senderId: byKey.noor!.id,
    body: "The new empty states feel much calmer. One question: should the archived view keep the lime dot?",
    createdAt: hoursAgo(21.5),
  });
  await say({
    id: "seed_msg_design_2",
    senderId: byKey.theo!.id,
    body: "I would drop the dot there. Archived is not a live signal, so the accent loses its meaning.",
    createdAt: hoursAgo(20),
  });
  await say({
    id: "seed_msg_design_3",
    senderId: byKey.june!.id,
    body: "Agreed. Keep lime for anything real-time only: presence, unread counts, and the send action.",
    createdAt: hoursAgo(18),
  });
  await say({
    id: "seed_msg_design_4",
    senderId: byKey.ada!.id,
    body: "Also check the contrast on muted timestamps in light mode. It looked thin on my laptop, especially over the tinted rows.",
    createdAt: hoursAgo(17),
  });
  await say({
    id: "seed_msg_design_5",
    senderId: byKey.noor!.id,
    body: "Bumped it from 4.1:1 to 4.8:1 and removed the dot from archived. Pushed to the branch — screenshots in the thread.",
    createdAt: hoursAgo(3),
    readBy: ["june", "theo"],
  });

  const pollMessage = await say({
    id: "seed_msg_design_6",
    senderId: byKey.june!.id,
    body: "Where should we do the Atlas launch retro?",
    createdAt: hoursAgo(21),
    type: "POLL",
  });
  const poll = await prisma.poll.upsert({
    where: { messageId: pollMessage.id },
    update: {},
    create: {
      messageId: pollMessage.id,
      question: "Where should we do the Atlas launch retro?",
      allowsMultiple: false,
      createdById: byKey.june!.id,
      closesAt: hoursFromNow(20),
    },
  });
  const optionLabels = ["The cabin", "Video call", "Office, Thursday"];
  for (const [order, label] of optionLabels.entries()) {
    const option = await prisma.pollOption.upsert({
      where: { id: `seed_poll_option_${order}` },
      update: { label, order },
      create: { id: `seed_poll_option_${order}`, pollId: poll.id, label, order },
    });
    if (order === 0) {
      await prisma.pollVote.createMany({
        data: [
          { pollOptionId: option.id, userId: byKey.june!.id },
          { pollOptionId: option.id, userId: byKey.theo!.id },
          { pollOptionId: option.id, userId: byKey.noor!.id },
        ],
        skipDuplicates: true,
      });
    }
    if (order === 2) {
      await prisma.pollVote.createMany({
        data: [{ pollOptionId: option.id, userId: byKey.ada!.id }],
        skipDuplicates: true,
      });
    }
  }
}

async function seedIncidentRoom() {
  const conversationId = "seed_conv_incident";
  const members = ["ada", "miles", "priya"];
  const memberIds = members.map((key) => byKey[key]!.id);
  await upsertConversation({
    id: conversationId,
    type: "ROOM",
    title: "Incident 042 — checkout latency",
    description: "Temporary room. Auto-expires after the follow-up review.",
    createdById: byKey.ada!.id,
    lastMessageAt: hoursAgo(4),
    isTemporary: true,
    expiresAt: hoursFromNow(44),
  });
  await addMember(conversationId, byKey.ada!.id, "OWNER", { lastReadAt: hoursAgo(3) });
  await addMember(conversationId, byKey.miles!.id, "ADMIN", { lastReadAt: hoursAgo(3) });
  await addMember(conversationId, byKey.priya!.id, "MEMBER", { lastReadAt: hoursAgo(3) });

  const say = (input: Omit<Parameters<typeof seedMessage>[0], "conversationId" | "memberIds">) =>
    seedMessage({ ...input, conversationId, memberIds });

  await say({
    id: "seed_msg_incident_1",
    senderId: byKey.priya!.id,
    body: "Checkout p95 is at 2.4s in eu-west. I can see connection-pool waits in the dashboard.",
    createdAt: hoursAgo(5),
  });
  await say({
    id: "seed_msg_incident_2",
    senderId: byKey.miles!.id,
    body: "Pool max is 20 per instance. Scaling to 40 and watching error rate. No deploy involved.",
    createdAt: hoursAgo(4.8),
  });
  await say({
    id: "seed_msg_incident_3",
    senderId: byKey.priya!.id,
    body: "Back under 600ms. I will keep the room open until the evening check and add notes to the incident doc.",
    createdAt: hoursAgo(4.5),
  });
  await say({
    id: "seed_msg_incident_4",
    senderId: byKey.ada!.id,
    body: "Thank you both. I am adding a follow-up task to review pool sizing and alert thresholds — not a launch blocker.",
    createdAt: hoursAgo(4),
  });
}

async function seedDirectMessages() {
  const ada = byKey.ada!;
  const miles = byKey.miles!;
  const directKey = [ada.id, miles.id].sort().join(":");
  const conversationId = "seed_conv_dm_ada_miles";
  await upsertConversation({
    id: conversationId,
    type: "DIRECT",
    title: null,
    createdById: ada.id,
    lastMessageAt: minutesAgo(348),
    directKey,
  });
  await addMember(conversationId, ada.id, "MEMBER", { lastReadAt: minutesAgo(300) });
  await addMember(conversationId, miles.id, "MEMBER", { lastReadAt: minutesAgo(300) });

  const memberIds = [ada.id, miles.id];
  await seedMessage({
    id: "seed_msg_dm_ada_1",
    conversationId,
    senderId: miles.id,
    body: "Do you have five minutes to look at the permissions copy before I merge? It is the last item on my list.",
    createdAt: hoursAgo(6),
    memberIds,
  });
  await seedMessage({
    id: "seed_msg_dm_ada_2",
    conversationId,
    senderId: ada.id,
    body: "Yes — send the branch. I will comment inline so we keep the review in one place.",
    createdAt: minutesAgo(354),
    memberIds,
  });
  await seedMessage({
    id: "seed_msg_dm_ada_3",
    conversationId,
    senderId: miles.id,
    body: "Sent. Thank you. After this I am offline until the launch check.",
    createdAt: minutesAgo(348),
    memberIds,
  });
}

async function seedBranch() {
  const sourceConversationId = "seed_conv_launch";
  const conversationId = "seed_conv_branch_perms";
  const memberIds = [byKey.ada!.id, byKey.miles!.id];
  await upsertConversation({
    id: conversationId,
    type: "BRANCH",
    title: "Branch — permissions copy",
    description: "Side thread from Launch room — Atlas.",
    createdById: byKey.miles!.id,
    lastMessageAt: hoursAgo(22),
  });
  await addMember(conversationId, byKey.ada!.id, "MEMBER", { lastReadAt: hoursAgo(21) });
  await addMember(conversationId, byKey.miles!.id, "MEMBER", { lastReadAt: hoursAgo(21) });

  await seedMessage({
    id: "seed_msg_branch_1",
    conversationId,
    senderId: byKey.miles!.id,
    body: "Opening a side thread so we do not bury the launch room in copy details.",
    createdAt: hoursAgo(23),
    memberIds,
  });
  await seedMessage({
    id: "seed_msg_branch_2",
    conversationId,
    senderId: byKey.ada!.id,
    body: "Good call. “Only admins can change roles” is clearer than “role changes are restricted”. Keep the helper text short.",
    createdAt: hoursAgo(22.5),
    memberIds,
  });
  await seedMessage({
    id: "seed_msg_branch_3",
    conversationId,
    senderId: byKey.miles!.id,
    body: "Updated. Merging after CI. I will note the final wording in the launch room.",
    createdAt: hoursAgo(22),
    memberIds,
  });

  await prisma.branch.upsert({
    where: { conversationId },
    update: {},
    create: {
      id: "seed_branch_perms",
      sourceConversationId,
      conversationId,
      messageId: "seed_msg_launch_2",
      title: "Branch — permissions copy",
      createdById: byKey.miles!.id,
    },
  });
}

async function seedWorkspace() {
  const conversationId = "seed_conv_launch";
  const workspace = await prisma.workspace.upsert({
    where: { conversationId },
    update: {},
    create: {
      id: "seed_workspace_launch",
      conversationId,
      name: "Atlas launch",
      description: "Decisions, tasks, and the rollback plan for the RC4 launch.",
      createdById: byKey.ada!.id,
    },
  });

  const items: {
    id: string;
    type: "TASK" | "CHECKLIST" | "NOTE" | "PLAN" | "DECISION";
    title: string;
    content?: string;
    status: WorkspaceItemStatus;
    dueAt?: Date | null;
    assigneeId?: string | null;
    checklist?: { text: string; done: boolean }[];
    sourceMessageId?: string | null;
    completedAt?: Date | null;
  }[] = [
    {
      id: "seed_item_decision_ship",
      type: "DECISION",
      title: "Ship RC4 on Friday at 10:00",
      content: "Changelog at 09:30. Roll back to RC2 if the error rate crosses 2% for ten minutes.",
      status: "DONE",
      sourceMessageId: "seed_msg_launch_9",
      completedAt: hoursAgo(1),
    },
    {
      id: "seed_item_audit_fix",
      type: "TASK",
      title: "Fix audit log timezone label",
      status: "DONE",
      assigneeId: byKey.miles!.id,
      dueAt: hoursAgo(2),
      completedAt: hoursAgo(2),
      sourceMessageId: "seed_msg_launch_2",
    },
    {
      id: "seed_item_changelog",
      type: "TASK",
      title: "Publish the RC4 changelog",
      content: "Cover permissions, audit log, and the invite modal decision.",
      status: "IN_PROGRESS",
      assigneeId: byKey.ada!.id,
      dueAt: hoursFromNow(18),
      sourceMessageId: "seed_msg_launch_7",
    },
    {
      id: "seed_item_support_macros",
      type: "TASK",
      title: "Update support macros for permissions",
      status: "DONE",
      assigneeId: byKey.priya!.id,
      completedAt: hoursAgo(26),
      sourceMessageId: "seed_msg_launch_5",
    },
    {
      id: "seed_item_launch_watch",
      type: "TASK",
      title: "Watch support and status page at launch",
      status: "TODO",
      assigneeId: byKey.priya!.id,
      dueAt: hoursFromNow(14),
      sourceMessageId: "seed_msg_launch_10",
    },
    {
      id: "seed_item_rollback",
      type: "PLAN",
      title: "Rollback plan",
      content:
        "1. Freeze deploys.\n2. Flip the permissions flag off.\n3. Redeploy RC2 if errors persist.\n4. Post an update in the launch room and status page.",
      status: "TODO",
      checklist: [
        { text: "Confirm rollback owner", done: true },
        { text: "Verify RC2 artifact is still available", done: true },
        { text: "Draft customer update", done: false },
      ],
    },
    {
      id: "seed_item_pool_review",
      type: "TASK",
      title: "Review database pool sizing and alerts",
      status: "TODO",
      assigneeId: byKey.miles!.id,
      dueAt: hoursFromNow(72),
      sourceMessageId: "seed_msg_incident_4",
    },
  ];

  for (const item of items) {
    await prisma.workspaceItem.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        content: item.content ?? null,
        status: item.status,
        dueAt: item.dueAt ?? null,
        assigneeId: item.assigneeId ?? null,
        sourceMessageId: item.sourceMessageId ?? null,
        completedAt: item.completedAt ?? null,
      },
      create: {
        id: item.id,
        workspaceId: workspace.id,
        type: item.type,
        title: item.title,
        content: item.content ?? null,
        status: item.status,
        dueAt: item.dueAt ?? null,
        assigneeId: item.assigneeId ?? null,
        checklist: item.checklist ?? undefined,
        sourceMessageId: item.sourceMessageId ?? null,
        completedAt: item.completedAt ?? null,
        createdById: byKey.ada!.id,
      },
    });
  }
}

async function seedOffsiteInvite() {
  const conversationId = "seed_conv_offsite";
  await upsertConversation({
    id: conversationId,
    type: "GROUP",
    title: "Offsite planning",
    description: "Planning the January team offsite. Ada is invited.",
    createdById: byKey.june!.id,
    lastMessageAt: hoursAgo(8),
  });
  for (const key of ["june", "theo", "noor"]) {
    await addMember(conversationId, byKey[key]!.id, key === "june" ? "OWNER" : "MEMBER", {
      lastReadAt: hoursAgo(7),
    });
  }
  const memberIds = [byKey.june!.id, byKey.theo!.id, byKey.noor!.id];
  await seedMessage({
    id: "seed_msg_offsite_1",
    conversationId,
    senderId: byKey.june!.id,
    body: "I found a cabin with reliable wifi and a real kitchen. Holding it until Friday — thoughts on dates?",
    createdAt: hoursAgo(9),
    memberIds,
  });
  await seedMessage({
    id: "seed_msg_offsite_2",
    conversationId,
    senderId: byKey.theo!.id,
    body: "Second week of January works for me. I can own the workshop agenda if we want a half-day of critique.",
    createdAt: hoursAgo(8),
    memberIds,
  });

  await prisma.groupInvite.upsert({
    where: { token: "seed-invite-offsite-ada" },
    update: { status: "PENDING", expiresAt: hoursFromNow(24 * 7) },
    create: {
      id: "seed_invite_offsite",
      conversationId,
      inviterId: byKey.june!.id,
      inviteeId: byKey.ada!.id,
      token: "seed-invite-offsite-ada",
      status: "PENDING",
      expiresAt: hoursFromNow(24 * 7),
    },
  });
}

async function seedNotifications() {
  const notifications: {
    id: string;
    userId: string;
    actorId: string;
    conversationId: string;
    messageId?: string;
    type: "MENTION" | "TASK_ASSIGNED" | "GROUP_INVITE" | "SYSTEM";
    title: string;
    body: string;
    isRead: boolean;
    createdAt: Date;
  }[] = [
    {
      id: "seed_notif_mention",
      userId: byKey.ada!.id,
      actorId: byKey.miles!.id,
      conversationId: "seed_conv_launch",
      messageId: "seed_msg_launch_4",
      type: "MENTION",
      title: "Miles mentioned you in Launch room — Atlas",
      body: "“I will push it before 4pm and ask @ada for review.”",
      isRead: false,
      createdAt: hoursAgo(27),
    },
    {
      id: "seed_notif_task",
      userId: byKey.ada!.id,
      actorId: byKey.june!.id,
      conversationId: "seed_conv_launch",
      messageId: "seed_msg_launch_7",
      type: "TASK_ASSIGNED",
      title: "June assigned you a task",
      body: "Publish the RC4 changelog · due tomorrow",
      isRead: false,
      createdAt: hoursAgo(23),
    },
    {
      id: "seed_notif_invite",
      userId: byKey.ada!.id,
      actorId: byKey.june!.id,
      conversationId: "seed_conv_offsite",
      type: "GROUP_INVITE",
      title: "June invited you to Offsite planning",
      body: "Planning the January team offsite. Ada is invited.",
      isRead: false,
      createdAt: hoursAgo(8),
    },
    {
      id: "seed_notif_incident",
      userId: byKey.ada!.id,
      actorId: byKey.priya!.id,
      conversationId: "seed_conv_incident",
      messageId: "seed_msg_incident_3",
      type: "SYSTEM",
      title: "Checkout latency recovered",
      body: "Priya: “Back under 600ms.” The incident room remains open for the evening check.",
      isRead: true,
      createdAt: hoursAgo(4.5),
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: {},
      create: {
        id: notification.id,
        userId: notification.userId,
        actorId: notification.actorId,
        conversationId: notification.conversationId,
        messageId: notification.messageId ?? null,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      },
    });
  }
}

async function seedMemories() {
  await prisma.personalMemory.upsert({
    where: { id: "seed_memory_ada_bullets" },
    update: {},
    create: {
      id: "seed_memory_ada_bullets",
      userId: byKey.ada!.id,
      content: "I prefer status updates as short bullets with owner and due date.",
      source: "USER",
      isActive: true,
    },
  });
  await prisma.personalMemory.upsert({
    where: { id: "seed_memory_ada_atlas" },
    update: {},
    create: {
      id: "seed_memory_ada_atlas",
      userId: byKey.ada!.id,
      content: "Atlas is our field-notes product. The current release is RC4, and Priya leads support.",
      source: "USER",
      isActive: true,
    },
  });
}

async function main() {
  console.log("Seeding NEXA demo workspace…");
  await seedUsers();
  await seedContacts();
  await seedLaunchRoom();
  await seedDesignRoom();
  await seedIncidentRoom();
  await seedDirectMessages();
  await seedBranch();
  await seedWorkspace();
  await seedOffsiteInvite();
  await seedNotifications();
  await seedMemories();

  console.log("\nDemo accounts (password for all): " + DEMO_PASSWORD);
  for (const user of users) {
    console.log(`  ${user.username.padEnd(8)} ${user.email.padEnd(22)} ${user.name}`);
  }
  console.log("\nStart the app with `npm run dev` and sign in as ada@nexa.demo.");
  console.log("The workspace includes unread messages, a pending invite, a pinned decision, tasks, and a side thread.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
