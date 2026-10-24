"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  BellOff,
  Bell,
  Download,
  GitBranch,
  Info as InfoIcon,
  Lightbulb,
  MessageSquare,
  MoreVertical,
  Pin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  VolumeX,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { Composer } from "@/components/nexa/composer";
import { MessageItem } from "@/components/nexa/message-item";
import { useNexa } from "@/components/nexa/nexa-store";
import type { InfoTab } from "@/components/nexa/types";
import type { Conversation, Message } from "@/lib/client/types";
import { dayLabel, isSameDayValue, lastSeenLabel } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const aiPrompts = [
  "Summarize what I should focus on today",
  "Draft a friendly project update for my team",
  "Help me brainstorm a product launch checklist",
  "Explain a tricky technical concept simply",
];

function HeaderPresence({ conversation }: { conversation: Conversation }) {
  const { presence, profile, ai } = useNexa();
  if (conversation.isAi) {
    if (!ai) return <span className="text-muted-foreground">Assistant · checking provider…</span>;
    if (!ai.configured) return <span className="text-amber-500">Assistant · provider not configured</span>;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-signal">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
        <span className="truncate">
          Assistant · {ai.provider} · {ai.model}
        </span>
      </span>
    );
  }
  if (conversation.type === "DIRECT" && conversation.peer) {
    const state = presence[conversation.peer.id];
    if (state?.hidden) return <span className="text-muted-foreground">Last seen hidden</span>;
    if (state?.online) {
      return (
        <span className="inline-flex items-center gap-1.5 text-signal">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Online
        </span>
      );
    }
    if (conversation.peer.statusText) {
      return <span className="truncate text-muted-foreground">{conversation.peer.statusText}</span>;
    }
    return <span className="text-muted-foreground">{lastSeenLabel(state?.lastSeenAt ?? null)}</span>;
  }
  const online = conversation.members.filter((member) => presence[member.user.id]?.online).length;
  if (conversation.type === "BRANCH") {
    return (
      <span className="truncate text-muted-foreground">
        Side thread{conversation.branch?.sourceConversationTitle ? ` · ${conversation.branch.sourceConversationTitle}` : ""}
      </span>
    );
  }
  if (conversation.type === "ROOM") {
    return (
      <span className="truncate text-muted-foreground">
        {conversation.members.length} members
        {conversation.expiresAt ? ` · expires ${new Date(conversation.expiresAt).toLocaleDateString()}` : ""}
      </span>
    );
  }
  return (
    <span className="truncate text-muted-foreground">
      {conversation.members.length} members
      {online > 0 ? ` · ${online} online` : ""}
      {conversation.members.length === 1 && conversation.members[0]?.user.id === profile.id ? " · just you" : ""}
    </span>
  );
}

