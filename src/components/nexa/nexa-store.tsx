"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";
import { getSocket } from "@/lib/client/socket";
import type {
  AiStatus,
  Conversation,
  Invite,
  Memory,
  Message,
  Notification,
  Presence,
  Profile,
  ReactionGroup,
  UserSettings,
} from "@/lib/client/types";

type MessagePage = {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
  focusId?: string;
};

type ConversationInput = {
  kind: "direct" | "group" | "room";
  title?: string;
  description?: string;
  memberIds?: string[];
  expiresInHours?: number;
  firstMessage?: string;
};

type SendInput = {
  body: string;
  replyToId?: string | null;
  attachmentIds?: string[];
  poll?: {
    question: string;
    options: string[];
    allowsMultiple?: boolean;
    closesInHours?: number;
  };
  contextCards?: { type: "TASK" | "DATE" | "DECISION" | "FILE" | "LINK"; title: string; data?: Record<string, unknown> }[];
};

type TypingState = Record<string, Record<string, { name: string; expiresAt: number }>>;

const groupReactions = (
  raw: { emoji: string; userId: string }[],
  viewerId: string,
): ReactionGroup[] => {
  const map = new Map<string, { count: number; userIds: string[] }>();
  for (const reaction of raw) {
    const entry = map.get(reaction.emoji) ?? { count: 0, userIds: [] };
    entry.count += 1;
    entry.userIds.push(reaction.userId);
    map.set(reaction.emoji, entry);
  }
  return [...map.entries()]
    .map(([emoji, value]) => ({
      emoji,
      count: value.count,
      userIds: value.userIds,
      mine: value.userIds.includes(viewerId),
    }))
    .sort((a, b) => b.count - a.count);
};

function playPing() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    setTimeout(() => void context.close(), 350);
  } catch {
    /* audio is a progressive enhancement */
  }
}

type NexaStore = ReturnType<typeof useNexaStoreInternal>;
const NexaContext = React.createContext<NexaStore | null>(null);

export function useNexa() {
  const value = React.useContext(NexaContext);
  if (!value) throw new Error("useNexa must be used inside NexaProvider");
  return value;
}

export function NexaProvider({
  initialProfile,
  initialConversationId,
  initialFocusId,
  children,
}: {
  initialProfile: Profile;
  initialConversationId?: string;
  initialFocusId?: string;
  children: React.ReactNode;
}) {
  const value = useNexaStoreInternal(initialProfile, initialConversationId, initialFocusId);
  return <NexaContext.Provider value={value}>{children}</NexaContext.Provider>;
}

