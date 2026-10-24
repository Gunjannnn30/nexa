# Security model

This document describes what NEXA protects, where the trust boundaries are, and what remains out of scope. It is written for operators and reviewers, not as marketing.

## Scope and non-goals

**Protected**

- Account credentials and sessions
- Conversation content and membership
- Uploaded files
- AI memory notes and AI-generated summaries
- Application invite tokens, redemption state, and invite-gated onboarding
- Authorization decisions for every API and WebSocket action

**Explicitly not provided**

- End-to-end encryption. The application server decrypts nothing because it never encrypts message bodies at rest. TLS protects transit only.
- Zero-knowledge operation. The database contains plaintext message bodies, profile data, and metadata.
- Protection from a compromised host. An attacker with root on the app server can read the database connection string, environment variables, and files.
- Anonymous use. Every app route and API requires a session (landing/auth pages excepted).

## Assets and trust boundaries

```
Untrusted                         Semi-trusted                     Trusted
─────────                         ────────────                     ───────
Browser input  ──HTTPS──▶  Reverse proxy / TLS  ──HTTP──▶  Next.js + Socket.IO
Cookies, files,            (operator-controlled)           │
AI output, message                                          ├─▶ PostgreSQL (plaintext at rest)
content                                                     ├─▶ Local disk / S3 (private objects)
                                                            └─▶ AI provider (optional, external)
```

- **Browser** — untrusted. All input is validated and authorized server-side. Client-side checks are convenience only.
- **Reverse proxy** — trusted for TLS termination and forwarded headers. Configure it to strip client-supplied `X-Forwarded-*` headers it does not control.
- **App process** — trusted. Holds the database URL, session hashing, and AI keys.
- **PostgreSQL** — trusted storage. Use encryption at rest, network isolation, least-privilege credentials, and backups with the same classification as production data.
- **AI provider** — external when hosted. Treat prompts as data leaving your boundary. Ollama keeps inference local.

## Authentication

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, cost 12; passwords never logged or returned |
| Password policy | Minimum 8 characters, maximum 200; enforced by Zod |
| Session token | 32 random bytes, base64url; only SHA-256 hash stored |
| Cookie | `nexa_session`, `httpOnly`, `SameSite=Lax`, `path=/`, `Secure` when `NODE_ENV=production` |
| Expiry | `SESSION_TTL_DAYS` (default 30); expired rows deleted on validation |
| Revocation | Logout deletes the current session; password change deletes all sessions |
| Enumeration resistance | Login returns one generic message for unknown user or wrong password; unknown-user path still performs a bcrypt comparison |
| Login throttling | 20 attempts / 15 min per IP and 8 / 15 min per identifier |
| Registration throttling | 5 / hour per IP |

Sessions are opaque; there is no JWT that can be forged client-side. A stolen cookie is a valid session until expiry or revocation — this is why HTTPS and short TTLs matter.

## Abuse controls

All limits are fixed-window and held in process memory. They are per-instance; a horizontally scaled deployment must replace the store with Redis or another shared counter.

| Scope | Limit |
| --- | --- |
| Login per IP | 20 / 15 min |
| Login per identifier | 8 / 15 min |
| Registration per IP | 5 / hour |
| Message send per user | 80 / min |
| AI send per user | 20 / 5 min |
| AI retry per user | 10 / 5 min |
| AI summary / ask / compose / digest / extract / transcribe / backfill | 10 / 20 / 20 / 6 / 15 / 8 / 4 per minute |
| AI conversation open | 10 / min |
| App invite create | 20 / hour |
| App invite public preview per IP | 120 / min |
| App invite revoke | 60 / min |
| Search | 45 / min |
| Upload | 30 / min |
| Forward | 20 / min |

Rate-limit keys are scoped by user ID where authenticated and by client IP for login, registration, and public invite preview. A `429` carries `details.retryAfter` in seconds.

