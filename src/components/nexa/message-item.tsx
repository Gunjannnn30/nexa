"use client";

import * as React from "react";
import {
  CalendarClock,
  Check,
  CheckCheck,
  Copy,
  Download,
  FileText,
  Forward,
  GitBranch,
  Link2,
  ListChecks,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Pin,
  Reply,
  SmilePlus,
  Star,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import type { InfoTab } from "@/components/nexa/types";
import type { Attachment, ContextCard, Message } from "@/lib/client/types";
import { apiPost, errorMessage } from "@/lib/client/api";
import { formatBytes, timeShort } from "@/lib/client/format";
import { QUICK_EMOJIS } from "@/lib/client/emoji";
import { cn } from "@/lib/utils";

type MessageItemProps = {
  message: Message;
  grouped: boolean;
  focused: boolean;
  onForward: (message: Message) => void;
  onInfo: (tab: InfoTab) => void;
  onJump: (messageId: string) => void;
  onBranch: (conversationId: string) => void;
  canModerate: boolean;
};

function renderBody(body: string, mentions: Message["mentions"]) {
  const mentionNames = new Set(mentions.map((mention) => mention.username.toLowerCase()));
  const parts = body.split(/(https?:\/\/[^\s<]+|@[a-zA-Z0-9_]+)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^https?:\/\//i.test(part)) {
      return (
        <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow">
          {part}
        </a>
      );
    }
    if (/^@[a-zA-Z0-9_]+$/.test(part)) {
      const known = mentionNames.has(part.slice(1).toLowerCase());
      return (
        <span
          key={index}
          className={cn(
            "rounded px-0.5",
            known ? "bg-signal/15 font-medium text-signal" : "text-foreground/80",
          )}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function ImageAttachment({ attachment }: { attachment: Attachment }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group/img relative block max-w-[360px] overflow-hidden rounded-xl border border-border/80 bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.originalName}
          loading="lazy"
          className="max-h-[320px] w-auto object-contain transition duration-300 group-hover/img:brightness-95"
        />
        <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white opacity-0 backdrop-blur transition group-hover/img:opacity-100">
          {attachment.width && attachment.height ? `${attachment.width}×${attachment.height} · ` : ""}
          {formatBytes(attachment.size)}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="border-none bg-black/40 p-2 backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.originalName}
            className="mx-auto max-h-[82vh] w-auto rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === "IMAGE") return <ImageAttachment attachment={attachment} />;
  if (attachment.kind === "VIDEO") {
    return (
      <video
        controls
        preload="metadata"
        src={attachment.url}
        className="max-w-[420px] rounded-xl border border-border/80 bg-black"
      >
        <track kind="captions" />
      </video>
    );
  }
  if (attachment.kind === "AUDIO") {
    return (
      <div className="flex max-w-[380px] items-center gap-3 rounded-xl border border-border/80 bg-secondary/50 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
          <Volume2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium">{attachment.originalName}</p>
          <audio controls preload="metadata" src={attachment.url} className="mt-1 h-7 w-full min-w-[180px]" />
        </div>
      </div>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/file flex max-w-[360px] items-center gap-3 rounded-xl border border-border/80 bg-secondary/40 px-3 py-2.5 transition hover:border-border hover:bg-secondary/70"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground ring-1 ring-border">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{attachment.originalName}</span>
        <span className="block text-[10px] text-muted-foreground">
          {formatBytes(attachment.size)} · {attachment.mimeType}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover/file:text-foreground" />
    </a>
  );
}

const cardIcons = {
  TASK: ListTodo,
  DATE: CalendarClock,
  DECISION: ListChecks,
  FILE: FileText,
  LINK: Link2,
} as const;

function ContextCardView({ card, onInfo }: { card: ContextCard; onInfo: (tab: InfoTab) => void }) {
  const Icon = cardIcons[card.type as keyof typeof cardIcons] ?? Link2;
  return (
    <button
      type="button"
      onClick={() => onInfo(card.type === "TASK" || card.type === "DECISION" ? "tasks" : "files")}
      className="flex max-w-[340px] items-center gap-2.5 rounded-lg border border-signal/25 bg-signal/[0.06] px-3 py-2 text-left transition hover:bg-signal/10"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-signal" />
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-signal/80">
          {card.type}
        </span>
        <span className="block truncate text-[11px] text-foreground/90">{card.title}</span>
      </span>
    </button>
  );
}

function PollView({ message }: { message: Message }) {
  const { votePoll } = useNexa();
  const poll = message.poll;
  const [pending, setPending] = React.useState(false);
  if (!poll) return null;
  const total = Math.max(poll.totalVotes, 1);

  const vote = async (optionId: string) => {
    if (poll.closed || pending) return;
    const selected = new Set(poll.options.filter((option) => option.mine).map((option) => option.id));
    if (poll.allowsMultiple) {
      if (selected.has(optionId)) selected.delete(optionId);
      else selected.add(optionId);
    } else {
      selected.clear();
      selected.add(optionId);
    }
    setPending(true);
    try {
      await votePoll(message.id, [...selected]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-2 max-w-[420px] rounded-xl border border-border/80 bg-secondary/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-semibold leading-snug">{poll.question}</p>
        {poll.closed ? <Badge tone="outline">closed</Badge> : null}
      </div>
      <div className="mt-2.5 space-y-1.5">
        {poll.options.map((option) => {
          const percent = Math.round((option.votes / total) * 100);
          return (
            <button
              key={option.id}
              type="button"
              disabled={poll.closed || pending}
              onClick={() => void vote(option.id)}
              className={cn(
                "relative block w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition",
                option.mine
                  ? "border-signal/50 bg-signal/[0.08]"
                  : "border-border bg-background/50 hover:border-border/80 hover:bg-background",
                poll.closed && "cursor-default opacity-80",
              )}
            >
              <span
                className="absolute inset-y-0 left-0 bg-signal/10 transition-all"
                style={{ width: `${percent}%` }}
                aria-hidden
              />
              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                    option.mine ? "border-signal bg-signal text-signal-foreground" : "border-border",
                  )}
                >
                  {option.mine ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span className="text-[11.5px]">{option.label}</span>
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {option.votes} · {percent}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[9.5px] text-muted-foreground">
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
        {poll.allowsMultiple ? " · multiple choice" : ""}
        {poll.closesAt ? ` · closes ${timeShort(poll.closesAt)}` : ""}
      </p>
    </div>
  );
}

export function MessageItem({
  message,
  grouped,
  focused,
  onForward,
  onInfo,
  onJump,
  onBranch,
  canModerate,
}: MessageItemProps) {
  const {
    profile,
    toggleReaction,
    toggleStar,
    togglePin,
    editMessage,
    deleteMessage,
    createBranch,
    setReplyTo,
  } = useNexa();
  const [editing, setEditing] = React.useState(false);
  const [editBody, setEditBody] = React.useState(message.body);
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [creatingTask, setCreatingTask] = React.useState(false);

  const own = message.sender.id === profile.id;
  const deleted = Boolean(message.deletedAt);

  if (message.type === "SYSTEM") {
    return (
      <div id={`message-${message.id}`} className="mx-auto my-3 flex max-w-[620px] items-start gap-2 px-4">
        <div className="mt-1 h-px flex-1 bg-border/60" />
        <p className="max-w-[440px] text-center text-[10.5px] leading-relaxed text-muted-foreground">
          {message.body}
        </p>
        <div className="mt-1 h-px flex-1 bg-border/60" />
      </div>
    );
  }

  const saveEdit = async () => {
    const trimmed = editBody.trim();
    if (!trimmed || trimmed === message.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await editMessage(message.id, trimmed);
      setEditing(false);
      toast.success("Message updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteMessage(message.id);
      setConfirmDelete(false);
      toast.success("Message deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.body);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Could not access the clipboard.");
    }
  };

  const branch = async () => {
    try {
      const conversation = await createBranch(message.id);
      if (conversation) onBranch(conversation.id);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createTask = async () => {
    setCreatingTask(true);
    try {
      await apiPost(`/api/ai/extract?action=extract&conversationId=${encodeURIComponent(message.conversationId)}`, {
        messageIds: [message.id],
        type: "TASK",
        useAI: true,
      });
      toast.success("Task created in the conversation workspace.");
      onInfo("tasks");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreatingTask(false);
    }
  };

  const receipt = message.receipts;
  const canEdit = own && !deleted;
  const canDelete = (own || canModerate) && !deleted;

  const menuItems = (
    <>
      <DropdownMenuItem onSelect={() => setReplyTo(message)}>
        <Reply className="h-3.5 w-3.5" /> Reply
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => void toggleStar(message.id).catch((error) => toast.error(errorMessage(error)))}
      >
        <Star className={cn("h-3.5 w-3.5", message.isStarred && "fill-current")} />
        {message.isStarred ? "Remove from saved" : "Save message"}
      </DropdownMenuItem>
      <DropdownMenuSeparator className="my-1 h-px bg-border" />
      <DropdownMenuItem onSelect={() => void copy()}>
        <Copy className="h-3.5 w-3.5" /> Copy text
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onForward(message)}>
        <Forward className="h-3.5 w-3.5" /> Forward
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => void togglePin(message.id).catch((error) => toast.error(errorMessage(error)))}
      >
        <Pin className="h-3.5 w-3.5" /> {message.isPinned ? "Unpin message" : "Pin message"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void branch()}>
        <GitBranch className="h-3.5 w-3.5" /> Start side thread
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void createTask()} disabled={creatingTask}>
        <ListTodo className="h-3.5 w-3.5" /> {creatingTask ? "Extracting…" : "Create task"}
      </DropdownMenuItem>
      {canEdit || canDelete ? <DropdownMenuSeparator className="my-1 h-px bg-border" /> : null}
      {canEdit ? (
        <DropdownMenuItem
          onSelect={() => {
            setEditBody(message.body);
            setEditing(true);
          }}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit message
        </DropdownMenuItem>
      ) : null}
      {canDelete ? (
        <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
          <Trash2 className="h-3.5 w-3.5" /> Delete message
        </DropdownMenuItem>
      ) : null}
    </>
  );

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group relative px-3 py-0.5 transition-colors sm:px-5",
        grouped ? "mt-0" : "mt-3",
        focused && "bg-signal/[0.07]",
      )}
    >
      <div
        className={cn(
          "relative flex gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/25",
          focused && "ring-1 ring-signal/40",
        )}
      >
        <div className="w-9 shrink-0 pt-0.5">
          {!grouped ? (
            <Avatar name={message.sender.name} src={message.sender.avatarUrl} id={message.sender.id} size="sm" />
          ) : (
            <span className="block text-center text-[9px] text-muted-foreground/0 transition group-hover:text-muted-foreground/60">
              {timeShort(message.createdAt)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!grouped ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[12px] font-semibold text-foreground">
                {message.sender.name}
                {own ? <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">you</span> : null}
              </span>
              <span className="text-[9.5px] text-muted-foreground">{timeShort(message.createdAt)}</span>
              {message.editedAt ? <span className="text-[9px] text-muted-foreground/70">edited</span> : null}
              {message.forwardedFrom ? (
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Forward className="h-2.5 w-2.5" /> forwarded from {message.forwardedFrom.senderName}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="relative">
            {message.replyTo ? (
              <button
                type="button"
                onClick={() => onJump(message.replyTo!.id)}
                className="mb-1 flex max-w-full items-center gap-1.5 rounded-md border-l-2 border-signal/50 bg-secondary/40 px-2 py-1 text-left transition hover:bg-secondary/70"
              >
                <Reply className="h-2.5 w-2.5 shrink-0 text-signal" />
                <span className="shrink-0 text-[10px] font-medium text-signal">{message.replyTo.sender.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {message.replyTo.deletedAt ? "deleted message" : message.replyTo.body}
                </span>
              </button>
            ) : null}

            {deleted ? (
              <p className="flex items-center gap-1.5 py-0.5 text-[12px] italic text-muted-foreground/70">
                <Trash2 className="h-3 w-3" /> This message was deleted.
              </p>
            ) : editing ? (
              <div className="mt-1 max-w-[620px]">
                <Textarea
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                  rows={3}
                  className="text-[13px]"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(false);
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void saveEdit();
                    }
                  }}
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <Button size="sm" onClick={() => void saveEdit()} loading={saving}>
                    Save changes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <span className="text-[9px] text-muted-foreground">Esc to cancel · Enter to save</span>
                </div>
              </div>
            ) : message.body ? (
              <p className="message-body text-[13.5px] text-foreground/95">
                {renderBody(message.body, message.mentions)}
              </p>
            ) : null}

            {!deleted && message.attachments.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2">
                {message.attachments.map((attachment) => (
                  <AttachmentView key={attachment.id} attachment={attachment} />
                ))}
              </div>
            ) : null}

            {!deleted && message.contextCards.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.contextCards.map((card) => (
                  <ContextCardView key={card.id} card={card} onInfo={onInfo} />
                ))}
              </div>
            ) : null}

            {!deleted && message.poll ? <PollView message={message} /> : null}

            {!deleted && message.reactions.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => void toggleReaction(message.id, reaction.emoji).catch((error) => toast.error(errorMessage(error)))}
                    title={reaction.userIds.length === 1 ? "1 reaction" : `${reaction.userIds.length} reactions`}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition",
                      reaction.mine
                        ? "border-signal/50 bg-signal/10 text-signal"
                        : "border-border bg-secondary/40 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    <span className="text-[11px] leading-none">{reaction.emoji}</span>
                    <span className="tabular-nums">{reaction.count}</span>
                  </button>
                ))}
                <ReactionPicker messageId={message.id} />
              </div>
            ) : null}

            <div className="mt-1 flex items-center gap-1.5">
              {own && !deleted ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[9px]",
                    receipt.status === "READ" ? "text-signal/80" : "text-muted-foreground/60",
                  )}
                  title={`${receipt.readCount} read · ${receipt.deliveredCount} delivered · ${receipt.recipientCount} recipients`}
                >
                  {receipt.status === "READ" ? (
                    <CheckCheck className="h-3 w-3" />
                  ) : receipt.status === "DELIVERED" ? (
                    <CheckCheck className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {receipt.recipientCount > 1
                    ? `${receipt.readCount}/${receipt.recipientCount} read`
                    : receipt.status === "READ"
                      ? "Read"
                      : receipt.status === "DELIVERED"
                        ? "Delivered"
                        : "Sent"}
                </span>
              ) : null}
              {message.isPinned ? (
                <span className="inline-flex items-center gap-1 text-[9px] text-signal/70">
                  <Pin className="h-2.5 w-2.5" /> pinned
                </span>
              ) : null}
              {message.isStarred ? (
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Star className="h-2.5 w-2.5 fill-current" /> saved
                </span>
              ) : null}
              {!deleted ? (
                <div className="ml-auto flex items-center gap-0.5 [@media(pointer:fine)]:hidden">
                  {message.reactions.length === 0 ? <ReactionPicker messageId={message.id} /> : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        aria-label="Message actions"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>

            {!deleted ? (
              <div className="absolute -top-8 right-1 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 opacity-0 shadow-soft transition pointer-events-none group-focus-within:pointer-events-auto group-hover:pointer-events-auto group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden">
                <ReactionPicker messageId={message.id} trigger="button" />
                <button
                  type="button"
                  onClick={() => setReplyTo(message)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Reply"
                  title="Reply"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void toggleStar(message.id).catch((error) => toast.error(errorMessage(error)))}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent",
                    message.isStarred ? "text-signal" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label={message.isStarred ? "Remove from saved" : "Save message"}
                  title={message.isStarred ? "Remove from saved" : "Save message"}
                >
                  <Star className={cn("h-3.5 w-3.5", message.isStarred && "fill-current")} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="More message actions"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm" className="p-6">
          <h3 className="font-display text-lg">Delete this message?</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            The message will be removed for everyone. Replies to it will remain, marked as deleted.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep message
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete for everyone
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReactionPicker({ messageId, trigger = "chip" }: { messageId: string; trigger?: "chip" | "button" }) {
  const { toggleReaction } = useNexa();
  const [open, setOpen] = React.useState(false);
  const react = async (emoji: string) => {
    setOpen(false);
    try {
      await toggleReaction(messageId, emoji);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger === "button" ? (
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Add reaction"
            title="Add reaction"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className="flex h-[22px] w-[26px] items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition hover:text-foreground"
            aria-label="Add reaction"
          >
            <SmilePlus className="h-3 w-3" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-2" align="start">
        <div className="grid grid-cols-6 gap-0.5">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void react(emoji)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-base transition hover:bg-accent"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
