export type PublicUser = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  statusText: string | null;
  initials: string;
  isSelf?: boolean;
};

export type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
};

export type Poll = {
  id: string;
  messageId?: string;
  question: string;
  allowsMultiple: boolean;
  closesAt: string | null;
  options: { id: string; label: string; votes: number; mine: boolean }[];
  totalVotes: number;
  closed: boolean;
};

export type ContextCard = {
  id: string;
  type: "TASK" | "DATE" | "DECISION" | "FILE" | "LINK" | string;
  title: string;
  data: unknown;
};

export type Message = {
  id: string;
  clientId: string | null;
  conversationId: string;
  sender: PublicUser;
  body: string;
  type: "TEXT" | "SYSTEM" | "POLL";
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: {
    id: string;
    body: string;
    deletedAt: string | null;
    sender: { id: string; name: string; username: string };
  } | null;
  forwardedFrom: { id: string; senderName: string } | null;
  attachments: Attachment[];
  reactions: ReactionGroup[];
  receipts: {
    deliveredCount: number;
    readCount: number;
    recipientCount: number;
    status: "SENT" | "DELIVERED" | "READ";
  };
  poll: Poll | null;
  contextCards: ContextCard[];
  mentions: { id: string; username: string; name: string }[];
  isStarred: boolean;
  isPinned: boolean;
};

export type ConversationMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: PublicUser;
};

export type Conversation = {
  id: string;
  type: "DIRECT" | "GROUP" | "ROOM" | "BRANCH";
  title: string;
  description: string | null;
  avatarUrl: string | null;
  createdById: string | null;
  createdAt: string;
  lastMessageAt: string;
  isTemporary: boolean;
  expiresAt: string | null;
  members: ConversationMember[];
  peer: PublicUser | null;
  lastMessage: {
    id: string;
    body: string;
    type: string;
    senderId: string;
    senderName: string;
    createdAt: string;
    deletedAt: string | null;
    hasAttachments: boolean;
  } | null;
  unreadCount: number;
  isArchived: boolean;
  isFavorite: boolean;
  mutedUntil: string | null;
  notificationLevel: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastReadAt: string | null;
  workspaceId: string | null;
  pinnedCount: number;
  branch: {
    id: string;
    sourceConversationId: string;
    sourceConversationTitle: string | null;
    messageId: string;
  } | null;
};

export type UserSettings = {
  theme: string;
  language: string;
  readReceipts: boolean;
  lastSeenVisible: boolean;
  discoverable: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  messagePreview: boolean;
  digestEnabled: boolean;
  digestHour: number;
  aiMemoryEnabled: boolean;
};

export type Profile = PublicUser & {
  email: string;
  createdAt: string;
  settings: UserSettings;
};

export type SearchUnderstanding = {
  keywords: string;
  attachmentKind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | null;
  from: string | null;
  to: string | null;
  explanation: string;
};

export type SearchResult = {
  message: Message;
  conversation: Conversation;
  score: number;
  matchKind: "text" | "attachment" | "semantic";
};

export type SearchResponse = {
  results: SearchResult[];
  mode: "lexical" | "semantic";
  interpreted?: SearchUnderstanding | null;
  answer?: string | null;
  evidence?: { messageId: string; excerpt: string; senderName: string; createdAt: string }[];
  notice?: string | null;
  insufficientInformation?: boolean;
};

export type AiStatus = {
  provider: string;
  model: string;
  configured: boolean;
  missing: string[];
  embeddings: { provider: string; model: string; configured: boolean; missing: string[] };
  speechToText: { configured: boolean; model: string | null; missing: string[] };
  timeoutMs: number;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  isRead: boolean;
  createdAt: string;
  actor: { id: string; name: string; username: string; avatarUrl: string | null } | null;
  metadata: unknown;
};

export type Invite = {
  id: string;
  token: string;
  conversation: { id: string; title: string | null; description: string | null; type: string };
  inviter: PublicUser;
  expiresAt: string;
  createdAt: string;
};

export type WorkspaceItem = {
  id: string;
  type: "TASK" | "CHECKLIST" | "NOTE" | "PLAN" | "DECISION";
  title: string;
  content: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  dueAt: string | null;
  assignee: PublicUser | null;
  checklist: { text: string; done: boolean }[];
  sourceMessageId: string | null;
  sourceExcerpt: string | null;
  createdBy: PublicUser | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  items: WorkspaceItem[];
};

export type TimelineEvent = {
  id: string;
  kind: "decision" | "task" | "deadline" | "file" | "pin" | "summary" | "branch";
  title: string;
  detail?: string | null;
  at: string;
  messageId?: string | null;
  meta?: Record<string, unknown>;
};

export type Branch = {
  id: string;
  title: string;
  createdAt: string;
  conversationId: string;
  lastMessageAt: string;
  message: { id: string; body: string };
  creator: { id: string; name: string; username: string; avatarUrl: string | null };
};

export type Memory = {
  id: string;
  content: string;
  source: "USER" | "AI";
  isActive: boolean;
  conversationId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SummaryResult = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  decisions: { text: string; messageIds: string[] }[];
  actionItems: { text: string; owner?: string | null; due?: string | null; messageIds: string[] }[];
  unresolvedQuestions: { text: string; messageIds: string[] }[];
  evidence: {
    messageId: string;
    excerpt: string;
    note: string;
    senderName: string;
    createdAt: string;
  }[];
  provider: string;
  model: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  createdAt: string;
};

export type AskResult = {
  answer: string;
  evidence: {
    messageId: string;
    excerpt: string;
    senderName: string;
    senderUsername?: string;
    createdAt: string;
  }[];
  insufficientInformation: boolean;
  confidence: "high" | "medium" | "low";
  messagesUsed: number;
  provider?: string;
  model?: string;
};

export type DigestResult = {
  id: string;
  headline: string;
  summary: string;
  highlights: { text: string; messageIds: string[] }[];
  mentions: { text: string; messageIds: string[] }[];
  commitments: { text: string; due?: string | null; messageIds: string[] }[];
  evidence: { messageId: string; excerpt: string; senderName: string; createdAt: string }[];
  notificationId: string;
  createdAt: string;
};

export type Presence = {
  userId: string;
  online: boolean;
  hidden: boolean;
  lastSeenAt: string | null;
};