## Authorization invariants

1. **Every conversation operation requires membership.** `requireMembership` is called by message reads/writes, search filters, pins, workspace, branches, timeline, export, and AI.
2. **Admin and owner actions are separated.** Adding/removing members and changing roles require `OWNER`/`ADMIN`; changing roles and deleting a conversation require `OWNER`.
3. **Non-members receive `404`, not `403`.** This avoids confirming that a private conversation or attachment exists.
4. **Direct conversations are deduplicated and access-checked.** The canonical `directKey` prevents duplicate threads; both members are explicit `ConversationMember` rows.
5. **Blocks are checked at send time.** If either participant has blocked the other, direct sends fail with `403`.
6. **Temporary rooms expire server-side.** `expiresAt` is checked on every membership resolution, not only in the UI.
7. **Attachments are re-authorized on every byte request.** The streaming route looks up the attachment, its message, the message's conversation, and the viewer's membership. Unattached uploads are visible only to the uploader. Deleted messages hide their attachments.
8. **AI is bound to the requesting user.** Membership is checked before messages are fetched for a prompt. Evidence IDs are validated against the retrieved set before being returned.
9. **Account deletion transfers group ownership.** A surviving admin (or earliest member) becomes owner; direct threads are removed for both participants; groups with no remaining members are cleaned up.
10. **The AI bot is not a normal account.** It has `isBot: true`, a random unusable password, and is excluded from login, user search, contacts, group creation, group membership changes, and side-thread branching. Its DM is created only by `POST /api/ai/conversation`, its reserved username and email cannot be registered or claimed through a profile update by a person, and the server verifies the exact private `directKey` before every reply. A pre-existing human account that squats the reserved identity fails closed rather than being treated as the bot.
11. **AI replies are idempotent per source message.** `Message.aiSourceMessageId` is unique; concurrent generation or retries cannot create duplicate assistant answers, and a failed turn stores no assistant message.
12. **Application invites are owner-scoped.** Create, list, and revoke require the authenticated owner. Redemption validates status inside a transaction, creates a unique `(inviteId, userId)` redemption, and conditionally increments `usedCount` so concurrency cannot exceed `maxUses`. A user cannot redeem their own invite or redeem the same invite twice.
13. **Public invite previews expose only safe fields.** Inviter display name, note, remaining uses, and expiry. No email, username, conversation, or member data is returned.

## CSRF and origin checks

- Cookies are `SameSite=Lax`, which blocks most cross-site state-changing requests.
- In addition, every non-GET API call checks the `Origin` header when present. Allowed origins are `APP_URL`, the request's own origin, and the forwarded host/proto. A foreign origin returns `403 CSRF_REJECTED`.
- Requests without an `Origin` header (CLI, server-to-server) are allowed only if they already possess a valid session cookie. This is intentional for API clients; do not expose the API to untrusted networks without an additional gateway if that model is unsuitable.
- Socket.IO checks the handshake `Origin` against `APP_URL` and rejects sockets without a valid session cookie.

## Input validation and output handling

- Every JSON body is parsed with a Zod schema (`src/lib/schemas.ts`). Unknown fields are ignored; sizes and enums are bounded.
- IDs are opaque CUIDs. Queries always combine the resource ID with membership/ownership conditions rather than trusting path parameters.
- React escapes text by default. Message bodies and AI output are rendered as text, never `dangerouslySetInnerHTML`. Linkification, where present, only creates anchor elements from parsed URLs.
- SQL is parameterized through Prisma or `Prisma.sql` tagged templates. The search fallback escapes `%` and `_` for `ILIKE`.
- AI JSON is parsed into Zod schemas; malformed output becomes a typed provider error rather than being rendered blindly.

## Upload security

