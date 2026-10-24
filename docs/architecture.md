# Architecture

NEXA is a single Node process that serves the Next.js application and a Socket.IO endpoint on the same port. PostgreSQL is the source of truth; local disk or S3 stores attachments. AI is an optional outbound dependency.

## Runtime topology

```
┌─────────────────────────────────────────────────────────────────┐
│ server.ts                                                       │
│                                                                 │
│  http.createServer(handler)                                     │
│    ├─ Next.js App Router                                        │
│    │    ├─ pages: /, /login, /register, /app/[[...id]]          │
│    │    └─ /api/* route handlers                                │
│    └─ Socket.IO (path /socket.io)                               │
│         ├─ handshake: origin check + nexa_session cookie        │
│         ├─ per-user room: user:<id>                             │
│         └─ events: typing, read, delivered                      │
│                                                                 │
│  shared modules                                                 │
│    ├─ src/server/services/*   business logic + authorization     │
│    ├─ src/server/ai/*         provider clients, prompts          │
│    ├─ src/server/storage.ts   local/S3 adapter                   │
│    └─ src/lib/prisma.ts       Prisma client singleton            │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
        ┌───────▼────────┐              ┌───────▼──────────┐
        │ PostgreSQL     │              │ Upload storage   │
        │ FTS + vectors  │              │ local disk / S3  │
        └────────────────┘              └──────────────────┘
```

Why one process? Next.js route handlers and Socket.IO need the same session model, and a single port simplifies local development and small deployments. The trade-off is that horizontal scaling needs a Socket.IO adapter (Redis) and sticky sessions.

## Request lifecycle

1. **Transport** — the reverse proxy terminates TLS and forwards to `PORT`.
2. **Route handler** — thin: `requireUser(req)` → origin check → rate limit → Zod parse.
3. **Service** — loads data, calls `requireMembership`/`requireAdmin`/`requireOwner`, applies business rules, writes in a transaction where needed.
4. **Serialization** — `src/server/serializers.ts` shapes DTOs per viewer (reaction `mine`, per-user unread counts, peer resolution, limited profile fields).
5. **Real-time fan-out** — services call `emitToUsers`/`emitToConversation` after the commit. If Socket.IO is not initialized (tests, CLI), emit is a no-op.
6. **Response** — `{ data }` on success; `{ error: { code, message, details } }` with an HTTP status on failure. Zod failures become `422 VALIDATION_ERROR`.

## Real-time lifecycle

