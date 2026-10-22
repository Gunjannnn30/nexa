"use client";

import * as React from "react";
import { ArrowUpRight, Search, Sparkles, X } from "lucide-react";
import {
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  EmptyState,
  Input,
  Spinner,
  Switch,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { apiGet, errorMessage } from "@/lib/client/api";
import type { SearchResponse, SearchResult } from "@/lib/client/types";
import { relative } from "@/lib/client/format";
import { cn } from "@/lib/utils";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={index} className="rounded bg-signal/20 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

export function SearchDialog({
  open,
  onOpenChange,
  initialScope,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialScope: "all" | "conversation";
  onJump: (conversationId: string, messageId: string) => void;
}) {
  const { activeConversation } = useNexa();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const requestRef = React.useRef(0);

  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<"all" | "conversation">(initialScope);
  const [semantic, setSemantic] = React.useState(false);
  const [data, setData] = React.useState<SearchResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setScope(initialScope);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialScope]);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: trimmed, limit: "25" });
        if (scope === "conversation" && activeConversation) params.set("conversationId", activeConversation.id);
        if (semantic) params.set("semantic", "true");
        const response = await apiGet<SearchResponse>(`/api/search?${params.toString()}`);
        if (requestRef.current === id) setData(response);
      } catch (cause) {
        if (requestRef.current === id) {
          setError(errorMessage(cause));
          setData(null);
        }
      } finally {
        if (requestRef.current === id) setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, scope, semantic, open, activeConversation]);

  const jump = (result: SearchResult) => {
    onJump(result.conversation.id, result.message.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="flex max-h-[82vh] flex-col p-0">
        <DialogHeader
          eyebrow="Search"
          title="Find anything said."
          description="Full-text search across your conversations, or turn on semantic search to ask a question."
        />
        <div className="border-b border-border/70 px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages, files, decisions…"
              className="h-11 pl-10 pr-9 text-[13px]"
              aria-label="Search query"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border/70 bg-background/40 p-0.5">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-medium transition",
                  scope === "all" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                Everywhere
              </button>
              <button
                type="button"
                onClick={() => setScope("conversation")}
                disabled={!activeConversation}
                className={cn(
                  "max-w-[170px] truncate rounded-md px-2.5 py-1 text-[10px] font-medium transition disabled:opacity-40",
                  scope === "conversation" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
                title={activeConversation ? `Only in ${activeConversation.title}` : "Open a conversation first"}
              >
                {activeConversation ? `In ${activeConversation.title}` : "This conversation"}
              </button>
            </div>

            <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-2.5 py-1.5">
              <Sparkles className={cn("h-3 w-3", semantic ? "text-signal" : "text-muted-foreground")} />
              <span className="text-[10px] font-medium text-muted-foreground">Semantic + answer</span>
              <Switch checked={semantic} onCheckedChange={setSemantic} />
            </label>
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[11px] text-muted-foreground">
              <Spinner /> Searching your workspace…
            </div>
          ) : error ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-foreground">Search could not run.</p>
              <p className="mx-auto mt-1.5 max-w-[44ch] text-[11px] leading-relaxed text-muted-foreground">{error}</p>
            </div>
          ) : !query.trim() || query.trim().length < 2 ? (
            <EmptyState
              icon={<Search className="h-4 w-4" />}
              title="Search with intent"
              description="Try a person's name, a phrase from a decision, or a file name. Turn on semantic search to ask a question and get a grounded answer with evidence."
              className="py-14"
            />
          ) : data ? (
            <div className="p-4">
              {semantic && data.answer ? (
                <div className="mb-4 rounded-xl border border-signal/25 bg-signal/[0.05] p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal">
                    <Sparkles className="h-3 w-3" /> Grounded answer
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/90">
                    {data.answer}
                  </p>
                  {data.evidence?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {data.evidence.map((item) => (
                        <button
                          key={item.messageId}
                          type="button"
                          onClick={() => {
                            const result = data.results.find((entry) => entry.message.id === item.messageId);
                            if (result) jump(result);
                          }}
                          className="rounded-md border border-border bg-background/70 px-2 py-1 text-left text-[9.5px] text-muted-foreground transition hover:border-signal/40 hover:text-foreground"
                          title={item.excerpt}
                        >
                          {item.senderName} · {relative(item.createdAt)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {data.insufficientInformation ? (
                    <p className="mt-2 text-[9.5px] text-muted-foreground">
                      The model could not fully ground this answer in your messages.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {data.interpreted ? (
                <p className="mb-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Interpreted as:</span>{" "}
                  {data.interpreted.explanation}
                </p>
              ) : null}

              {data.notice ? (
                <p className="mb-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                  {data.notice}
                </p>
              ) : null}

              {data.results.length === 0 ? (
                <EmptyState
                  title="No matches"
                  description="Try a shorter phrase, search everywhere instead of this conversation, or turn off semantic search."
                  className="py-12"
                />
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {data.results.length} {data.results.length === 1 ? "result" : "results"}
                    </span>
                    <Badge tone="outline">{data.mode}</Badge>
                  </div>
                  <ul className="space-y-1">
                    {data.results.map((result) => (
                      <li key={`${result.message.id}-${result.conversation.id}`}>
                        <button
                          type="button"
                          onClick={() => jump(result)}
                          className="group flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-border hover:bg-secondary/40"
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-[9px] font-semibold text-muted-foreground">
                            {result.conversation.type === "DIRECT" ? "DM" : result.conversation.type === "ROOM" ? "RM" : "GR"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="truncate text-[11px] font-semibold">{result.conversation.title}</span>
                              <span className="text-[9.5px] text-muted-foreground">
                                {result.message.sender.name} · {relative(result.message.createdAt)}
                              </span>
                              {result.matchKind === "semantic" ? <Badge tone="signal">semantic</Badge> : null}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-muted-foreground group-hover:text-foreground/80">
                              {result.message.deletedAt ? (
                                "This message was deleted."
                              ) : result.message.body ? (
                                <Highlight text={result.message.body} query={query} />
                              ) : (
                                `${result.message.attachments.length || 1} attachment`
                              )}
                            </span>
                          </span>
                          <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition group-hover:text-signal" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-[11px] text-muted-foreground">
              Type at least two characters.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border/70 px-5 py-2.5 text-[9.5px] text-muted-foreground">
          <span>Results respect conversation membership server-side.</span>
          <span className="hidden sm:inline">Esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
