"use client";

import * as React from "react";
import {
  Archive,
  Bell,
  Clock3,
  GitBranch,
  Inbox,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import {
  Avatar,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import { MobileTopBar, type InboxFilter } from "@/components/nexa/rail";
import { useNexa } from "@/components/nexa/nexa-store";
import type { Conversation } from "@/lib/client/types";
import { errorMessage } from "@/lib/client/api";
import { listTime, messagePreview } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const assistantPrompts = [
  "Summarize what I should focus on today",
  "Draft a friendly project update for my team",
  "Help me brainstorm a product launch checklist",
  "Explain a tricky technical concept simply",
];

const filters: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "favorites", label: "Saved" },
  { key: "archived", label: "Archive" },
];

function conversationSubtitle(conversation: Conversation, viewerId: string) {
  const message = conversation.lastMessage;
  if (!message) return conversation.description?.trim() || "No messages yet";
  if (message.deletedAt) return "Message deleted";
  const prefix = message.senderId === viewerId ? "You: " : conversation.type === "DIRECT" ? "" : `${message.senderName.split(" ")[0]}: `;
  const body = message.body.trim();
  if (!body && message.hasAttachments) return `${prefix}Sent an attachment`;
  if (!body && message.type === "POLL") return `${prefix}Started a poll`;
  return `${prefix}${messagePreview(body, 74)}`;
}