function useNexaStoreInternal(
  initialProfile: Profile,
  initialConversationId?: string,
  initialFocusId?: string,
) {
  const router = useRouter();
  const pathname = usePathname();
  const activeIdRef = React.useRef<string | undefined>(initialConversationId);
  const profileRef = React.useRef(initialProfile);
  const messagesRef = React.useRef<Record<string, Message[]>>({});
  const loadedRef = React.useRef<Set<string>>(new Set());
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [profile, setProfile] = React.useState(initialProfile);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = React.useState<Record<string, Message[]>>({});
  const [cursors, setCursors] = React.useState<Record<string, { nextCursor: string | null; hasMore: boolean }>>({});
  const [activeId, setActiveId] = React.useState<string | undefined>(initialConversationId);
  const [focusId, setFocusId] = React.useState<string | null>(initialFocusId ?? null);
  const [loadingConversations, setLoadingConversations] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [presence, setPresence] = React.useState<Record<string, Presence>>({});
  const [typing, setTyping] = React.useState<TypingState>({});
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [notificationsCursor, setNotificationsCursor] = React.useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [ai, setAi] = React.useState<AiStatus | null>(null);
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [draft, setDraft] = React.useState("");
  const [workspaceVersion, setWorkspaceVersion] = React.useState(0);
  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [memoryEnabled, setMemoryEnabled] = React.useState(false);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const activeMessages = activeId ? messagesByConversation[activeId] ?? [] : [];
  const activeTyping = activeId
    ? Object.values(typing[activeId] ?? {}).filter((entry) => entry.expiresAt > Date.now())
    : [];

  React.useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  React.useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  React.useEffect(() => {
    messagesRef.current = messagesByConversation;
  }, [messagesByConversation]);

  const refreshConversations = React.useCallback(async () => {
    try {
      const data = await apiGet<{ conversations: Conversation[] }>("/api/conversations");
      setConversations(data.conversations);
    } catch (error) {
      if ((error as { status?: number }).status === 401) {
        window.location.href = "/login";
        return;
      }
      toast.error(errorMessage(error));
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void refreshConversations();
    }, 260);
  }, [refreshConversations]);

  const refreshMe = React.useCallback(async () => {
    try {
      const data = await apiGet<{
        user: Profile;
        unreadNotifications: number;
        invites: Invite[];
      }>("/api/auth/me");
      setProfile(data.user);
      setUnreadNotifications(data.unreadNotifications);
      setInvites(data.invites);
    } catch (error) {
      if ((error as { status?: number }).status === 401) window.location.href = "/login";
    }
  }, []);

  const refreshNotifications = React.useCallback(async () => {
    try {
      const data = await apiGet<{ notifications: Notification[]; nextCursor: string | null }>(
        "/api/notifications",
      );
      setNotifications(data.notifications);
      setNotificationsCursor(data.nextCursor);
      setUnreadNotifications(data.notifications.filter((item) => !item.isRead).length);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  const loadAi = React.useCallback(async () => {
    try {
      const data = await apiGet<{ ai: AiStatus }>("/api/ai/status");
      setAi(data.ai);
    } catch {
      /* AI status is optional */
    }
  }, []);

  const appendMessage = React.useCallback((message: Message, replacePending = false) => {
    setMessagesByConversation((prev) => {
      const list = prev[message.conversationId];
      if (!list) return prev;
      const index = list.findIndex(
        (item) =>
          item.id === message.id ||
          (message.clientId && item.clientId === message.clientId) ||
          (replacePending && item.id.startsWith("pending-")),
      );
      if (index >= 0) {
        const next = [...list];
        next[index] = message;
        return { ...prev, [message.conversationId]: next };
      }
      return { ...prev, [message.conversationId]: [...list, message] };
    });
  }, []);

  const markRead = React.useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );
    const socket = getSocket();
    if (socket.connected) socket.emit("read", { conversationId });
    apiPost(`/api/conversations/${conversationId}/read`).catch(() => {});
  }, []);

  const silentRefresh = React.useCallback(async (conversationId: string) => {
    try {
      const data = await apiGet<MessagePage>(
        `/api/conversations/${conversationId}/messages?limit=60`,
      );
      setMessagesByConversation((prev) => ({ ...prev, [conversationId]: data.messages }));
      setCursors((prev) => ({
        ...prev,
        [conversationId]: { nextCursor: data.nextCursor, hasMore: data.hasMore },
      }));
    } catch {
      /* silent refresh is best effort */
    }
  }, []);

  const scheduleReceiptRefresh = React.useCallback(
    (conversationId: string) => {
      if (receiptTimer.current) clearTimeout(receiptTimer.current);
      receiptTimer.current = setTimeout(() => {
        void silentRefresh(conversationId);
      }, 700);
    },
    [silentRefresh],
  );

  const loadMessages = React.useCallback(
    async (conversationId: string, options: { focus?: string | null; silent?: boolean } = {}) => {
      if (!options.silent) setLoadingMessages(true);
      try {
        const query = options.focus
          ? `?focus=${encodeURIComponent(options.focus)}`
          : "?limit=50";
        const data = await apiGet<MessagePage>(
          `/api/conversations/${conversationId}/messages${query}`,
        );
        loadedRef.current.add(conversationId);
        setMessagesByConversation((prev) => ({ ...prev, [conversationId]: data.messages }));
        setCursors((prev) => ({
          ...prev,
          [conversationId]: {
            nextCursor: data.nextCursor,
            hasMore: data.hasMore,
          },
        }));
        if (options.focus) setFocusId(options.focus);
        markRead(conversationId);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        if (!options.silent) setLoadingMessages(false);
      }
    },
    [markRead],
  );

  const openConversation = React.useCallback(
    (conversationId: string, focus?: string | null) => {
      const changing = activeIdRef.current !== conversationId;
      activeIdRef.current = conversationId;
      setActiveId(conversationId);
      setReplyTo(null);
      setDraft("");
      setFocusId(focus ?? null);
      router.push(`/app/${conversationId}${focus ? `?focus=${encodeURIComponent(focus)}` : ""}`);
      if (focus) {
        void loadMessages(conversationId, { focus });
      } else if (changing || !loadedRef.current.has(conversationId)) {
        void loadMessages(conversationId);
      } else {
        markRead(conversationId);
      }
    },
    [loadMessages, markRead, router],
  );

  const closeConversation = React.useCallback(() => {
    activeIdRef.current = undefined;
    setActiveId(undefined);
    setReplyTo(null);
    setFocusId(null);
    router.push("/app");
  }, [router]);

  const loadOlder = React.useCallback(async () => {
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    const cursor = cursors[conversationId]?.nextCursor;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await apiGet<MessagePage>(
        `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursor)}&limit=50`,
      );
      setMessagesByConversation((prev) => {
        const existing = prev[conversationId] ?? [];
        const seen = new Set(existing.map((message) => message.id));
        return {
          ...prev,
          [conversationId]: [
            ...data.messages.filter((message) => !seen.has(message.id)),
            ...existing,
          ],
        };
      });
      setCursors((prev) => ({
        ...prev,
        [conversationId]: { nextCursor: data.nextCursor, hasMore: data.hasMore },
      }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  }, [cursors, loadingOlder]);

  const sendMessage = React.useCallback(
    async (input: SendInput) => {
      const conversationId = activeIdRef.current;
      if (!conversationId) return;
      setSending(true);
      try {
        const payload = {
          body: input.body,
          clientId: `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          replyToId: input.replyToId ?? null,
          attachmentIds: input.attachmentIds ?? [],
          contextCards: input.contextCards ?? [],
          ...(input.poll ? { poll: input.poll } : {}),
        };
        const data = await apiPost<{ message: Message }>(
          `/api/conversations/${conversationId}/messages`,
          payload,
        );
        appendMessage(data.message);
        setReplyTo(null);
        scheduleRefresh();
        markRead(conversationId);
        return data.message;
      } catch (error) {
        toast.error(errorMessage(error));
        throw error;
      } finally {
        setSending(false);
      }
    },
    [appendMessage, markRead, scheduleRefresh],
  );

  const editMessage = React.useCallback(async (messageId: string, body: string) => {
    const data = await apiPatch<{ message: Message }>(`/api/messages/${messageId}`, { body });
    appendMessage(data.message);
    return data.message;
  }, [appendMessage]);

  const deleteMessage = React.useCallback(
    async (messageId: string) => {
      const conversationId = activeIdRef.current;
      await apiDelete(`/api/messages/${messageId}`);
      if (conversationId) {
        setMessagesByConversation((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((message) =>
            message.id === messageId
              ? { ...message, deletedAt: new Date().toISOString(), body: "", attachments: [], reactions: [] }
              : message,
          ),
        }));
      }
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const toggleReaction = React.useCallback(async (messageId: string, emoji: string) => {
    const data = await apiPost<{ reactions: ReactionGroup[] }>(
      `/api/messages/${messageId}/reaction`,
      { emoji },
    );
    setMessagesByConversation((prev) => {
      const next = { ...prev };
      for (const [conversationId, list] of Object.entries(next)) {
        if (list.some((message) => message.id === messageId)) {
          next[conversationId] = list.map((message) =>
            message.id === messageId ? { ...message, reactions: data.reactions } : message,
          );
        }
      }
      return next;
    });
  }, []);

  const toggleStar = React.useCallback(async (messageId: string) => {
    const data = await apiPost<{ starred: boolean }>(`/api/messages/${messageId}/bookmark`);
    setMessagesByConversation((prev) => {
      const next = { ...prev };
      for (const [conversationId, list] of Object.entries(next)) {
        if (list.some((message) => message.id === messageId)) {
          next[conversationId] = list.map((message) =>
            message.id === messageId ? { ...message, isStarred: data.starred } : message,
          );
        }
      }
      return next;
    });
    toast.success(data.starred ? "Saved to your starred messages." : "Removed from starred.");
  }, []);

  const togglePin = React.useCallback(
    async (messageId: string) => {
      const data = await apiPost<{ pinned: boolean }>(`/api/messages/${messageId}/pin`);
      const conversationId = activeIdRef.current;
      setMessagesByConversation((prev) => {
        if (!conversationId) return prev;
        return {
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((message) =>
            message.id === messageId ? { ...message, isPinned: data.pinned } : message,
          ),
        };
      });
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                pinnedCount: Math.max(0, conversation.pinnedCount + (data.pinned ? 1 : -1)),
              }
            : conversation,
        ),
      );
      toast.success(data.pinned ? "Pinned to this conversation." : "Unpinned.");
    },
    [],
  );

  const votePoll = React.useCallback(async (messageId: string, optionIds: string[]) => {
    const data = await apiPost<{ poll: Message["poll"] }>(`/api/messages/${messageId}/vote`, {
      optionIds,
    });
    setMessagesByConversation((prev) => {
      const next = { ...prev };
      for (const [conversationId, list] of Object.entries(next)) {
        if (list.some((message) => message.id === messageId)) {
          next[conversationId] = list.map((message) =>
            message.id === messageId ? { ...message, poll: data.poll } : message,
          );
        }
      }
      return next;
    });
  }, []);

  const forwardMessage = React.useCallback(
    async (messageId: string, conversationIds: string[]) => {
      await apiPost(`/api/messages/${messageId}/forward`, { conversationIds });
      toast.success(
        conversationIds.length === 1 ? "Message forwarded." : `Forwarded to ${conversationIds.length} conversations.`,
      );
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const createBranch = React.useCallback(
    async (messageId: string, title?: string) => {
      const conversationId = activeIdRef.current;
      if (!conversationId) return;
      const data = await apiPost<{
        branchId: string | null;
        conversation: Conversation;
        existed: boolean;
      }>(`/api/conversations/${conversationId}/branches`, {
        messageId,
        ...(title ? { title } : {}),
        memberIds: [],
      });
      await refreshConversations();
      openConversation(data.conversation.id);
      toast.success(data.existed ? "Opening your existing side thread." : "Side thread started.");
      return data.conversation;
    },
    [openConversation, refreshConversations],
  );

  const createConversation = React.useCallback(
    async (input: ConversationInput) => {
      const data = await apiPost<{ conversation: Conversation }>("/api/conversations", {
        ...input,
        memberIds: input.memberIds ?? [],
      });
      await refreshConversations();
      openConversation(data.conversation.id);
      return data.conversation;
    },
    [openConversation, refreshConversations],
  );

  const conversationAction = React.useCallback(
    async (conversationId: string, action: string, body?: unknown) => {
      try {
        const data = await apiPost<unknown>(`/api/conversations/${conversationId}/${action}`, body);
        if (action === "archive") {
          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === conversationId
                ? { ...conversation, isArchived: Boolean((body as { value?: boolean })?.value) }
                : conversation,
            ),
          );
        }
        if (action === "favorite") {
          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === conversationId
                ? { ...conversation, isFavorite: Boolean((body as { value?: boolean })?.value) }
                : conversation,
            ),
          );
        }
        if (action === "mute") {
          const mutedUntil = (data as { mutedUntil?: string | null }).mutedUntil ?? null;
          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === conversationId ? { ...conversation, mutedUntil } : conversation,
            ),
          );
        }
        if (["members", "remove-member", "role"].includes(action)) {
          const fresh = await apiGet<{ conversation: Conversation }>(
            `/api/conversations/${conversationId}`,
          );
          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === conversationId ? fresh.conversation : conversation,
            ),
          );
        }
        return data;
      } catch (error) {
        toast.error(errorMessage(error));
        throw error;
      }
    },
    [],
  );

  const leaveConversation = React.useCallback(
    async (conversationId: string) => {
      await conversationAction(conversationId, "leave");
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
      if (activeIdRef.current === conversationId) closeConversation();
      toast.success("You left the conversation.");
    },
    [closeConversation, conversationAction],
  );

  const archiveConversation = React.useCallback(
    async (conversationId: string, archived: boolean) => {
      await conversationAction(conversationId, "archive", { value: archived });
      toast.success(archived ? "Conversation archived." : "Conversation restored.");
    },
    [conversationAction],
  );

  const favoriteConversation = React.useCallback(
    async (conversationId: string, favorite: boolean) => {
      await conversationAction(conversationId, "favorite", { value: favorite });
    },
    [conversationAction],
  );

  const sendTyping = React.useCallback((isTyping: boolean) => {
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    const socket = getSocket();
    if (socket.connected) socket.emit("typing", { conversationId, isTyping });
  }, []);

  const markNotificationsRead = React.useCallback(async (all = true, ids?: string[]) => {
    await apiPost("/api/notifications", all ? { all: true } : { ids, all: false });
    setNotifications((prev) =>
      prev.map((notification) =>
        all || ids?.includes(notification.id) ? { ...notification, isRead: true } : notification,
      ),
    );
    setUnreadNotifications(0);
  }, []);

  const handleInvite = React.useCallback(
    async (invite: Invite, action: "accept" | "decline") => {
      await apiPost("/api/invites", {
        action,
        ...(action === "accept" ? { token: invite.token } : { inviteId: invite.id }),
      });
      setInvites((prev) => prev.filter((item) => item.id !== invite.id));
      if (action === "accept") {
        await refreshConversations();
        toast.success(`Joined ${invite.conversation.title ?? "the conversation"}.`);
      } else {
        toast.success("Invitation declined.");
      }
      void refreshMe();
    },
    [refreshConversations, refreshMe],
  );

  const loadMemories = React.useCallback(async () => {
    try {
      const data = await apiGet<{ enabled: boolean; memories: Memory[] }>("/api/memories");
      setMemories(data.memories);
      setMemoryEnabled(data.enabled);
    } catch {
      /* memory is optional */
    }
  }, []);

  const updateSettings = React.useCallback(async (patch: Partial<UserSettings>) => {
    const data = await apiPatch<{ settings: UserSettings }>("/api/auth/settings", patch);
    setProfile((prev) => ({ ...prev, settings: data.settings }));
    return data.settings;
  }, []);

  const updateProfile = React.useCallback(async (patch: Record<string, unknown>) => {
    const data = await apiPatch<{ user: Profile }>("/api/auth/profile", patch);
    setProfile((prev) => ({ ...prev, ...data.user }));
    return data.user;
  }, []);

  React.useEffect(() => {
    void refreshConversations();
    void refreshMe();
    void loadAi();
    void refreshNotifications();
  }, [loadAi, refreshConversations, refreshMe, refreshNotifications]);

  React.useEffect(() => {
    if (!initialConversationId) return;
    if (loadedRef.current.has(initialConversationId)) return;
    void loadMessages(initialConversationId, { focus: initialFocusId ?? null });
  }, [initialConversationId, initialFocusId, loadMessages]);

  React.useEffect(() => {
    const match = pathname?.match(/^\/app\/([^/?#]+)/);
    const urlId = match?.[1];
    if (urlId) {
      if (urlId !== activeIdRef.current) {
        activeIdRef.current = urlId;
        setActiveId(urlId);
        const query = new URLSearchParams(window.location.search);
        const focus = query.get("focus");
        if (focus) {
          void loadMessages(urlId, { focus });
        } else if (!loadedRef.current.has(urlId)) {
          void loadMessages(urlId);
        } else {
          markRead(urlId);
        }
      }
    } else if (pathname === "/app" && activeIdRef.current) {
      activeIdRef.current = undefined;
      setActiveId(undefined);
    }
  }, [pathname, conversations.length, loadMessages, markRead]);

  React.useEffect(() => {
    const socket = getSocket();
    const onConnect = () => {
      setConnected(true);
      const current = activeIdRef.current;
      if (current) {
        socket.emit("delivered", { conversationId: current });
        if (document.visibilityState === "visible") socket.emit("read", { conversationId: current });
      }
    };
    const onDisconnect = () => setConnected(false);

    const onMessage = (message: Message) => {
      const current = activeIdRef.current;
      const isKnown = (messagesRef.current[message.conversationId] ?? []).some(
        (item) => item.id === message.id || (message.clientId && item.clientId === message.clientId),
      );
      if (!isKnown) appendMessage(message);
      scheduleRefresh();
      if (message.conversationId === current) {
        if (document.visibilityState === "visible" && message.sender.id !== profileRef.current.id) {
          socket.emit("read", { conversationId: message.conversationId });
        }
        const mentioned = message.mentions.some((mention) => mention.id === profileRef.current.id);
        if (
          message.sender.id !== profileRef.current.id &&
          profileRef.current.settings.soundEnabled &&
          (document.visibilityState !== "visible" || mentioned)
        ) {
          playPing();
        }
      } else if (message.sender.id !== profileRef.current.id) {
        if (profileRef.current.settings.soundEnabled) playPing();
      }
    };

    const onUpdated = (message: Message) => appendMessage(message);
    const onDeleted = ({ id, conversationId }: { id: string; conversationId: string }) => {
      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] ?? []).map((message) =>
          message.id === id
            ? { ...message, deletedAt: new Date().toISOString(), body: "", attachments: [], poll: null }
            : message,
        ),
      }));
      scheduleRefresh();
    };
    const onReactions = (payload: {
      messageId: string;
      conversationId: string;
      reactions: { emoji: string; userId: string }[];
    }) => {
      const grouped = groupReactions(payload.reactions, profileRef.current.id);
      setMessagesByConversation((prev) => ({
        ...prev,
        [payload.conversationId]: (prev[payload.conversationId] ?? []).map((message) =>
          message.id === payload.messageId ? { ...message, reactions: grouped } : message,
        ),
      }));
    };
    const onPins = (payload: { conversationId: string; messageIds: string[] }) => {
      const ids = new Set(payload.messageIds);
      setMessagesByConversation((prev) => ({
        ...prev,
        [payload.conversationId]: (prev[payload.conversationId] ?? []).map((message) => ({
          ...message,
          isPinned: ids.has(message.id),
        })),
      }));
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === payload.conversationId
            ? { ...conversation, pinnedCount: payload.messageIds.length }
            : conversation,
        ),
      );
    };
    const onPoll = (payload: {
      messageId: string;
      conversationId: string;
      question: string;
      allowsMultiple: boolean;
      closesAt: string | null;
      options: { id: string; label: string; userIds: string[] }[];
      totalVotes: number;
    }) => {
      setMessagesByConversation((prev) => ({
        ...prev,
        [payload.conversationId]: (prev[payload.conversationId] ?? []).map((message) =>
          message.id === payload.messageId
            ? {
                ...message,
                poll: {
                  id: message.poll?.id ?? payload.messageId,
                  messageId: payload.messageId,
                  question: payload.question,
                  allowsMultiple: payload.allowsMultiple,
                  closesAt: payload.closesAt,
                  totalVotes: payload.totalVotes,
                  closed: Boolean(payload.closesAt && new Date(payload.closesAt).getTime() <= Date.now()),
                  options: payload.options.map((option) => ({
                    id: option.id,
                    label: option.label,
                    votes: option.userIds.length,
                    mine: option.userIds.includes(profileRef.current.id),
                  })),
                },
              }
            : message,
        ),
      }));
    };
    const onReceipts = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId === activeIdRef.current) {
        scheduleReceiptRefresh(payload.conversationId);
      }
    };
    const onConversationNew = () => scheduleRefresh();
    const onConversationUpdated = () => scheduleRefresh();
    const onConversationRemoved = ({ conversationId }: { conversationId: string }) => {
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
      if (activeIdRef.current === conversationId) closeConversation();
      scheduleRefresh();
    };
    const onPresence = (payload: Presence) => {
      setPresence((prev) => ({ ...prev, [payload.userId]: payload }));
    };
    const onPresenceSnapshot = (payload: Presence[]) => {
      setPresence((prev) => {
        const next = { ...prev };
        for (const entry of payload) next[entry.userId] = entry;
        return next;
      });
    };
    const onTyping = (payload: {
      conversationId: string;
      userId: string;
      name: string;
      isTyping: boolean;
    }) => {
      setTyping((prev) => {
        const conversation = { ...(prev[payload.conversationId] ?? {}) };
        if (payload.isTyping) {
          conversation[payload.userId] = { name: payload.name, expiresAt: Date.now() + 4500 };
        } else {
          delete conversation[payload.userId];
        }
        return { ...prev, [payload.conversationId]: conversation };
      });
    };
    const onNotification = (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev.filter((item) => item.id !== notification.id)]);
      setUnreadNotifications((prev) => prev + 1);
      if (profileRef.current.settings.notificationsEnabled) {
        toast(notification.title, { description: notification.body });
      }
    };
    const onNotificationsRead = () => setUnreadNotifications(0);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onMessage);
    socket.on("message:updated", onUpdated);
    socket.on("message:deleted", onDeleted);
    socket.on("reactions:updated", onReactions);
    socket.on("pins:updated", onPins);
    socket.on("poll:updated", onPoll);
    socket.on("receipts:update", onReceipts);
    socket.on("conversation:new", onConversationNew);
    socket.on("conversation:updated", onConversationUpdated);
    socket.on("conversation:removed", onConversationRemoved);
    socket.on("presence:update", onPresence);
    socket.on("presence:snapshot", onPresenceSnapshot);
    socket.on("typing:update", onTyping);
    socket.on("notification:new", onNotification);
    socket.on("notifications:read", onNotificationsRead);
    socket.on("workspace:updated", () => setWorkspaceVersion((v) => v + 1));

    if (!socket.connected) socket.connect();
    else onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onMessage);
      socket.off("message:updated", onUpdated);
      socket.off("message:deleted", onDeleted);
      socket.off("reactions:updated", onReactions);
      socket.off("pins:updated", onPins);
      socket.off("poll:updated", onPoll);
      socket.off("receipts:update", onReceipts);
      socket.off("conversation:new", onConversationNew);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("conversation:removed", onConversationRemoved);
      socket.off("presence:update", onPresence);
      socket.off("presence:snapshot", onPresenceSnapshot);
      socket.off("typing:update", onTyping);
      socket.off("notification:new", onNotification);
      socket.off("notifications:read", onNotificationsRead);
    };
  }, [
    appendMessage,
    closeConversation,
    scheduleReceiptRefresh,
    scheduleRefresh,
  ]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTyping((prev) => {
        let changed = false;
        const next: TypingState = {};
        for (const [conversationId, entries] of Object.entries(prev)) {
          const filtered: Record<string, { name: string; expiresAt: number }> = {};
          for (const [userId, entry] of Object.entries(entries)) {
            if (entry.expiresAt > Date.now()) filtered[userId] = entry;
            else changed = true;
          }
          if (Object.keys(filtered).length) next[conversationId] = filtered;
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  React.useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) NEXA` : "NEXA — Every conversation, more intelligent.";
  }, [totalUnread]);

  React.useEffect(() => {
    const onVisible = () => {
      const current = activeIdRef.current;
      if (current && document.visibilityState === "visible") markRead(current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  return {
    profile,
    profileRef,
    conversations,
    activeConversation,
    activeId,
    activeMessages,
    activeTyping,
    focusId,
    setFocusId,
    loadingConversations,
    loadingMessages,
    loadingOlder,
    hasMoreOlder: activeId ? Boolean(cursors[activeId]?.hasMore) : false,
    sending,
    connected,
    presence,
    notifications,
    notificationsCursor,
    unreadNotifications,
    invites,
    ai,
    replyTo,
    setReplyTo,
    draft,
    setDraft,
    workspaceVersion,
    memories,
    memoryEnabled,
    totalUnread,
    openConversation,
    closeConversation,
    loadOlder,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    toggleStar,
    togglePin,
    votePoll,
    forwardMessage,
    createBranch,
    createConversation,
    conversationAction,
    leaveConversation,
    archiveConversation,
    favoriteConversation,
    sendTyping,
    refreshConversations,
    refreshMe,
    refreshNotifications,
    loadNotificationsMore: async () => {
      if (!notificationsCursor) return;
      const data = await apiGet<{ notifications: Notification[]; nextCursor: string | null }>(
        `/api/notifications?cursor=${encodeURIComponent(notificationsCursor)}`,
      );
      setNotifications((prev) => [...prev, ...data.notifications]);
      setNotificationsCursor(data.nextCursor);
    },
    markNotificationsRead,
    handleInvite,
    loadMemories,
    updateSettings,
    updateProfile,
    setMemories,
    setMemoryEnabled,
    reloadMessages: (conversationId: string) => loadMessages(conversationId, { silent: true }),
    silentRefresh,
    setActiveConversationTyping: sendTyping,
    aiRefresh: loadAi,
  };
}
