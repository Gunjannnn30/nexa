"use client";

import * as React from "react";
import { Check, Forward, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  EmptyState,
  Input,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { errorMessage } from "@/lib/client/api";
import type { Conversation, Message } from "@/lib/client/types";
import { cn } from "@/lib/utils";

function typeLabel(conversation: Conversation) {
  if (conversation.type === "DIRECT") return "Direct";
  if (conversation.type === "ROOM") return "Room";
  if (conversation.type === "BRANCH") return "Thread";
  return "Group";
}

export function ForwardDialog({
  message,
  onOpenChange,
}: {
  message: Message | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { conversations, forwardMessage, presence } = useNexa();
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (message) {
      setSelected([]);
      setQuery("");
    }
  }, [message]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((conversation) => !q || conversation.title.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
  }, [conversations, query]);

  const toggle = (conversationId: string) => {
    setSelected((prev) =>
      prev.includes(conversationId)
        ? prev.filter((id) => id !== conversationId)
        : [...prev, conversationId],
    );
  };

  const submit = async () => {
    if (!message || selected.length === 0) return;
    setSending(true);
    try {
      await forwardMessage(message.id, selected);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const excerpt = message?.deletedAt
    ? "This message was deleted."
    : (message?.body.trim() || (message?.attachments.length ? "Attachment" : "Message"));

  return (
    <Dialog open={Boolean(message)} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="flex max-h-[min(88vh,700px)] flex-col">
        <DialogHeader
          title="Forward message"
          description="Pick one or more conversations. The message is copied, not moved."
          eyebrow="Share"
        />

        <div className="flex flex-col gap-4 overflow-hidden px-6 py-5">
          <div className="rounded-xl border border-border/70 bg-background/50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {message ? `From ${message.sender.name}` : "Message"}
            </p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground/85">
              {excerpt}
            </p>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter conversations"
              className="h-9 pl-9 text-xs"
              aria-label="Filter conversations to forward to"
            />
          </div>

          <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {visible.length === 0 ? (
              <EmptyState
                icon={<Forward className="h-4 w-4" />}
                title="No conversations found"
                description="Try a different filter or start a new conversation first."
              />
            ) : (
              <ul className="space-y-1" role="listbox" aria-multiselectable="true" aria-label="Conversations">
                {visible.map((conversation) => {
                  const active = selected.includes(conversation.id);
                  const peerOnline = conversation.peer
                    ? Boolean(presence[conversation.peer.id]?.online)
                    : false;
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => toggle(conversation.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                          active
                            ? "border-signal/45 bg-signal/[0.07]"
                            : "border-transparent hover:border-border/70 hover:bg-secondary/50",
                        )}
                      >
                        <Avatar
                          name={conversation.title}
                          src={conversation.avatarUrl}
                          id={conversation.id}
                          size="md"
                          online={peerOnline}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-medium">{conversation.title}</span>
                            {conversation.isFavorite ? <Check className="h-2.5 w-2.5 text-signal" /> : null}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Badge tone="outline" className="px-1.5 py-0 text-[8.5px]">
                              {typeLabel(conversation)}
                            </Badge>
                            <span className="truncate">
                              {conversation.type === "DIRECT"
                                ? "Direct message"
                                : `${conversation.members.length} members`}
                            </span>
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                            active
                              ? "border-signal bg-signal text-signal-foreground"
                              : "border-border bg-background/40 text-transparent",
                          )}
                          aria-hidden
                        >
                          <Check className="h-3 w-3" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            {selected.length === 0
              ? "Nothing selected yet"
              : `${selected.length} conversation${selected.length === 1 ? "" : "s"} selected`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="signal"
              size="sm"
              loading={sending}
              disabled={selected.length === 0 || Boolean(message?.deletedAt)}
              onClick={() => void submit()}
            >
              <Forward className="h-3.5 w-3.5" />
              Forward
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