function AssistantTab({
  ai,
  conversation,
  thinking,
  viewerId,
  onOpen,
}: {
  ai: { configured: boolean; provider: string; model: string; missing: string[] } | null;
  conversation: Conversation | undefined;
  thinking: boolean;
  viewerId: string;
  onOpen: (prompt?: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3 px-1 pt-2">
      <div className="rounded-xl border border-signal/25 bg-signal/[0.05] p-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-signal/30 bg-signal/10 text-signal">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold">NEXA AI</p>
            <p className="text-[9.5px] text-muted-foreground">A real assistant, backed by your server</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-[10px] leading-relaxed">
          {ai === null ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
              Checking the AI provider…
            </span>
          ) : ai.configured ? (
            <span className="flex flex-wrap items-center gap-1.5 text-signal" aria-live="polite">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              Connected · {ai.provider}
              <code className="rounded bg-background/70 px-1 py-0.5 text-[9px] font-normal text-muted-foreground">
                {ai.model}
              </code>
            </span>
          ) : (
            <span className="text-amber-500" aria-live="polite">
              Not configured. Replies will be rejected honestly until the server has a provider key.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void onOpen()}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-signal text-[11.5px] font-semibold text-signal-foreground transition hover:brightness-105"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {conversation ? "Open your thread" : "Start a conversation"}
        </button>
      </div>

      {conversation ? (
        <button
          type="button"
          onClick={() => void onOpen()}
          className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-background/40 px-2.5 py-2.5 text-left transition hover:border-border hover:bg-secondary/40"
        >
          <Avatar name="NEXA AI" src="/nexa-ai.svg" id="nexa-ai" size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[12.5px] font-semibold">NEXA AI</p>
              {thinking ? (
                <span className="text-[9px] text-signal">thinking…</span>
              ) : conversation.unreadCount > 0 ? (
                <span className="ml-auto flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-signal px-1 text-[9px] font-bold text-signal-foreground">
                  {conversation.unreadCount}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
              {conversation.lastMessage ? conversationSubtitle(conversation, viewerId) : "No messages yet — say hello."}
            </p>
          </div>
        </button>
      ) : null}

      <div>
        <p className="px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Try asking
        </p>
        <div className="mt-1.5 space-y-1.5">
          {assistantPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void onOpen(prompt)}
              className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-background/30 px-2.5 py-2 text-left text-[10.5px] leading-snug text-muted-foreground transition hover:border-signal/30 hover:bg-signal/[0.04] hover:text-foreground"
            >
              <Sparkles className="h-3 w-3 shrink-0 text-signal/70" />
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-border/50 bg-background/30 px-2.5 py-2 text-[9px] leading-relaxed text-muted-foreground">
        The assistant reads this private thread on the server when it answers. Chats are not
        end-to-end encrypted.
      </p>
    </div>
  );
}

export function Sidebar({
  filter,
  onFilter,
  onNew,
  onSearch,
  onSettings,
  onNotifications,
}: {
  filter: InboxFilter;
  onFilter: (filter: InboxFilter) => void;
  onNew: () => void;
  onSearch: () => void;
  onSettings: () => void;
  onNotifications: () => void;
  notificationsOpen: boolean;
}) {
  const {
    profile,
    conversations,
    loadingConversations,
    activeId,
    openConversation,
    presence,
    invites,
    unreadNotifications,
    favoriteConversation,
    archiveConversation,
    conversationAction,
    ai,
    aiThinking,
    openAiAssistant,
  } = useNexa();

  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"chats" | "ai">("chats");

  const aiConversation = conversations.find((conversation) => conversation.isAi);
  const aiUnread = aiConversation?.unreadCount ?? 0;

  React.useEffect(() => {
    if (aiConversation?.id && aiConversation.id === activeId) setTab("ai");
  }, [activeId, aiConversation?.id]);

  const startAssistant = async (prompt?: string) => {
    try {
      await openAiAssistant(prompt);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = conversations.filter((conversation) => {
      if (conversation.isAi) return false;
      if (filter === "archived" && !conversation.isArchived) return false;
      if (filter !== "archived" && conversation.isArchived) return false;
      if (filter === "unread" && conversation.unreadCount === 0) return false;
      if (filter === "favorites" && !conversation.isFavorite) return false;
      if (!q) return true;
      return (
        conversation.title.toLowerCase().includes(q) ||
        (conversation.lastMessage?.body ?? "").toLowerCase().includes(q) ||
        conversation.members.some((member) => member.user.name.toLowerCase().includes(q))
      );
    });
    if (filter !== "archived") {
      list.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
    }
    return list;
  }, [conversations, filter, query]);

  const muted = (conversation: Conversation) =>
    Boolean(conversation.mutedUntil && new Date(conversation.mutedUntil).getTime() > Date.now());

  const toggleMute = async (conversation: Conversation) => {
    const value = muted(conversation) ? null : 8;
    await conversationAction(conversation.id, "mute", { hours: value });
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-border/70 bg-card/25 md:w-[306px] xl:w-[326px]">
      <MobileTopBar
        onSettings={onSettings}
        onNotifications={onNotifications}
        unreadNotifications={unreadNotifications}
      />

      <div className="hidden items-center justify-between px-4 pb-3 pt-5 md:flex">
        <h2 className="font-display text-[17px] tracking-[-0.02em]">
          {tab === "chats" ? "Conversations" : "NEXA AI"}
        </h2>
        <Badge tone="outline">
          {tab === "chats"
            ? conversations.filter((c) => !c.isArchived && !c.isAi).length
            : ai?.configured
              ? "live"
              : "offline"}
        </Badge>
      </div>

      <div className="px-3 pt-3 md:pt-0">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/30 p-1">
          <button
            type="button"
            onClick={() => setTab("chats")}
            className={cn(
              "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition",
              tab === "chats"
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquarePlus className="h-3 w-3" /> Chats
          </button>
          <button
            type="button"
            onClick={() => setTab("ai")}
            className={cn(
              "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition",
              tab === "ai"
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="h-3 w-3" /> NEXA AI
            {aiUnread > 0 ? (
              <span className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-signal px-1 text-[8.5px] font-bold text-signal-foreground">
                {aiUnread > 9 ? "9+" : aiUnread}
              </span>
            ) : null}
          </button>
        </div>

        {tab === "chats" ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onSearch}
                className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-3 text-left text-[12px] text-muted-foreground transition hover:border-border hover:bg-background"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="truncate">Search messages…</span>
                <kbd className="ml-auto hidden rounded border border-border bg-muted px-1 py-0.5 text-[9px] text-muted-foreground lg:inline">
                  Ctrl K
                </kbd>
              </button>
              <button
                type="button"
                onClick={onNew}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-signal text-signal-foreground transition hover:brightness-105"
                aria-label="New conversation"
                title="New conversation (Ctrl N)"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-1 rounded-lg border border-border/60 bg-background/30 p-1">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onFilter(item.key)}
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center rounded-md text-[11px] font-medium transition",
                    filter === item.key
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name or message"
                aria-label="Filter conversations"
                className="h-8 w-full rounded-md border border-transparent bg-transparent pl-8 pr-2 text-[11px] text-foreground outline-none transition placeholder:text-muted-foreground/60 hover:border-border/60 focus:border-border focus:bg-background/60"
              />
            </div>
          </>
        ) : (
          <p className="mt-3 px-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
            Your private thread with the server-side assistant. Ask questions, draft text, and
            iterate — replies come from the configured provider, never a mock.
          </p>
        )}
      </div>

      {tab === "chats" && invites.length > 0 ? (
        <button
          type="button"
          onClick={onNotifications}
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-signal/30 bg-signal/[0.07] px-3 py-2 text-left text-[11px] text-signal transition hover:bg-signal/10"
        >
          <Inbox className="h-3.5 w-3.5" />
          {invites.length === 1 ? "1 pending invitation" : `${invites.length} pending invitations`}
          <span className="ml-auto text-[10px] opacity-70">View</span>
        </button>
      ) : null}

      <div className="scroll-thin mt-2 flex-1 overflow-y-auto px-2 pb-3">
        {tab === "ai" ? (
          <AssistantTab
            ai={ai}
            conversation={aiConversation}
            thinking={Boolean(aiConversation && aiThinking[aiConversation.id])}
            viewerId={profile.id}
            onOpen={startAssistant}
          />
        ) : loadingConversations ? (
          <div className="space-y-2 px-1 pt-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={filter === "archived" ? <Archive className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />}
            title={
              query
                ? "No conversations match"
                : filter === "archived"
                  ? "Nothing archived"
                  : filter === "favorites"
                    ? "No favorites yet"
                    : filter === "unread"
                      ? "You are all caught up"
                      : "Start your first conversation"
            }
            description={
              query
                ? "Try a different name or clear the filter."
                : filter === "archived"
                  ? "Archived conversations stay searchable and can be restored anytime."
                  : "Direct messages, groups, and expiring rooms — all real, all yours."
            }
            action={
              !query && filter === "all" ? (
                <button
                  type="button"
                  onClick={onNew}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-signal px-3 text-[11px] font-semibold text-signal-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> New conversation
                </button>
              ) : null
            }
          />
        ) : (
          <ul className="space-y-1">
            {visible.map((conversation) => {
              const active = conversation.id === activeId;
              const peerId = conversation.peer?.id;
              const online = peerId ? presence[peerId]?.online : false;
              return (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      "group relative rounded-xl border transition",
                      active
                        ? "border-border bg-secondary/80"
                        : "border-transparent hover:border-border/60 hover:bg-secondary/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openConversation(conversation.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 pr-9 text-left"
                      aria-current={active ? "true" : undefined}
                    >
                      <div className="relative">
                        <Avatar
                          name={conversation.title}
                          src={conversation.avatarUrl}
                          id={conversation.id}
                          size="md"
                          online={Boolean(online)}
                        />
                        {conversation.type !== "DIRECT" ? (
                          <span className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                            {conversation.type === "BRANCH" ? (
                              <GitBranch className="h-2.5 w-2.5" />
                            ) : (
                              <Users className="h-2.5 w-2.5" />
                            )}
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p
                            className={cn(
                              "truncate text-[13px]",
                              conversation.unreadCount > 0 ? "font-semibold text-foreground" : "font-medium",
                            )}
                          >
                            {conversation.title}
                          </p>
                          {conversation.pinnedCount > 0 ? (
                            <Pin className="h-2.5 w-2.5 shrink-0 rotate-45 text-muted-foreground/70" />
                          ) : null}
                          {muted(conversation) ? (
                            <VolumeX className="h-2.5 w-2.5 shrink-0 text-muted-foreground/70" />
                          ) : null}
                          {conversation.isTemporary ? (
                            <Clock3 className="h-2.5 w-2.5 shrink-0 text-muted-foreground/70" />
                          ) : null}
                          <span className="ml-auto shrink-0 text-[9.5px] tabular-nums text-muted-foreground">
                            {listTime(conversation.lastMessageAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <p
                            className={cn(
                              "truncate text-[11px] leading-relaxed",
                              conversation.unreadCount > 0
                                ? "text-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {conversationSubtitle(conversation, profile.id)}
                          </p>
                          {conversation.unreadCount > 0 ? (
                            <span className="ml-auto flex h-[16px] min-w-[16px] shrink-0 items-center justify-center rounded-full bg-signal px-1 text-[9px] font-bold text-signal-foreground">
                              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div className="absolute right-1.5 top-1.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label={`Options for ${conversation.title}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{conversation.type.toLowerCase()}</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => void favoriteConversation(conversation.id, !conversation.isFavorite)}
                          >
                            <Star className={cn("h-3.5 w-3.5", conversation.isFavorite && "fill-current text-signal")} />
                            {conversation.isFavorite ? "Remove favorite" : "Add to favorites"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void toggleMute(conversation)}>
                            <Bell className="h-3.5 w-3.5" />
                            {muted(conversation) ? "Unmute notifications" : "Mute for 8 hours"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void conversationAction(conversation.id, "read")}
                          >
                            <Inbox className="h-3.5 w-3.5" /> Mark as read
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="my-1 h-px bg-border" />
                          <DropdownMenuItem
                            onSelect={() =>
                              void archiveConversation(conversation.id, !conversation.isArchived)
                            }
                          >
                            <Archive className="h-3.5 w-3.5" />
                            {conversation.isArchived ? "Restore conversation" : "Archive conversation"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="hidden border-t border-border/60 px-4 py-3 text-[10px] leading-relaxed text-muted-foreground md:block">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-signal" />
          {tab === "chats" ? "Real-time · server-side permissions" : "Provider-backed · no simulated replies"}
        </span>
      </div>
    </aside>
  );
}