export function ChatView({
  onOpenSearch,
  onOpenInfo,
  onToggleAi,
  aiOpen,
  onForward,
  onBranch,
  onBack,
}: {
  onOpenSearch: (scope: "conversation") => void;
  onOpenInfo: (tab: InfoTab) => void;
  onToggleAi: () => void;
  aiOpen: boolean;
  onForward: (message: Message) => void;
  onBranch: (conversationId: string) => void;
  onBack: () => void;
}) {
  const {
    activeConversation,
    activeMessages,
    activeTyping,
    loadingMessages,
    loadingOlder,
    hasMoreOlder,
    focusId,
    openConversation,
    loadOlder,
    profile,
    presence,
    connected,
    conversationAction,
    favoriteConversation,
    archiveConversation,
    setReplyTo,
    ai,
    aiThinking,
    aiErrors,
    retryAiReply,
    setDraft,
  } = useNexa();

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);
  const previousIdRef = React.useRef<string | undefined>(undefined);
  const previousCountRef = React.useRef(0);
  const [showJump, setShowJump] = React.useState(false);

  const conversationId = activeConversation?.id;
  const isAiConversation = Boolean(activeConversation?.isAi);
  const hasMessages = activeMessages.length > 0;
  const aiThinkingNow = conversationId ? Boolean(aiThinking[conversationId]) : false;
  const aiErrorNow = conversationId ? aiErrors[conversationId] : undefined;
  const aiConfigured = Boolean(ai?.configured);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    atBottomRef.current = true;
    setShowJump(false);
    if (!activeConversation) return;
    if (focusId) {
      requestAnimationFrame(() => {
        const element = document.getElementById(`message-${focusId}`);
        element?.scrollIntoView({ block: "center", behavior: "auto" });
      });
    } else if (!hasMessages) {
      // Empty threads show their intro/empty state from the top instead of
      // scrolling past it to the composer.
      container.scrollTop = 0;
    } else {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [
    conversationId,
    focusId,
    loadingMessages,
    activeConversation,
    scrollToBottom,
    hasMessages,
  ]);

  React.useEffect(() => {
    if (!conversationId) return;
    const changedConversation = previousIdRef.current !== conversationId;
    previousIdRef.current = conversationId;
    const previousCount = previousCountRef.current;
    previousCountRef.current = activeMessages.length;
    if (changedConversation) return;
    const last = activeMessages[activeMessages.length - 1];
    const grew = activeMessages.length > previousCount;
    if (grew && last && (atBottomRef.current || last.sender.id === profile.id)) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }, [activeMessages, conversationId, profile.id, scrollToBottom]);

  React.useEffect(() => {
    if (!focusId) return;
    const element = document.getElementById(`message-${focusId}`);
    element?.scrollIntoView({ block: "center" });
  }, [focusId, activeMessages.length]);

  React.useEffect(() => {
    if (!aiThinkingNow) return;
    requestAnimationFrame(() => scrollToBottom("smooth"));
  }, [aiThinkingNow, scrollToBottom]);

  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    atBottomRef.current = distance < 120;
    setShowJump(distance > 420);
  };

  if (!activeConversation) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/[0.05] blur-[100px]" />
        <div className="relative max-w-md text-center">
          <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card/70 text-signal">
            <MessageSquare className="h-6 w-6" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-signal">Your workspace</p>
          <h2 className="mt-3 font-display text-3xl leading-tight tracking-[-0.02em]">
            Pick a conversation,
            <br />
            or start something new.
          </h2>
          <p className="mx-auto mt-3 max-w-[38ch] text-xs leading-relaxed text-muted-foreground">
            Direct messages, groups, and expiring rooms — with real-time delivery, shared tasks, and AI
            answers that cite their sources.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="signal" onClick={() => onOpenSearch("conversation")}>
              <Search className="h-3.5 w-3.5" /> Search messages
            </Button>
            <Button variant="outline" onClick={() => onOpenInfo("overview")}>
              <InfoIcon className="h-3.5 w-3.5" /> Workspace guide
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const peerOnline = activeConversation.peer ? presence[activeConversation.peer.id]?.online : false;
  const canModerate = activeConversation.role === "OWNER" || activeConversation.role === "ADMIN";
  const muted = Boolean(activeConversation.mutedUntil && new Date(activeConversation.mutedUntil).getTime() > Date.now());

  const exportConversation = () => {
    const anchor = document.createElement("a");
    anchor.href = `/api/conversations/${activeConversation.id}/export`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const applyPrompt = (prompt: string) => {
    setDraft(prompt);
    requestAnimationFrame(() => {
      const input = document.getElementById("nexa-composer-input");
      if (input instanceof HTMLTextAreaElement) {
        input.focus();
        input.setSelectionRange(prompt.length, prompt.length);
      }
    });
  };

  let previous: Message | undefined;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background/40">
      <header className="z-20 flex h-[64px] shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onOpenInfo("overview")}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left transition hover:opacity-90"
        >
          <div className="relative">
            <Avatar
              name={activeConversation.title}
              src={activeConversation.avatarUrl}
              id={activeConversation.id}
              size="md"
              online={Boolean(peerOnline)}
            />
            {activeConversation.type !== "DIRECT" ? (
              <span className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
                {activeConversation.type === "BRANCH" ? <GitBranch className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
              </span>
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em]">{activeConversation.title}</h1>
              {activeConversation.isFavorite ? <Star className="h-3 w-3 shrink-0 fill-current text-signal" /> : null}
              {muted ? <VolumeX className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
              {activeConversation.isTemporary ? <Badge tone="danger">room</Badge> : null}
              {isAiConversation ? <Badge tone="signal">assistant</Badge> : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
              <HeaderPresence conversation={activeConversation} />
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onOpenSearch("conversation")}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground sm:flex"
                aria-label="Search this conversation"
              >
                <Search className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Search conversation</TooltipContent>
          </Tooltip>
          {activeConversation.pinnedCount > 0 ? (
            <button
              type="button"
              onClick={() => onOpenInfo("overview")}
              className="hidden h-8 items-center gap-1 rounded-lg px-2 text-[10px] text-signal transition hover:bg-signal/10 sm:flex"
              title="View pinned messages"
            >
              <Pin className="h-3.5 w-3.5 rotate-45" />
              {activeConversation.pinnedCount}
            </button>
          ) : null}
          {!isAiConversation ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleAi}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition",
                    aiOpen
                      ? "bg-signal/15 text-signal"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  aria-label="AI assistant"
                  aria-pressed={aiOpen}
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>AI assistant</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onOpenInfo("overview")}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground sm:flex"
                aria-label="Conversation details"
              >
                <InfoIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Details</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="More conversation actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => void favoriteConversation(activeConversation.id, !activeConversation.isFavorite)}
              >
                <Star className={cn("h-3.5 w-3.5", activeConversation.isFavorite && "fill-current text-signal")} />
                {activeConversation.isFavorite ? "Remove favorite" : "Add to favorites"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void conversationAction(activeConversation.id, "mute", { hours: muted ? null : 8 }).then(() =>
                    setReplyTo(null),
                  )
                }
              >
                {muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                {muted ? "Unmute notifications" : "Mute for 8 hours"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void archiveConversation(activeConversation.id, !activeConversation.isArchived)}>
                <Archive className="h-3.5 w-3.5" />
                {activeConversation.isArchived ? "Restore conversation" : "Archive conversation"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 h-px bg-border" />
              <DropdownMenuItem onSelect={exportConversation}>
                <Download className="h-3.5 w-3.5" /> Export transcript (.md)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!connected ? (
        <div className="border-b border-danger/20 bg-danger/[0.06] px-4 py-1.5 text-center text-[10px] text-danger">
          Reconnecting to real-time updates — sent messages will still be saved.
        </div>
      ) : null}

      {isAiConversation && ai && !ai.configured ? (
        <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 text-center text-[10px] text-amber-500">
          NEXA AI is offline until the server has an AI provider. Sending is blocked — no fake replies.
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4"
      >
        <div className="mx-auto w-full max-w-[900px] pt-5">
          <div className="mb-6 px-5">
            <div className="flex items-center gap-3">
              <Avatar
                name={activeConversation.title}
                src={activeConversation.avatarUrl}
                id={activeConversation.id}
                size="lg"
              />
              <div>
                <h2 className="font-display text-2xl tracking-[-0.02em]">{activeConversation.title}</h2>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  {isAiConversation
                    ? "AI assistant"
                    : activeConversation.type === "DIRECT"
                      ? "Direct message"
                      : activeConversation.type === "ROOM"
                        ? "Expiring room"
                        : activeConversation.type === "BRANCH"
                          ? "Side thread"
                          : "Group conversation"}
                  {" · "}
                  created {new Date(activeConversation.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            {isAiConversation ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-signal/25 bg-signal/[0.04] px-3.5 py-2.5">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  {ai?.configured
                    ? `Replies come from ${ai.provider} (${ai.model}). The assistant can read this thread on the server, and it cannot access your other conversations or attachments. Chats are not end-to-end encrypted.`
                    : ai
                      ? "No AI provider is configured on this server yet, so the assistant cannot reply. Messages will be rejected rather than faked."
                      : "Checking the configured AI provider…"}
                </p>
              </div>
            ) : null}
            {activeConversation.description ? (
              <p className="mt-3 max-w-[70ch] rounded-lg border border-border/60 bg-card/40 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {activeConversation.description}
              </p>
            ) : null}
            {activeConversation.branch ? (
              <button
                type="button"
                onClick={() => openConversation(activeConversation.branch!.sourceConversationId)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1 text-[10px] text-muted-foreground transition hover:text-foreground"
              >
                <GitBranch className="h-3 w-3 text-signal" />
                From {activeConversation.branch.sourceConversationTitle ?? "a conversation"} · view source
              </button>
            ) : null}
          </div>

          {hasMoreOlder ? (
            <div className="mb-3 flex justify-center px-4">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="rounded-full border border-border bg-card/70 px-3 py-1.5 text-[10px] text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                {loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
              </button>
            </div>
          ) : null}

          {loadingMessages && activeMessages.length === 0 ? (
            <div className="space-y-5 px-5 py-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-2.5 w-28" />
                    <Skeleton className={index % 2 ? "h-3 w-2/3" : "h-3 w-5/6"} />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeMessages.length === 0 ? (
            isAiConversation ? (
              <div className="mx-auto max-w-[560px] px-5 py-12 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-signal/30 bg-signal/10 text-signal">
                  <Sparkles className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-2xl tracking-[-0.02em]">
                  What can I help you with?
                </h3>
                <p className="mx-auto mt-2 max-w-[46ch] text-[11.5px] leading-relaxed text-muted-foreground">
                  Ask a question, draft a message, or think through a problem. This is a real model
                  call to your workspace&apos;s configured provider — nothing here is canned.
                </p>
                <div className="mt-5 grid gap-1.5 text-left sm:grid-cols-2">
                  {aiPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={Boolean(ai && !aiConfigured)}
                      onClick={() => applyPrompt(prompt)}
                      className="group flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-left text-[10.5px] leading-relaxed text-muted-foreground transition hover:border-signal/30 hover:bg-signal/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-signal/70" />
                      {prompt}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[9px] leading-relaxed text-muted-foreground/70">
                  AI can make mistakes. Verify important details. Attachments and polls are disabled
                  in this thread.
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<MessageSquare className="h-4 w-4" />}
                title="No messages yet"
                description="Say hello, share a file, or create a poll. This is a real conversation — invite people if you want company."
                className="py-16"
              />
            )
          ) : (
            <div>
              {activeMessages.map((message) => {
                const previousMessage = previous;
                previous = message;
                const newDay = !previousMessage || !isSameDayValue(previousMessage.createdAt, message.createdAt);
                const grouped =
                  !newDay &&
                  Boolean(previousMessage) &&
                  previousMessage.sender.id === message.sender.id &&
                  message.type !== "SYSTEM" &&
                  previousMessage.type !== "SYSTEM" &&
                  new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime() < 5 * 60 * 1000;
                return (
                  <React.Fragment key={message.id}>
                    {newDay ? (
                      <div className="my-4 flex items-center gap-3 px-5">
                        <span className="h-px flex-1 bg-border/50" />
                        <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {dayLabel(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-border/50" />
                      </div>
                    ) : null}
                    <MessageItem
                      message={message}
                      grouped={grouped}
                      focused={focusId === message.id}
                      onForward={onForward}
                      onInfo={onOpenInfo}
                      onJump={(messageId) => {
                        if (activeConversation.id) openConversation(activeConversation.id, messageId);
                      }}
                      onBranch={onBranch}
                      canModerate={canModerate}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {isAiConversation && aiThinkingNow ? (
            <div className="mt-3 flex items-start gap-3 px-5" aria-live="polite">
              <Avatar name="NEXA AI" src="/nexa-ai.svg" id="nexa-ai" size="md" />
              <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card/70 px-3.5 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                  <span className="dot-typing flex gap-0.5">
                    <span />
                    <span />
                    <span />
                  </span>
                  NEXA AI is thinking…
                </div>
              </div>
            </div>
          ) : null}

          {isAiConversation && aiErrorNow ? (
            <div
              className="mx-5 mt-3 flex flex-col gap-2.5 rounded-xl border border-danger/25 bg-danger/[0.05] px-3.5 py-3 sm:flex-row sm:items-center"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-foreground">NEXA AI couldn&apos;t answer</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{aiErrorNow}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                loading={aiThinkingNow}
                disabled={Boolean(ai && !ai.configured)}
                onClick={() => {
                  void retryAiReply(activeConversation.id).catch(() => undefined);
                }}
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            </div>
          ) : null}

          {activeTyping.length > 0 ? (
            <div className="mt-2 flex items-center gap-2 px-6 pb-2 text-[10px] text-muted-foreground">
              <span className="dot-typing flex gap-0.5">
                <span />
                <span />
                <span />
              </span>
              {activeTyping.map((entry) => entry.name).join(", ")}{" "}
              {activeTyping.length === 1 ? "is" : "are"} typing…
            </div>
          ) : null}

          <div ref={bottomRef} className="h-2" />
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="sticky bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-3 text-[10px] text-foreground shadow-lift"
          >
            <ArrowDown className="h-3 w-3" /> Latest
          </button>
        ) : null}
      </div>

      <Composer onOpenAi={onToggleAi} />
    </div>
  );
}