- On connect, the server validates the session cookie, joins `user:<id>`, increments an in-process presence counter, broadcasts presence to users who share a conversation, and sends a presence snapshot.
- `typing` is validated and membership-checked, then fanned out to other members. It is ephemeral and not stored.
- `read` and `delivered` update `ConversationMember.lastReadAt/lastDeliveredAt` and `MessageReceipt` rows, then emit `receipts:update` to members (respecting the user's read-receipt setting).
- Message creation/edits/deletes/reactions are emitted by the service layer, so REST and Socket.IO clients see the same stream.
- AI turns emit `ai:thinking` and `ai:error` to the requesting user only; the assistant reply itself uses the normal `message:new` path.
- App invite redemption emits `conversation:new` to both the inviter and the new member, and `notification:new` to the inviter.
- On disconnect, the presence count is decremented and `lastSeenAt` is persisted when the last tab closes.

Events are delivered to user rooms, not socket rooms, so multiple tabs stay consistent. Every payload is the same DTO the REST API returns for that viewer.

## Data model

The full model is in `prisma/schema.prisma`. Key choices:

| Model | Role |
| --- | --- |
| `User` / `UserSettings` | Identity, profile, preferences, privacy, AI opt-ins; `isBot` marks the assistant account |
| `Session` | SHA-256 hashed opaque tokens with expiry and user agent/IP metadata |
| `Conversation` | One table for `DIRECT`, `GROUP`, `ROOM`, `BRANCH`; `directKey` dedupes DMs |
| `ConversationMember` | Role, join time, read/delivery watermarks, per-user archive/favorite/mute |
| `Message` | Body, type (text/system/poll), reply/forward links, edit/delete timestamps, `clientId` for idempotency, unique `aiSourceMessageId` |
| `MessageReceipt` | Per-recipient delivered/read timestamps |
| `Attachment` | Private storage key, MIME/kind/size/dimensions, optional message link |
| `Reaction`, `Bookmark`, `ConversationPin`, `Poll*`, `MessageMention`, `ContextCard` | Engagement and structured message extensions |
| `GroupInvite` | Tokenized invite to an existing conversation |
| `AppInvite` / `AppInviteRedemption` | Application invite lifecycle and unique per-user redemption |
| `Workspace` / `WorkspaceItem` | Tasks, decisions, dates, links, files scoped to a conversation |
| `Branch` | Side thread bound to a conversation + source message |
| `AiSummary` / `AiEvidence` | Stored summary plus the exact messages cited |
| `PersonalMemory` | Opt-in, per-user notes used only in that user's AI prompts |
| `MessageEmbedding` | Optional vectors for semantic search |
| `Notification` | In-app notifications with read state and actor/conversation links |

Cascade behavior is deliberate: deleting a user cascades their sessions, memberships, messages, reactions, bookmarks, and uploads. Conversation creators use `SetNull` so groups survive account deletion; ownership is transferred in the service layer. Direct conversations are deleted for both participants during account deletion.

## Message send path

```
POST /api/conversations/:id/messages
  → requireUser + rate limit + sendMessageSchema
  → requireMembership
  → conversation exists and is not expired
  → direct: block check
  → clientId dedupe (retry safety)
  → reply target belongs to the same conversation
  → attachments belong to sender and are unattached
  → transaction:
       create Message
       create MessageReceipt rows for other members
       create mentions, poll/options, context cards
       attach files
       update Conversation.lastMessageAt
  → notifications (mentions, direct messages, groups by level/mute)
  → schedule embedding indexing if configured
  → emit message:new / conversation:updated
```

The transaction guarantees that a message is never visible without its receipts, attachments, and poll data.

## Search

1. **Lexical** — PostgreSQL `to_tsvector('simple', body)` + `websearch_to_tsquery`, joined against `ConversationMember` for the viewer and filtered by expiry, optional conversation, date range, and attachment kind. Ranked by `ts_rank`, then recency.
2. **Fallback** — if FTS syntax fails, a parameterized `ILIKE` query with escaped wildcards is used.
3. **Semantic (optional)** — when embeddings are configured, stored vectors for the viewer's conversations are cosine-ranked above a similarity threshold and merged with lexical results.
4. **AI interpretation (optional)** — when a chat provider is configured, the query can be converted into structured filters; lexical results remain the fallback if the model fails.

The authorization join is part of every query; there is no post-filtering that could leak a result first.

## AI pipeline

```
route → requireUser → rate limit → Zod
      → service: requireMembership + retrieve messages (bounded count/size)
      → prompts.ts: system rules + JSON transcript labeled untrusted
      → provider.ts: Ollama /chat, Gemini or OpenAI-compatible /chat/completions (timeout)
      → parse JSON with Zod
      → validate evidence IDs against retrieved messages
      → persist summary + evidence (if requested)
      → return text, citations, model metadata
```

- `AI_PROVIDER=none` → `503 AI_UNAVAILABLE` with `details.missing`.
- Provider network failure → `502 AI_UNREACHABLE`; timeout → `504 AI_TIMEOUT`.
- Empty output → `502 AI_EMPTY_RESPONSE`; malformed JSON → provider error.
- Grounded AI routes do not mutate messages or account state. Compose returns text to the client; extract returns proposed workspace items.

See `docs/security.md` for prompt-injection controls and residual risk.

### NEXA AI assistant thread

The assistant is a separate path from grounded retrieval:

```
POST /api/conversations/:id/messages  (AI thread only)
  → assertAiConfigured() before persisting the user message
  → persist user message
  → after(): generateAiReply(userId, conversationId, sourceMessageId)
       → per-conversation promise queue
       → membership + bot-membership check
       → source must be a live, non-bot TEXT message
       → unique aiSourceMessageId check
       → emit ai:thinking true
       → last 24 TEXT messages at or before source.createdAt
       → provider chat (system policy + 6,000-char per-message cap)
       → sendMessage(asBot, aiSourceMessageId)
       → emit ai:thinking false
```

- The bot user is created lazily with username `nexa_ai`, `isBot: true`, a random unusable password, and the NEXA avatar. Bot accounts are excluded from login, discovery, contacts, ordinary conversation creation, group membership changes, and branch creation. The username and email are reserved at registration and cannot be claimed through a profile update; a pre-existing human account with either value makes bot creation fail closed.
- The AI conversation is created only by `POST /api/ai/conversation`; it is a normal `DIRECT` conversation with a canonical `directKey`, so get-or-create is idempotent. Reply generation requires the exact `directKey` for the requesting user and the bot, not merely any conversation containing a bot.
- `Message.aiSourceMessageId` is unique. A duplicated send or retry cannot create a second answer; Prisma `P2002` is treated as a benign race loss.
- The context window is cut at the source message's `createdAt`, so a message that arrives during generation is handled by its own queued turn rather than being folded into the current answer.
- If the provider is unconfigured, the send is rejected before persistence. If it fails, no assistant message is stored; the client receives `ai:error`.
- `POST /api/conversations/:id/ai-retry` re-queues the latest unanswered user message, rejects the request if the latest message is already a bot reply, and applies a separate rate limit.

The assistant cannot read other conversations, files, or attachments. It has no tools. Its system prompt is a mitigation for prompt injection; the actual boundary is the service query, which only loads messages from that conversation.

## App invites

Application invites (`AppInvite`) are deliberately separate from conversation invites (`GroupInvite`):

- A token is 18 random bytes encoded as base64url, unique in the database.
- The link is `${APP_URL}/register?invite=<token>`.
- Limits: note ≤ 280 characters, `maxUses` 1–50 (default 1), expiry 1–30 days (default 7).
- Status is computed as `active | expired | revoked | exhausted`; revocation sets `revokedAt`.
- `GET /api/app-invites/public/:token` returns only inviter name, note, remaining uses, and expiry. It is rate-limited by client IP and never exposes conversation data.
- `GET /api/app-invites` is owner-scoped and returns recent redemptions. `DELETE /api/app-invites/:id` revokes.

Redemption is transactional and idempotent per user:

```
validate status inside transaction
  → reject self-redemption / duplicate redemption
  → create unique AppInviteRedemption
  → conditional increment of usedCount (cannot exceed maxUses)
  → create both Contact directions
  → reuse or create canonical DIRECT conversation
  → create system welcome message
  → notify inviter
```

Concurrent attempts for the last use are serialized; the loser receives `busy` or `exhausted` rather than over-redeeming. Registration creates the account first, then attempts redemption. An invalid, expired, revoked, or exhausted invite does **not** block account creation; the response reports `accepted: false` with a reason, the client signs the person in, and a one-time workspace warning explains that the connection was not created. A successful redemption returns the canonical conversation ID, and the client opens `/app/<conversationId>` directly.

## Storage

`src/server/storage.ts` exposes one interface for local disk and S3:

- `uploadAttachment` validates and writes, then creates the `Attachment` row.
- `getAttachmentStream` supports byte ranges for media playback.
- `deleteStorageObject`, `duplicateStorageObject` (forwarding), `readAttachmentBuffer` (AI).
- Local mode writes under `STORAGE_LOCAL_DIR` with random keys; S3 mode uses private objects and server-side streaming. Keys never appear in public URLs.

## Client state

`src/components/nexa/nexa-store.tsx` is the single client store:

- Loads conversations and the active message page.
- Applies optimistic sends keyed by `clientId`; reconciles with server DTOs and dedupes socket echoes.
- Handles socket events, unread counts, document title, notification sound, URL synchronization, and pagination.
- Loads AI status, lazily creates/opens the assistant thread, applies `ai:thinking`/`ai:error`, and blocks sends locally while the provider is unconfigured.
- Exposes actions for every mutation; components never call `fetch` directly for messaging.

The shell (`nexa-app.tsx`) owns overlay state (info/AI/notifications), dialogs, theme application, and keyboard shortcuts. On mobile, the sidebar is shown until a conversation is selected, then the chat view takes over.

## Trade-offs and scaling path

| Current choice | Trade-off | Scale path |
| --- | --- | --- |
| Single Node process | Simple auth + realtime; no horizontal fan-out | Redis Socket.IO adapter + sticky sessions |
| In-memory rate limits | Fast, no dependency; resets on restart | Redis/Upstash fixed-window or token bucket |
| Plaintext messages | Search, moderation, AI, and exports are straightforward | E2EE would require a separate design and would break server-side AI/search |
| Soft deletes | Preserves replies and audit context | Scheduled purge job for tombstones and expired rooms |
| Local disk default | Zero setup | S3-compatible bucket for multi-instance deployments |
| PostgreSQL FTS + optional vectors | No extra search service | Dedicated search/vector store if corpus grows |
| Process-local AI queue | Correct for one instance; turns survive only in memory | Durable job queue for multi-instance deployments |
| Full `node_modules` in Docker builder | Simple, reproducible build | Next standalone output + Prisma engine pruning to slim the image |

The design prioritizes a complete, auditable reference implementation over premature distribution. Every scaling change has a clear seam: services, storage adapter, provider adapter, or the Socket.IO server.
