import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log({
    users: await prisma.user.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    polls: await prisma.poll.count(),
    votes: await prisma.pollVote.count(),
    items: await prisma.workspaceItem.count(),
    notifications: await prisma.notification.count(),
    receipts: await prisma.messageReceipt.count(),
  });
}

main().finally(() => prisma.$disconnect());