- MIME allowlist and extension allowlist must agree.
- Magic-byte checks: JPEG, PNG, GIF, WebP, PDF, MP4/MOV, WebM, Ogg, MP3, WAV, ZIP. Text formats are accepted as text.
- Maximum size `MAX_UPLOAD_MB` (default 25 MB), checked before and after buffering.
- Original filenames sanitized; storage keys are random and namespaced by uploader ID.
- Local files live under `storage/uploads`, outside the web root. S3 objects are private; the app streams them. No presigned public URLs are issued.
- Attachment responses use `Content-Disposition` based on type, `X-Content-Type-Options: nosniff`, and authorization before streaming.
- SVG is intentionally **not** allowed (active content risk).
- Uploaded files are not malware-scanned. Add a scanning pipeline before accepting untrusted public uploads at scale.

## AI threat model

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Prompt injection inside a message | Messages JSON-encoded and labeled untrusted; system prompt forbids following message instructions; no tools are exposed | A model may still be influenced; the assistant can produce only text in its own thread, and grounded output is advisory |
| Data exfiltration via model output | Prompt forbids revealing system prompts/secrets; app never places secrets in prompts | Provider sees the prompt content; choose a trusted provider |
| Hallucinated answers | Evidence IDs restricted to retrieved messages; schema requires evidence; `insufficientInformation` surfaced | Small models may still summarize poorly; evidence lets users verify |
| Cross-conversation leakage | Grounded retrieval is membership-scoped and authorized before fetching. The assistant thread loads only messages from its own conversation and has no retrieval tools. | Bugs in new retrieval code must repeat the membership check |
| Memory poisoning | Memories are user-authored, opt-in, editable, and only sent to that user's requests | A user can still save misleading notes for themselves |
| Cost/abuse | Per-user AI rate limits, 24-message context, 6,000-character message cap, 1,200 output tokens, and provider timeouts | No global token budget in this reference build; add one for public deployments |
| Model action | **Grounded AI:** none; compose output requires human send, extraction returns proposals. **Assistant:** the model can produce only one reply in its own thread; it cannot message other people, edit data, invite users, or change settings. | A compromised provider could return malicious text, which is rendered as escaped text, not HTML |
| AI reply duplication or replay | Unique `aiSourceMessageId`, source-message ownership/membership checks, per-conversation queue, and idempotent P2002 handling | Process-local queue is lost on restart; a retry route exists for the latest unanswered turn |
| Cross-user assistant access | AI conversation is keyed by `directKey` for the requesting user + bot; group/branch membership is rejected; responses are emitted only to that user's room | A stolen session can use the assistant as that user |
| Assistant identity squatting | `nexa_ai` and `nexa-ai@nexa.demo` are reserved at registration and rejected on profile updates; bot creation refuses an existing human account with either value | An operator importing a conflicting account must rename it before enabling AI |

When `AI_PROVIDER=none`, AI routes fail closed with `503` and the missing variable list. There are no canned answers.

## Application invite threat model

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Token guessing | 18 random bytes (144 bits) encoded as base64url; unique column | A leaked link is a bearer credential until expired, revoked, or exhausted |
| Link sharing beyond intent | `maxUses` 1–50, expiry 1–30 days, revoke action, visible redemption count | The inviter cannot restrict by email domain in this build |
| Over-redemption under concurrency | Status re-checked inside a transaction; unique redemption row; conditional `usedCount` increment; loser receives `busy`/`exhausted` | Database isolation depends on PostgreSQL defaults; keep the transaction intact |
| Invite data leak | Public preview returns only inviter name, note, remaining uses, and expiry; never email, username, members, or conversation content | The note is inviter-authored and public to anyone with the link |
| Self-redemption or replay | Service rejects the inviter and duplicate `(inviteId, userId)` redemption; a failed redemption returns `accepted: false` with a safe reason and does not expose private data | A user with two accounts can redeem twice if uses remain |
| Invite enumeration | Tokens are unguessable and preview is rate-limited per IP | Rate limiting is per process; add edge protection for public deployments |
| Forged invite state in the browser | Token is submitted to the server; server re-validates and remains authoritative | The UI may show a warning based on a stale preview; the redemption result wins |
| Notification spam to inviter | One notification per successful redemption; redemption requires a valid token and a new account created through the registration route | Many invites can still generate many notifications; rate limits cap creation |

