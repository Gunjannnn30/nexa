import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { z } from "zod";
import { env } from "./src/lib/env";
import { prisma } from "./src/lib/prisma";
import {
  SESSION_COOKIE,
  parseCookies,
  validateSessionToken,
} from "./src/server/session";
import { setRealtimeServer, userRoom } from "./src/server/realtime";

const dev = env.NODE_ENV !== "production";
// `HOSTNAME` is set by Docker to the container id, which resolves to loopback
// inside the container and makes the app unreachable behind a proxy. Only an
// explicit HOST may override the wildcard bind.
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const onlineCounts = new Map<string, number>();

const typingPayload = z.object({
  conversationId: z.string().min(1).max(64),
  isTyping: z.boolean(),
});

const conversationPayload = z.object({
  conversationId: z.string().min(1).max(64),
});

async function getMembership(conversationId: string, userId: string) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, lastReadAt: true },
  });
}

async function getSharedUserIds(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  if (!memberships.length) return [];
  const others = await prisma.conversationMember.findMany({
    where: {
      conversationId: { in: memberships.map((m) => m.conversationId) },
      userId: { not: userId },
    },
    select: { userId: true },
  });
  return [...new Set(others.map((o) => o.userId))];
}

async function presencePayload(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { lastSeenVisible: true },
  });
  const visible = settings?.lastSeenVisible ?? true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSeenAt: true },
  });
  if (!visible) {
    return { userId, online: false, hidden: true, lastSeenAt: null };
  }
  return {
    userId,
    online: (onlineCounts.get(userId) ?? 0) > 0,
    hidden: false,
    lastSeenAt: user?.lastSeenAt?.toISOString() ?? null,
  };
}

async function broadcastPresence(userId: string) {
  const ids = await getSharedUserIds(userId);
  if (!ids.length) return;
  const payload = await presencePayload(userId);
  const io = serverIo;
  for (const id of ids) io.to(userRoom(id)).emit("presence:update", payload);
}

async function presenceSnapshot(userId: string) {
  const ids = await getSharedUserIds(userId);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    include: { settings: { select: { lastSeenVisible: true } } },
  });
  return users.map((u) => {
    const visible = u.settings?.lastSeenVisible ?? true;
    return {
      userId: u.id,
      online: visible && (onlineCounts.get(u.id) ?? 0) > 0,
      hidden: !visible,
      lastSeenAt: visible ? u.lastSeenAt?.toISOString() ?? null : null,
    };
  });
}

let serverIo: Server;

async function markDelivered(conversationId: string, userId: string) {
  const now = new Date();
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId },
    data: { lastDeliveredAt: now },
  });
  await prisma.$executeRaw`
    UPDATE "MessageReceipt" r
    SET "deliveredAt" = COALESCE(r."deliveredAt", ${now})
    FROM "Message" m
    WHERE r."messageId" = m.id
      AND r."userId" = ${userId}
      AND m."conversationId" = ${conversationId}
      AND m."senderId" <> ${userId}
      AND r."deliveredAt" IS NULL
  `;
  await emitReceipt(conversationId, userId, { deliveredAt: now.toISOString() });
}

async function markRead(conversationId: string, userId: string) {
  const now = new Date();
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: now, lastDeliveredAt: now },
  });
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { readReceipts: true },
  });
  if (settings?.readReceipts !== false) {
    await prisma.$executeRaw`
      UPDATE "MessageReceipt" r
      SET "readAt" = COALESCE(r."readAt", ${now}),
          "deliveredAt" = COALESCE(r."deliveredAt", ${now})
      FROM "Message" m
      WHERE r."messageId" = m.id
        AND r."userId" = ${userId}
        AND m."conversationId" = ${conversationId}
        AND m."senderId" <> ${userId}
        AND r."readAt" IS NULL
    `;
    await emitReceipt(conversationId, userId, {
      readAt: now.toISOString(),
      deliveredAt: now.toISOString(),
    });
  }
}

async function emitReceipt(
  conversationId: string,
  userId: string,
  data: { readAt?: string; deliveredAt?: string },
) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  for (const member of members) {
    serverIo.to(userRoom(member.userId)).emit("receipts:update", {
      conversationId,
      userId,
      ...data,
    });
  }
}

async function main() {
  await app.prepare();
  const httpServer = createServer((req, res) => handler(req, res));
  const allowedOrigin = new URL(env.APP_URL).origin;
  serverIo = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    maxHttpBufferSize: 1_000_000,
    cors: { origin: allowedOrigin, credentials: true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin || origin === allowedOrigin) return callback(null, true);
      callback("Origin not allowed", false);
    },
  });
  setRealtimeServer(serverIo);

  serverIo.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      if (!token) return next(new Error("unauthorized"));
      const user = await validateSessionToken(token);
      if (!user) return next(new Error("unauthorized"));
      socket.data.userId = user.id;
      socket.data.userName = user.name;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  serverIo.on("connection", async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    onlineCounts.set(userId, (onlineCounts.get(userId) ?? 0) + 1);
    await broadcastPresence(userId);
    socket.emit("presence:snapshot", await presenceSnapshot(userId));

    socket.on("typing", async (raw: unknown) => {
      const parsed = typingPayload.safeParse(raw);
      if (!parsed.success) return;
      const member = await getMembership(parsed.data.conversationId, userId);
      if (!member) return;
      const members = await prisma.conversationMember.findMany({
        where: { conversationId: parsed.data.conversationId },
        select: { userId: true },
      });
      for (const m of members) {
        if (m.userId === userId) continue;
        serverIo.to(userRoom(m.userId)).emit("typing:update", {
          conversationId: parsed.data.conversationId,
          userId,
          name: socket.data.userName,
          isTyping: parsed.data.isTyping,
        });
      }
    });

    socket.on("read", async (raw: unknown) => {
      const parsed = conversationPayload.safeParse(raw);
      if (!parsed.success) return;
      const member = await getMembership(parsed.data.conversationId, userId);
      if (!member) return;
      await markRead(parsed.data.conversationId, userId);
    });

    socket.on("delivered", async (raw: unknown) => {
      const parsed = conversationPayload.safeParse(raw);
      if (!parsed.success) return;
      const member = await getMembership(parsed.data.conversationId, userId);
      if (!member) return;
      await markDelivered(parsed.data.conversationId, userId);
    });

    socket.on("disconnect", async () => {
      const count = (onlineCounts.get(userId) ?? 1) - 1;
      if (count <= 0) {
        onlineCounts.delete(userId);
        await prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: new Date() },
        }).catch(() => {});
      } else {
        onlineCounts.set(userId, count);
      }
      await broadcastPresence(userId).catch(() => {});
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> NEXA ready on http://localhost:${port} (${dev ? "development" : "production"})`);
  });

  const shutdown = async () => {
    console.log("Shutting down NEXA...");
    serverIo.close();
    httpServer.close();
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start NEXA", error);
  process.exit(1);
});
