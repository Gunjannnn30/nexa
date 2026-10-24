import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(24, "Username must be at most 24 characters.")
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only.")
  .transform((v) => v.toLowerCase());

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Za-z]/, "Password must include a letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(60),
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  // Optional app-sharing invite. An invalid or expired token never blocks
  // account creation; the API returns a warning instead.
  inviteToken: z.string().trim().min(8).max(128).optional(),
});

export const createAppInviteSchema = z.object({
  note: z.string().trim().max(280).optional(),
  maxUses: z.number().int().min(1).max(50).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    username: usernameSchema.optional(),
    bio: z.string().trim().max(240).optional().nullable(),
    statusText: z.string().trim().max(80).optional().nullable(),
    avatarUrl: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const updateSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.string().min(2).max(10).optional(),
  readReceipts: z.boolean().optional(),
  lastSeenVisible: z.boolean().optional(),
  discoverable: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  messagePreview: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  aiMemoryEnabled: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1),
  confirmation: z.literal("DELETE"),
});

export const createConversationSchema = z.object({
  kind: z.enum(["direct", "group", "room"]),
  title: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  memberIds: z.array(z.string().min(1)).max(49).default([]),
  expiresInHours: z.number().int().min(1).max(24 * 90).optional(),
  firstMessage: z.string().trim().max(4000).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  avatarUrl: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isTemporary: z.boolean().optional(),
});

const clientIdSchema = z.string().min(6).max(80);

export const contextCardSchema = z.object({
  type: z.enum(["TASK", "DATE", "DECISION", "FILE", "LINK"]),
  title: z.string().trim().min(1).max(200),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const pollInputSchema = z.object({
  question: z.string().trim().min(3).max(300),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
  allowsMultiple: z.boolean().default(false),
  closesInHours: z.number().int().min(1).max(24 * 30).optional(),
});

export const sendMessageSchema = z
  .object({
    body: z.string().max(8000).default(""),
    clientId: clientIdSchema,
    replyToId: z.string().optional().nullable(),
    attachmentIds: z.array(z.string()).max(10).default([]),
    poll: pollInputSchema.optional(),
    contextCards: z.array(contextCardSchema).max(5).default([]),
    forwardedFromId: z.string().optional().nullable(),
  })
  .refine(
    (v) => v.body.trim().length > 0 || v.attachmentIds.length > 0 || v.poll,
    "Write a message, attach a file, or create a poll.",
  );

export const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const createGroupInviteSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
});

export const createReportSchema = z.object({
  reportedId: z.string().min(1),
  reason: z.enum(["spam", "harassment", "hate", "impersonation", "scam", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const addContactSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  nickname: z.string().trim().max(60).optional(),
});

export const createPollVoteSchema = z.object({
  optionIds: z.array(z.string().min(1)).min(1).max(10),
});

export const createWorkspaceItemSchema = z.object({
  type: z.enum(["TASK", "CHECKLIST", "NOTE", "PLAN", "DECISION"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(8000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  checklist: z.array(z.object({ text: z.string().trim().min(1).max(200), done: z.boolean() })).optional(),
  sourceMessageId: z.string().optional().nullable(),
});

export const updateWorkspaceItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().max(8000).optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  checklist: z.array(z.object({ text: z.string().trim().min(1).max(200), done: z.boolean() })).optional(),
});

export const extractWorkspaceSchema = z.object({
  messageIds: z.array(z.string()).min(1).max(30),
  type: z.enum(["TASK", "CHECKLIST", "NOTE", "PLAN", "DECISION"]),
  useAI: z.boolean().default(true),
});

export const createBranchSchema = z.object({
  messageId: z.string().min(1),
  title: z.string().trim().min(2).max(80).optional(),
  memberIds: z.array(z.string()).max(49).default([]),
});

export const createMemorySchema = z.object({
  content: z.string().trim().min(2).max(1000),
  conversationId: z.string().optional().nullable(),
  sourceMessageId: z.string().optional().nullable(),
  source: z.enum(["USER", "AI"]).default("USER"),
});

export const updateMemorySchema = z.object({
  content: z.string().trim().min(2).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1, "Enter a search query.").max(300),
  conversationId: z.string().optional(),
  semantic: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(20),
});

export const aiComposeSchema = z.object({
  action: z.enum(["draft", "rewrite", "translate", "grammar", "tone", "explain", "announcement", "invitation"]),
  text: z.string().trim().max(6000).default(""),
  conversationId: z.string().optional(),
  messageIds: z.array(z.string()).max(30).default([]),
  instruction: z.string().trim().max(1000).optional(),
  tone: z.enum(["professional", "friendly", "concise", "warm", "direct"]).optional(),
  targetLanguage: z.string().trim().max(40).optional(),
});

export const aiSummarySchema = z.object({
  conversationId: z.string().min(1),
  kind: z.enum(["UNREAD", "RANGE", "GROUP", "ROOM"]).default("UNREAD"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const aiAskSchema = z.object({
  conversationId: z.string().min(1),
  question: z.string().trim().min(2).max(1000),
});

export const aiDigestSchema = z.object({
  markAsRead: z.boolean().default(false),
});

export const transcribeSchema = z.object({
  attachmentId: z.string().min(1),
  translateTo: z.string().trim().max(40).optional(),
});

export const notificationReadSchema = z.object({
  ids: z.array(z.string()).max(100).optional(),
  all: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
