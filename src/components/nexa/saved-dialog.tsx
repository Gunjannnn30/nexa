"use client";

import * as React from "react";
import { ArrowUpRight, Star } from "lucide-react";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { apiGet, errorMessage } from "@/lib/client/api";
import type { Message } from "@/lib/client/types";
import { relative } from "@/lib/client/format";
import { toast } from "sonner";

type StarredItem = {
  starredAt: string;
  message: Message;
  conversation: { id: string; type: string; title: string | null };
};

export function SavedDialog({
  open,
  onOpenChange,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: (conversationId: string, messageId: string) => void;
}) {
  const { toggleStar } = useNexa();
  const [items, setItems] = React.useState<StarredItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: StarredItem[] }>("/api/messages/starred");
      setItems(data.items);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="flex max-h-[82vh] flex-col p-0">
        <DialogHeader
          eyebrow="Saved"
          title="Your starred messages."
          description="A private shelf of decisions, links, and lines you want to find again."
        />
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl border border-border/60 p-3">
                  <Skeleton className="h-2.5 w-32" />
                  <Skeleton className="mt-2 h-3 w-5/6" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Star className="h-4 w-4" />}
              title="Nothing saved yet"
              description="Hover a message and press the star to keep it here. Saved messages stay private to you."
              className="py-14"
            />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.message.id}>
                  <div className="group rounded-xl border border-border/70 bg-card/40 p-3 transition hover:border-border">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-signal">
                        {item.conversation.title ?? "Conversation"}
                      </span>
                      <Badge tone="outline">{item.message.sender.name}</Badge>
                      <span className="ml-auto text-[9px] text-muted-foreground">
                        {relative(item.starredAt)} ago
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onJump(item.message.conversationId, item.message.id);
                        onOpenChange(false);
                      }}
                      className="mt-2 flex w-full items-start gap-2 text-left"
                    >
                      <span className="line-clamp-3 flex-1 text-[12px] leading-relaxed text-foreground/90">
                        {item.message.deletedAt ? "This message was deleted." : item.message.body || "Attachment only"}
                      </span>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition group-hover:text-signal" />
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await toggleStar(item.message.id);
                            setItems((current) => current.filter((entry) => entry.message.id !== item.message.id));
                          } catch (error) {
                            toast.error(errorMessage(error));
                          }
                        }}
                        className="text-[9.5px] text-muted-foreground underline decoration-border underline-offset-4 transition hover:text-foreground"
                      >
                        Remove from saved
                      </button>
                      <span className="text-[9px] text-muted-foreground/70">
                        saved {new Date(item.starredAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
