"use client";

import * as React from "react";
import {
  BarChart3,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Reply,
  Send,
  Smile,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import type { Attachment } from "@/lib/client/types";
import { errorMessage, uploadFile } from "@/lib/client/api";
import { COMPOSER_EMOJIS } from "@/lib/client/emoji";
import { formatBytes } from "@/lib/client/format";
import { cn } from "@/lib/utils";

type PendingAttachment = {
  key: string;
  file: File;
  previewUrl: string | null;
  status: "uploading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
};

type PollDraft = {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  closesInHours?: number;
};

async function imageSize(file: File) {
  if (!file.type.startsWith("image/")) return {};
  return new Promise<{ width?: number; height?: number }>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

export function Composer({ onOpenAi }: { onOpenAi: () => void }) {
  const {
    activeConversation,
    replyTo,
    setReplyTo,
    draft,
    setDraft,
    sendMessage,
    sending,
    sendTyping,
  } = useNexa();

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = React.useRef(false);

  const [pending, setPending] = React.useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = React.useState(false);
  const [pollOpen, setPollOpen] = React.useState(false);
  const [poll, setPoll] = React.useState<PollDraft | null>(null);
  const [pollQuestion, setPollQuestion] = React.useState("");
  const [pollOptions, setPollOptions] = React.useState(["", ""]);
  const [pollMultiple, setPollMultiple] = React.useState(false);
  const [pollCloses, setPollCloses] = React.useState("");

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [draft]);

  React.useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      sendTyping(false);
    };
  }, [sendTyping]);

  React.useEffect(() => {
    setPending((items) => {
      for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    setPoll(null);
  }, [activeConversation?.id]);

  const stopTypingSoon = React.useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      sendTyping(false);
      typingActive.current = false;
    }, 1800);
  }, [sendTyping]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!typingActive.current) {
      typingActive.current = true;
      sendTyping(true);
    }
    stopTypingSoon();
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    if (pending.filter((item) => item.status !== "error").length + list.length > 10) {
      toast.error("You can attach up to 10 files to one message.");
      return;
    }
    const entries: PendingAttachment[] = list.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      status: "uploading",
    }));
    setPending((current) => [...current, ...entries]);

    for (const entry of entries) {
      try {
        const meta = await imageSize(entry.file);
        const data = await uploadFile(entry.file, meta);
        setPending((current) =>
          current.map((item) =>
            item.key === entry.key ? { ...item, status: "ready", attachment: data.attachment } : item,
          ),
        );
      } catch (error) {
        setPending((current) =>
          current.map((item) =>
            item.key === entry.key
              ? { ...item, status: "error", error: errorMessage(error) }
              : item,
          ),
        );
        toast.error(`${entry.file.name}: ${errorMessage(error)}`);
      }
    }
  };

  const removePending = (key: string) => {
    setPending((current) => {
      const entry = current.find((item) => item.key === key);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onDraftChange(`${draft}${emoji}`);
      return;
    }
    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    onDraftChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const submit = async () => {
    const attachments = pending.filter((item) => item.status === "ready" && item.attachment);
    const uploading = pending.some((item) => item.status === "uploading");
    if (uploading) {
      toast.error("Wait for your attachments to finish uploading.");
      return;
    }
    if (!draft.trim() && attachments.length === 0 && !poll) return;
    if (sending) return;
    try {
      await sendMessage({
        body: draft.trim(),
        replyToId: replyTo?.id ?? null,
        attachmentIds: attachments.flatMap((item) => (item.attachment ? [item.attachment.id] : [])),
        ...(poll
          ? {
              poll: {
                question: poll.question,
                options: poll.options,
                allowsMultiple: poll.allowsMultiple,
                ...(poll.closesInHours ? { closesInHours: poll.closesInHours } : {}),
              },
            }
          : {}),
      });
      setPending((current) => {
        for (const item of current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        return [];
      });
      setPoll(null);
      setDraft("");
      setReplyTo(null);
      sendTyping(false);
      typingActive.current = false;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.focus();
        }
      });
    } catch {
      /* the store already surfaces the error */
    }
  };

  const openPoll = () => {
    setPollQuestion(poll?.question ?? "");
    setPollOptions(poll?.options ?? ["", ""]);
    setPollMultiple(poll?.allowsMultiple ?? false);
    setPollCloses(poll?.closesInHours ? String(poll.closesInHours) : "");
    setPollOpen(true);
  };

  const savePoll = () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (question.length < 3) {
      toast.error("Give your poll a question of at least 3 characters.");
      return;
    }
    if (options.length < 2) {
      toast.error("Add at least two answer options.");
      return;
    }
    const hours = pollCloses ? Number(pollCloses) : null;
    if (pollCloses && (hours === null || !Number.isFinite(hours) || hours <= 0)) {
      toast.error("Enter a valid number of hours for the poll to stay open.");
      return;
    }
    setPoll({
      question,
      options,
      allowsMultiple: pollMultiple,
      ...(hours ? { closesInHours: Math.min(24 * 30, Math.round(hours)) } : {}),
    });
    setPollOpen(false);
  };

  const readyCount = pending.filter((item) => item.status === "ready").length;
  const canSend = Boolean(draft.trim() || readyCount || poll) && !sending;
  const isRoom = activeConversation?.type === "ROOM";

  return (
    <div className="relative border-t border-border/70 bg-card/30 px-3 pb-3 pt-2.5 sm:px-5 sm:pb-4">
      {replyTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2">
          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-signal">Replying to {replyTo.sender.name}</p>
            <p className="truncate text-[10.5px] text-muted-foreground">{replyTo.body || "Attachment or poll"}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((item) => (
            <div
              key={item.key}
              className="group relative flex items-center gap-2 rounded-lg border border-border bg-background/70 px-2 py-1.5"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded bg-secondary text-muted-foreground">
                  {item.file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
              )}
              <div className="min-w-0 max-w-[160px]">
                <p className="truncate text-[10px] font-medium">{item.file.name}</p>
                <p className="text-[9px] text-muted-foreground">
                  {item.status === "uploading" ? "Uploading…" : item.status === "error" ? item.error : formatBytes(item.file.size)}
                </p>
              </div>
              {item.status === "uploading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  onClick={() => removePending(item.key)}
                  className="rounded p-0.5 text-muted-foreground hover:text-danger"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {poll ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-signal/30 bg-signal/[0.06] px-3 py-2">
          <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-signal">Poll</p>
            <p className="truncate text-[11px]">{poll.question}</p>
            <p className="truncate text-[9.5px] text-muted-foreground">{poll.options.join(" · ")}</p>
          </div>
          <button
            type="button"
            onClick={() => setPoll(null)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Remove poll"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border bg-background/60 transition",
          dragActive ? "border-signal/60 bg-signal/[0.04]" : "border-border/80 focus-within:border-border",
        )}
      >
        <div className="flex items-end gap-1.5 p-1.5">
          <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  aria-label="Add emoji"
                  title="Add emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[260px] p-2">
                <div className="grid grid-cols-7 gap-0.5">
                  {COMPOSER_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-base transition hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={openPoll}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-accent hover:text-foreground",
                poll ? "text-signal" : "text-muted-foreground",
              )}
              aria-label="Create a poll"
              title="Create a poll"
            >
              <BarChart3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenAi}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-signal"
              aria-label="Open AI assistant"
              title="Write with NEXA AI"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
            onPaste={(event) => {
              const files = [...event.clipboardData.files];
              if (files.length) {
                event.preventDefault();
                void addFiles(files);
              }
            }}
            rows={1}
            placeholder={
              isRoom
                ? "Message this room — it disappears when the room expires…"
                : activeConversation?.type === "DIRECT"
                  ? `Message ${activeConversation.title}…`
                  : "Write a message…"
            }
            aria-label="Message"
            className="scroll-thin max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-2 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
          />

          <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
            {draft.length > 6000 ? (
              <span className="text-[9px] tabular-nums text-muted-foreground">{draft.length}/8000</span>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition",
                canSend
                  ? "bg-signal text-signal-foreground hover:brightness-105"
                  : "bg-secondary text-muted-foreground/60",
              )}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border/50 px-2.5 py-1 text-[9px] text-muted-foreground/70">
          <span>
            <kbd className="font-sans">Enter</kbd> send · <kbd className="font-sans">Shift+Enter</kbd> new line
          </span>
          {activeConversation?.type === "ROOM" && activeConversation.expiresAt ? (
            <span className="inline-flex items-center gap-1">
              <Badge tone="danger">room</Badge>
              expires {new Date(activeConversation.expiresAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <Dialog open={pollOpen} onOpenChange={setPollOpen}>
        <DialogContent size="sm">
          <DialogHeader
            eyebrow="New poll"
            title="Ask the room."
            description="Polls are stored with the message. Everyone in the conversation can vote once."
          />
          <div className="scroll-thin max-h-[60vh] space-y-4 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label htmlFor="poll-question">Question</Label>
              <Input
                id="poll-question"
                value={pollQuestion}
                onChange={(event) => setPollQuestion(event.target.value)}
                placeholder="Which launch date works?"
                maxLength={300}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <span className="text-[9px] text-muted-foreground">{pollOptions.length}/10</span>
              </div>
              {pollOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-4 text-center text-[10px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    value={option}
                    onChange={(event) =>
                      setPollOptions((current) =>
                        current.map((value, i) => (i === index ? event.target.value : value)),
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))}
                      className="rounded p-1 text-muted-foreground hover:text-danger"
                      aria-label={`Remove option ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
              {pollOptions.length < 10 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions((current) => [...current, ""])}
                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[10.5px] text-muted-foreground transition hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add option
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/30 px-3 py-2.5">
              <div>
                <p className="text-[11px] font-medium">Allow multiple choices</p>
                <p className="text-[9.5px] text-muted-foreground">Voters can pick more than one option.</p>
              </div>
              <Switch checked={pollMultiple} onCheckedChange={setPollMultiple} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="poll-closes">Close after hours (optional)</Label>
              <Input
                id="poll-closes"
                type="number"
                min={1}
                max={720}
                value={pollCloses}
                onChange={(event) => setPollCloses(event.target.value)}
                placeholder="No deadline"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/70 px-6 py-4">
            <Button variant="ghost" onClick={() => setPollOpen(false)}>
              Cancel
            </Button>
            <Button variant="signal" onClick={savePoll}>
              Attach poll
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
