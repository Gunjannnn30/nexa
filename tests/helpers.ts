import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { registerUser } from "@/server/services/users";
import { createConversation } from "@/server/services/conversations";
import { sendMessage } from "@/server/services/messages";

let counter = 0;

export function uniqueSuffix() {
  counter += 1;
  return `${Date.now().toString(36)}${counter}${randomBytes(3).toString("hex")}`;
}

export async function resetDatabase() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (!rows.length) return;
  const tableList = rows
    .map((row) => `"public"."${row.tablename.replace(/"/g, '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

export async function createTestUser(label = "user") {
  const suffix = uniqueSuffix();
  return registerUser({
    name: `${label} ${suffix}`,
    email: `${label}-${suffix}@test.nexa.local`,
    username: `${label}_${suffix}`.slice(0, 24),
    password: "TestPass123!",
  });
}

export async function createTestGroup(
  ownerId: string,
  memberIds: string[],
  title = "Test room",
) {
  return createConversation(ownerId, {
    kind: "group",
    title,
    description: "Integration test conversation",
    memberIds,
    firstMessage: undefined,
  });
}

export async function sendTestMessage(senderId: string, conversationId: string, body: string) {
  return sendMessage(senderId, conversationId, {
    body,
    clientId: `test_${uniqueSuffix()}`,
    replyToId: null,
    attachmentIds: [],
    contextCards: [],
  });
}

export { prisma };