Invite redemption creates a real connection: mutual contacts, a canonical direct conversation, a system welcome message, and an inviter notification. Operators should treat invite links with the same care as password-reset links.

## Data lifecycle

- **Edits** set `editedAt` and replace the body. Previous versions are not retained.
- **Deletes** are soft: `deletedAt` is set, body cleared, attachments/pins/embeddings removed. The tombstone preserves reply integrity and audit context.
- **Account export** returns the user's profile, settings, messages, memberships, bookmarks, memories, summaries, workspace items, notifications, and attachment metadata as JSON.
- **Account deletion** requires password + typed `DELETE`; revokes sessions by cascade, removes authored rows, deletes uploads from storage, removes direct threads, transfers group ownership, and cleans empty groups. Database backups may retain data until rotated.
- **Temporary rooms** remain in the database after expiry but are inaccessible to members; an operator can purge them with a scheduled job (not included).
- **Application invites** remain as rows after expiry, revocation, or exhaustion so the owner can audit them. Revoke any link that should not remain usable. Redemption rows are retained with the invite and are removed if the invite or user is deleted. Invite links are bearer credentials; treat them like password-reset links.
- **AI assistant conversations** are ordinary direct conversations. Deleting the account removes the user's membership and authored messages; the bot account remains for other users. Disabling AI does not delete existing assistant history.

## Logging and monitoring

- API errors are logged server-side as `[nexa:api]`; AI and search failures have dedicated prefixes.
- Request bodies, passwords, session tokens, and API keys are never logged by the application.
- Reverse proxies should log status, latency, and request IDs — not cookies or message bodies.
- Recommended alerts: spike in 401/403/429, repeated `AI_PROVIDER_ERROR`, database connection failures, disk usage for uploads, and failed migrations.

## Deployment checklist

- [ ] Serve exclusively over HTTPS; keep `NODE_ENV=production`.
- [ ] Set `APP_URL` to the exact public origin (no trailing slash mismatch). On Render it is read from `RENDER_EXTERNAL_URL` automatically. Invite links are derived from this value.
- [ ] Set `SEED_DEMO=false` on a real deployment, or delete the demo accounts before inviting real users.
- [ ] Use a strong, unique database password and least-privilege DB user.
- [ ] Store secrets in a secret manager, not the image or repository.
- [ ] Restrict PostgreSQL and S3 access to the app network.
- [ ] Enable encryption at rest and automated backups; test restore.
- [ ] Put the upload directory on a persistent volume or use S3.
- [ ] Set `MAX_UPLOAD_MB` to a value your proxy also enforces.
- [ ] Add a shared rate-limit store and Socket.IO adapter before scaling horizontally.
- [ ] Add malware scanning if uploads are open to the public.
- [ ] Review the AI provider's retention/training terms before enabling hosted AI.
- [ ] Treat application invite links as bearer credentials; expire or revoke links that are no longer needed.
- [ ] Rotate `GEMINI_API_KEY` / `OPENAI_API_KEY` / `STT_API_KEY` and database credentials on a schedule.

## Residual risks

- Plaintext message storage and server-side AI access.
- Application invite links are bearer tokens; anyone with a valid link can create an account until the link expires, is revoked, or reaches its use limit.
- In-memory rate limiting and presence per process; the AI turn queue is process-local.
- No email verification, password-reset email, MFA, or OAuth in this build.
- No malware scanning or image re-encoding.
- No formal security certification, penetration test, or compliance mapping.
- A compromised app host or database defeats all application-level controls.

Report security issues privately to the operator of your deployment. Do not include real user data in reports.
