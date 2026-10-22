#!/usr/bin/env node
/**
 * NEXA end-to-end smoke test.
 *
 * Verifies the running app over HTTP + WebSocket:
 *  - demo login and session cookies
 *  - group creation between two accounts
 *  - real-time message delivery to the other member
 *  - typing indicators, edit permissions, search, private API access
 *  - honest AI-unavailable behaviour when no provider is configured
 *
 * Usage:
 *   1. npm run db:start && npm run db:setup
 *   2. npm run build && npm start   (or npm run dev)
 *   3. npm run e2e
 *
 * Override the target with APP_URL=http://localhost:3000
 */
import assert from "node:assert/strict";
import { io } from "socket.io-client";

const BASE = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.E2E_PASSWORD || "DemoPass123!";
const ADA = process.env.E2E_USER_A || "ada@nexa.demo";
const MILES = process.env.E2E_USER_B || "miles@nexa.demo";

let passed = 0;

function step(name) {
  passed += 1;
  console.log(`  ${String(passed).padStart(2, "0")}. ${name}`);
}

async function request(path, { method = "GET", cookie, body, expected = 200 } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (response.status !== expected) {
    throw new Error(
      `${method} ${path} expected ${expected}, got ${response.status}: ${typeof data === "string" ? data.slice(0, 400) : JSON.stringify(data)}`,
    );
  }
  return { status: response.status, data, headers: response.headers };
}

function sessionCookie(response) {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()[0]
      : response.headers.get("set-cookie");
  assert.ok(raw, "Login did not set a session cookie");
  const pair = raw.split(";")[0];
  assert.match(pair, /^nexa_session=/);
  return pair;
}

async function login(identifier) {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: { identifier, password: PASSWORD },
  });
  return { cookie: sessionCookie(response), user: response.data.user };
}

function connect(cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Cookie: cookie },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Socket connection timed out"));
    }, 10_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

async function main() {
  console.log(`\nNEXA end-to-end test against ${BASE}\n`);

  const health = await fetch(`${BASE}/`);
  assert.equal(health.status, 200, "Landing page should be reachable");
  step("landing page reachable");

  const ada = await login(ADA);
  const miles = await login(MILES);
  step(`signed in as ${ada.user.name} and ${miles.user.name}`);

  const anonymous = await request("/api/conversations", { expected: 401 });
  assert.equal(anonymous.data.error.code, "UNAUTHORIZED");
  step("anonymous API access rejected with 401");

  const shell = await fetch(`${BASE}/app`, { headers: { Cookie: ada.cookie } });
  assert.equal(shell.status, 200, "Authenticated app shell should render");
  const shellHtml = await shell.text();
  assert.ok(shellHtml.includes("NEXA"), "App shell should contain the product name");
  step("authenticated app shell renders server-side");

  const sockets = [];
  let adaSocket;
  let milesSocket;
  try {
    [adaSocket, milesSocket] = await Promise.all([connect(ada.cookie), connect(miles.cookie)]);
    sockets.push(adaSocket, milesSocket);
    step("both users connected over WebSocket");

    const rejected = io(BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: false,
    });
    const rejection = await new Promise((resolve) => {
      rejected.once("connect_error", (error) => resolve(error.message));
      rejected.once("connect", () => resolve(null));
      setTimeout(() => resolve("timeout"), 5000);
    });
    rejected.close();
    assert.equal(rejection, "unauthorized", "Socket without a session must be rejected");
    step("WebSocket without a session rejected");

    const token = `e2e-${Date.now().toString(36)}`;
    const created = await request("/api/conversations", {
      method: "POST",
      cookie: ada.cookie,
      expected: 201,
      body: {
        kind: "group",
        title: `E2E verification ${token}`,
        description: "Created by scripts/e2e.mjs",
        memberIds: [miles.user.id],
        firstMessage: `Kickoff ${token}`,
      },
    });
    const conversationId = created.data.conversation.id;
    assert.ok(conversationId);
    step("group conversation created with both members");

    const typingPromise = waitFor(
      adaSocket,
      "typing:update",
      (payload) => payload.conversationId === conversationId && payload.userId === miles.user.id,
    );
    milesSocket.emit("typing", { conversationId, isTyping: true });
    const typing = await typingPromise;
    assert.equal(typing.isTyping, true);
    step("typing indicator delivered in real time");

    const body = `Realtime check ${token}`;
    const realtimePromise = waitFor(
      milesSocket,
      "message:new",
      (payload) => payload.conversationId === conversationId && payload.body === body,
    );
    const sent = await request(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      cookie: ada.cookie,
      expected: 201,
      body: {
        body,
        clientId: `e2e_${token}`,
        attachmentIds: [],
        contextCards: [],
      },
    });
    const delivered = await realtimePromise;
    assert.equal(delivered.id, sent.data.message.id);
    assert.equal(delivered.sender.id, ada.user.id);
    step("message delivered to the other member over WebSocket");

    const messageId = sent.data.message.id;
    const readBack = await request(`/api/conversations/${conversationId}/messages?limit=20`, {
      cookie: miles.cookie,
    });
    assert.ok(readBack.data.messages.some((m) => m.id === messageId));
    step("message readable through the HTTP API");

    const forbiddenEdit = await request(`/api/messages/${messageId}`, {
      method: "PATCH",
      cookie: miles.cookie,
      expected: 403,
      body: { body: "Should not be allowed" },
    });
    assert.equal(forbiddenEdit.data.error.code, "FORBIDDEN");
    step("other members cannot edit someone else's message");

    const edited = await request(`/api/messages/${messageId}`, {
      method: "PATCH",
      cookie: ada.cookie,
      body: { body: `${body} (edited)` },
    });
    assert.equal(edited.data.message.editedAt !== null, true);
    step("author can edit their own message");

    const search = await request(`/api/search?q=${encodeURIComponent(token)}`, {
      cookie: miles.cookie,
    });
    assert.ok(search.data.results.some((result) => result.message.id === messageId));
    step("search finds the message for a member");

    const privateAccess = await request(`/api/conversations/${conversationId}`, {
      cookie: undefined,
      expected: 401,
    });
    assert.equal(privateAccess.data.error.code, "UNAUTHORIZED");
    step("conversation endpoint requires authentication");

    const status = await request("/api/ai/status", { cookie: ada.cookie });
    if (status.data.ai.configured) {
      step(`AI provider configured (${status.data.ai.provider}/${status.data.ai.model}); skipped unavailable-path check`);
    } else {
      const summary = await request("/api/ai/summary", {
        method: "POST",
        cookie: ada.cookie,
        expected: 503,
        body: { conversationId, kind: "GROUP" },
      });
      assert.equal(summary.data.error.code, "AI_UNAVAILABLE");
      assert.ok(Array.isArray(summary.data.error.details.missing));
      step("AI stays off without a provider and reports what is missing");
    }

    const deleted = await request(`/api/conversations/${conversationId}`, {
      method: "DELETE",
      cookie: ada.cookie,
    });
    assert.equal(deleted.data.ok, true);
    const gone = await request(`/api/conversations/${conversationId}`, {
      cookie: miles.cookie,
      expected: 404,
    });
    assert.equal(gone.data.error.code, "NOT_FOUND");
    step("owner can delete the group and it disappears for members");
  } finally {
    for (const socket of sockets) socket.close();
  }

  console.log(`\nAll ${passed} checks passed.\n`);
}

main().catch((error) => {
  console.error("\nE2E failed:", error.message);
  process.exitCode = 1;
});
