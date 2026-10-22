"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clipboard,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { apiPost, errorMessage } from "@/lib/client/api";
import type { AskResult, DigestResult, SummaryResult } from "@/lib/client/types";
import { relative } from "@/lib/client/format";
import { cn } from "@/lib/utils";

type ComposeAction =
  | "draft"
  | "rewrite"
  | "translate"
  | "grammar"
  | "tone"
  | "explain"
  | "announcement"
  | "invitation";

type ComposeResult = {
  draft: string;
  action: ComposeAction;
  provider: string;
  model: string;
  requiresReview: boolean;
};

const composeActions: { value: ComposeAction; label: string; hint: string }[] = [
  { value: "draft", label: "Draft a message", hint: "Describe what you want to say." },
  { value: "rewrite", label: "Rewrite", hint: "Paste text to rewrite it clearly." },
  { value: "tone", label: "Adjust tone", hint: "Paste text and choose a tone." },
  { value: "grammar", label: "Fix grammar", hint: "Paste text to proofread." },
  { value: "translate", label: "Translate", hint: "Paste text and name a language." },
  { value: "announcement", label: "Announcement", hint: "Describe the announcement." },
  { value: "invitation", label: "Invitation", hint: "Describe who and what for." },
  { value: "explain", label: "Explain a message", hint: "Uses recent conversation context." },
];

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background/60 px-2.5 text-[12px] text-foreground outline-none transition focus:border-signal/50 focus:ring-2 focus:ring-signal/15";

function AiConfigCard({
  missing,
  onRefresh,
}: {
  missing: string[];
  onRefresh: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const snippet = [
    "AI_PROVIDER=gemini",
    "GEMINI_API_KEY=your-google-ai-studio-key",
    "GEMINI_MODEL=gemini-2.5-flash",
    "# or AI_PROVIDER=ollama, or AI_PROVIDER=openai with OPENAI_API_KEY",
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Configuration snippet copied.");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not access the clipboard.");
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5" /> AI is not configured
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
        Add the missing environment variables and restart the server. Every AI action fails honestly
        with a 503 until then — nothing here is simulated.
      </p>
      {missing.length ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {missing.map((item) => (
            <li key={item}>
              <code className="rounded bg-background/60 px-1.5 py-0.5 text-[9.5px] text-foreground/80">
                {item}
              </code>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="h-3 w-3 text-signal" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy setup"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          <RefreshCw className="h-3 w-3" /> Re-check
        </Button>
      </div>
    </div>
  );
}

function EvidenceChips({
  evidence,
  onJump,
}: {
  evidence: { messageId: string; excerpt: string; senderName: string; createdAt: string }[];
  onJump: (messageId: string) => void;
}) {
  if (!evidence.length) return null;
  return (
    <div className="mt-2.5">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {evidence.map((item, index) => (
          <button
            key={`${item.messageId}-${index}`}
            type="button"
            onClick={() => onJump(item.messageId)}
            className="max-w-full rounded-md border border-border bg-background/70 px-2 py-1 text-left text-[9.5px] text-muted-foreground transition hover:border-signal/40 hover:text-foreground"
            title={item.excerpt}
          >
            <span className="font-medium text-foreground/80">{item.senderName}</span> ·{" "}
            {relative(item.createdAt)} ago
          </button>
        ))}
      </div>
    </div>
  );
}

export function AiPanel({
  open,
  onClose,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  onJump: (conversationId: string, messageId: string) => void;
}) {
  const {
    activeConversation,
    ai,
    aiRefresh,
    draft,
    setDraft,
    profile,
    updateSettings,
  } = useNexa();

  const [tab, setTab] = React.useState<"ask" | "summary" | "digest" | "write">("ask");
  const [error, setError] = React.useState<string | null>(null);

  const [question, setQuestion] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [answer, setAnswer] = React.useState<AskResult | null>(null);

  const [summaryKind, setSummaryKind] = React.useState<"UNREAD" | "RANGE" | "GROUP">("UNREAD");
  const [summary, setSummary] = React.useState<SummaryResult | null>(null);
  const [summarizing, setSummarizing] = React.useState(false);
  const [addingItem, setAddingItem] = React.useState<number | null>(null);

  const [digest, setDigest] = React.useState<DigestResult | null>(null);
  const [digesting, setDigesting] = React.useState(false);
  const [enablingDigest, setEnablingDigest] = React.useState(false);

  const [composeAction, setComposeAction] = React.useState<ComposeAction>("draft");
  const [composeText, setComposeText] = React.useState("");
  const [instruction, setInstruction] = React.useState("");
  const [tone, setTone] = React.useState<"professional" | "friendly" | "concise" | "warm" | "direct">(
    "professional",
  );
  const [targetLanguage, setTargetLanguage] = React.useState("Spanish");
  const [composing, setComposing] = React.useState(false);
  const [composed, setComposed] = React.useState<ComposeResult | null>(null);

  const conversation = activeConversation;
  const configured = Boolean(ai?.configured);
  const missing = ai?.missing ?? [];
  const activeCompose = composeActions.find((item) => item.value === composeAction) ?? composeActions[0]!;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    setComposeText(draft);
  }, [draft, open]);

  if (!open || !conversation) return null;

  const jump = (messageId: string) => {
    onJump(conversation.id, messageId);
    onClose();
  };

  const ask = async () => {
    if (question.trim().length < 2) {
      toast.error("Ask a question with at least two characters.");
      return;
    }
    setAsking(true);
    setError(null);
    try {
      const data = await apiPost<AskResult>("/api/ai/ask", {
        conversationId: conversation.id,
        question: question.trim(),
      });
      setAnswer(data);
    } catch (cause) {
      setAnswer(null);
      setError(errorMessage(cause));
    } finally {
      setAsking(false);
    }
  };

  const summarize = async () => {
    setSummarizing(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        conversationId: conversation.id,
        kind: summaryKind,
      };
      if (summaryKind === "RANGE") {
        payload.from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      }
      const data = await apiPost<SummaryResult>("/api/ai/summary", payload);
      setSummary(data);
    } catch (cause) {
      setSummary(null);
      setError(errorMessage(cause));
    } finally {
      setSummarizing(false);
    }
  };

  const addActionItem = async (index: number) => {
    if (!summary) return;
    const item = summary.actionItems[index];
    if (!item) return;
    setAddingItem(index);
    try {
      const payload: Record<string, unknown> = {
        type: "TASK",
        title: item.text.slice(0, 200),
        content: [item.owner ? `Owner: ${item.owner}` : "", item.due ? `Due: ${item.due}` : ""]
          .filter(Boolean)
          .join("\n") || undefined,
      };
      if (item.messageIds[0]) payload.sourceMessageId = item.messageIds[0];
      await apiPost(`/api/conversations/${conversation.id}/workspace`, payload);
      toast.success("Action item added to the workspace.");
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setAddingItem(null);
    }
  };

  const generateDigest = async () => {
    setDigesting(true);
    setError(null);
    try {
      const data = await apiPost<DigestResult>("/api/ai/digest", { markAsRead: false });
      setDigest(data);
    } catch (cause) {
      setDigest(null);
      setError(errorMessage(cause));
    } finally {
      setDigesting(false);
    }
  };

  const enableDigest = async () => {
    setEnablingDigest(true);
    try {
      await updateSettings({ digestEnabled: true });
      toast.success("Smart digest enabled. Generating now…");
      await generateDigest();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setEnablingDigest(false);
    }
  };

  const compose = async () => {
    if (["rewrite", "translate", "grammar", "tone"].includes(composeAction) && !composeText.trim()) {
      toast.error("Add the text you want NEXA to work on.");
      return;
    }
    if (composeAction === "draft" && !composeText.trim() && !instruction.trim()) {
      toast.error("Describe the message you want, or paste a starting point.");
      return;
    }
    setComposing(true);
    setError(null);
    try {
      const data = await apiPost<ComposeResult>("/api/ai/compose", {
        action: composeAction,
        text: composeText.slice(0, 6000),
        conversationId: conversation.id,
        ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
        ...(composeAction === "tone" ? { tone } : {}),
        ...(composeAction === "translate" ? { targetLanguage: targetLanguage.trim() } : {}),
      });
      setComposed(data);
    } catch (cause) {
      setComposed(null);
      setError(errorMessage(cause));
    } finally {
      setComposing(false);
    }
  };

  const insertDraft = () => {
    if (!composed) return;
    setDraft(composed.draft);
    toast.success("Draft inserted into the composer. Review before sending.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="NEXA AI assistant">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close AI assistant"
      />
      <aside className="absolute inset-y-0 right-0 flex w-[min(100vw,460px)] flex-col border-l border-border bg-card shadow-lift">
        <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-signal">
              <Sparkles className="h-3 w-3" /> NEXA AI
            </p>
            <h2 className="mt-0.5 font-display text-xl">Ask this conversation.</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={aiRefresh}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Refresh AI status"
              title="Refresh AI status"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-border/60 px-4 py-3">
            {ai === null ? (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the configured provider…
              </div>
            ) : configured ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="signal">
                  <span className="h-1 w-1 rounded-full bg-signal" /> {ai.provider}
                </Badge>
                <code className="rounded bg-background/70 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                  {ai.model}
                </code>
                <span className="text-[9px] text-muted-foreground">
                  timeout {Math.round(ai.timeoutMs / 1000)}s
                </span>
                {ai.embeddings.configured ? (
                  <Badge tone="outline">embeddings on</Badge>
                ) : (
                  <Badge tone="outline">lexical search</Badge>
                )}
              </div>
            ) : (
              <AiConfigCard missing={missing} onRefresh={aiRefresh} />
            )}
          </div>

          {error ? (
            <div className="mx-4 mt-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2.5 text-[10.5px] leading-relaxed text-danger">
              {error}
            </div>
          ) : null}

          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <div className="px-4 pt-3">
              <TabsList className="w-full gap-0.5 rounded-lg border border-border/60 bg-background/30 p-1">
                <TabsTrigger value="ask">Ask</TabsTrigger>
                <TabsTrigger value="summary">Summarize</TabsTrigger>
                <TabsTrigger value="digest">Digest</TabsTrigger>
                <TabsTrigger value="write">Write</TabsTrigger>
              </TabsList>
            </div>

            {/* ---------------------------------- ask ---------------------------------- */}
            <TabsContent value="ask" className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="ai-question">Question</Label>
                <Textarea
                  id="ai-question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="What did we decide about the launch date? Who owns the migration?"
                  className="text-[12.5px]"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void ask();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">Ctrl/⌘ + Enter to ask</span>
                  <Button
                    size="sm"
                    variant="signal"
                    loading={asking}
                    disabled={!configured}
                    onClick={() => void ask()}
                  >
                    <Send className="h-3 w-3" /> Ask
                  </Button>
                </div>
              </div>

              {!answer && !asking ? (
                <EmptyState
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Answers with receipts"
                  description="NEXA only cites messages from this conversation. If the context is missing, it says so instead of guessing."
                  className="py-8"
                />
              ) : null}

              {answer ? (
                <div className="rounded-xl border border-signal/25 bg-signal/[0.05] p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-signal">
                      <Sparkles className="h-2.5 w-2.5" /> Grounded answer
                    </span>
                    <Badge tone={answer.confidence === "high" ? "signal" : "outline"}>
                      {answer.confidence} confidence
                    </Badge>
                    <span className="ml-auto text-[9px] text-muted-foreground">
                      {answer.messagesUsed} messages read
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/90">
                    {answer.answer}
                  </p>
                  {answer.insufficientInformation ? (
                    <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/[0.05] px-2 py-1.5 text-[9.5px] leading-relaxed text-amber-500">
                      The model could not fully ground this answer in the available messages.
                    </p>
                  ) : null}
                  <EvidenceChips evidence={answer.evidence} onJump={jump} />
                  {answer.provider ? (
                    <p className="mt-2 text-[8.5px] text-muted-foreground/60">
                      {answer.provider} · {answer.model}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </TabsContent>

            {/* -------------------------------- summary -------------------------------- */}
            <TabsContent value="summary" className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-background/30 p-1">
                {(
                  [
                    { key: "UNREAD", label: "Unread" },
                    { key: "RANGE", label: "7 days" },
                    { key: "GROUP", label: "Everything" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSummaryKind(option.key)}
                    className={cn(
                      "h-7 rounded-md text-[10.5px] font-medium transition",
                      summaryKind === option.key
                        ? "bg-secondary text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button
                variant="signal"
                size="sm"
                className="w-full"
                loading={summarizing}
                disabled={!configured}
                onClick={() => void summarize()}
              >
                <FileText className="h-3.5 w-3.5" /> Summarize conversation
              </Button>

              {!summary && !summarizing ? (
                <EmptyState
                  icon={<FileText className="h-4 w-4" />}
                  title="Decisions, actions, open questions"
                  description="A structured summary with decisions, owners, deadlines, and evidence. Stored so you can come back to it."
                  className="py-8"
                />
              ) : null}

              {summary ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3.5">
                  <div>
                    <h3 className="text-[12.5px] font-semibold">{summary.title}</h3>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {summary.kind.toLowerCase()} · {relative(summary.createdAt)} ago · {summary.provider}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-foreground/85">
                    {summary.summary}
                  </p>

                  {summary.decisions.length ? (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-signal">
                        Decisions
                      </p>
                      <ul className="mt-1 space-y-1">
                        {summary.decisions.map((decision, index) => (
                          <li key={index} className="flex gap-1.5 text-[10.5px] leading-relaxed text-foreground/85">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                            <span>
                              {decision.text}
                              {decision.messageIds[0] ? (
                                <button
                                  type="button"
                                  onClick={() => jump(decision.messageIds[0]!)}
                                  className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-signal hover:underline"
                                >
                                  source <ArrowUpRight className="h-2 w-2" />
                                </button>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {summary.actionItems.length ? (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-signal">
                        Action items
                      </p>
                      <ul className="mt-1 space-y-1.5">
                        {summary.actionItems.map((item, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-1.5 rounded-md border border-border/50 bg-background/40 px-2 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[10.5px] leading-relaxed text-foreground/85">{item.text}</p>
                              <p className="text-[8.5px] text-muted-foreground">
                                {[item.owner, item.due].filter(Boolean).join(" · ") || "No owner or due date"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void addActionItem(index)}
                              disabled={addingItem !== null}
                              className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[8.5px] text-muted-foreground transition hover:border-signal/40 hover:text-signal disabled:opacity-40"
                            >
                              {addingItem === index ? "Adding…" : "Add task"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {summary.unresolvedQuestions.length ? (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-500">
                        Unresolved
                      </p>
                      <ul className="mt-1 space-y-1">
                        {summary.unresolvedQuestions.map((question, index) => (
                          <li key={index} className="text-[10.5px] leading-relaxed text-muted-foreground">
                            {question.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <EvidenceChips evidence={summary.evidence} onJump={jump} />
                </div>
              ) : null}
            </TabsContent>

            {/* --------------------------------- digest -------------------------------- */}
            <TabsContent value="digest" className="space-y-3 p-4">
              <div className="rounded-lg border border-border/60 bg-background/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                A cross-conversation briefing: unread highlights, mentions, and commitments, with a
                notification saved to your inbox.
              </div>
              {!profile.settings.digestEnabled ? (
                <Button
                  variant="signal"
                  size="sm"
                  className="w-full"
                  loading={enablingDigest || digesting}
                  disabled={!configured}
                  onClick={() => void enableDigest()}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Enable &amp; generate digest
                </Button>
              ) : (
                <Button
                  variant="signal"
                  size="sm"
                  className="w-full"
                  loading={digesting}
                  disabled={!configured}
                  onClick={() => void generateDigest()}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Generate digest
                </Button>
              )}

              {!digest && !digesting ? (
                <EmptyState
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Your daily signal"
                  description="Generate a briefing of what changed since you last read. Nothing is sent anywhere except the configured AI provider."
                  className="py-8"
                />
              ) : null}

              {digest ? (
                <div className="space-y-3 rounded-xl border border-signal/25 bg-signal/[0.04] p-3.5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-signal">
                      Smart digest
                    </p>
                    <h3 className="mt-0.5 text-[13px] font-semibold">{digest.headline}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">
                      {digest.summary}
                    </p>
                  </div>
                  {digest.highlights.length ? (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Highlights
                      </p>
                      <ul className="mt-1 space-y-1">
                        {digest.highlights.map((item, index) => (
                          <li key={index} className="text-[10.5px] leading-relaxed text-foreground/85">
                            · {item.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {digest.commitments.length ? (
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Commitments
                      </p>
                      <ul className="mt-1 space-y-1">
                        {digest.commitments.map((item, index) => (
                          <li key={index} className="text-[10.5px] leading-relaxed text-foreground/85">
                            · {item.text}
                            {item.due ? <span className="text-muted-foreground"> · {item.due}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <EvidenceChips evidence={digest.evidence} onJump={jump} />
                </div>
              ) : null}
            </TabsContent>

            {/* ---------------------------------- write -------------------------------- */}
            <TabsContent value="write" className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="ai-action">Action</Label>
                <select
                  id="ai-action"
                  value={composeAction}
                  onChange={(event) => setComposeAction(event.target.value as ComposeAction)}
                  className={selectClass}
                >
                  {composeActions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="text-[9px] text-muted-foreground">{activeCompose.hint}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-compose-text">Text</Label>
                <Textarea
                  id="ai-compose-text"
                  value={composeText}
                  onChange={(event) => setComposeText(event.target.value)}
                  rows={5}
                  maxLength={6000}
                  placeholder={
                    composeAction === "draft"
                      ? "e.g. Tell the team the release moved to Thursday and ask who can own QA."
                      : "Paste the text you want NEXA to work on."
                  }
                  className="text-[12px]"
                />
                <div className="flex justify-end">
                  <span className="text-[8.5px] tabular-nums text-muted-foreground">
                    {composeText.length}/6000
                  </span>
                </div>
              </div>

              {composeAction === "tone" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ai-tone">Tone</Label>
                  <select
                    id="ai-tone"
                    value={tone}
                    onChange={(event) => setTone(event.target.value as typeof tone)}
                    className={selectClass}
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="concise">Concise</option>
                    <option value="warm">Warm</option>
                    <option value="direct">Direct</option>
                  </select>
                </div>
              ) : null}

              {composeAction === "translate" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ai-language">Target language</Label>
                  <Input
                    id="ai-language"
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    maxLength={40}
                    className="h-9 text-[12px]"
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="ai-instruction">Extra direction (optional)</Label>
                <Input
                  id="ai-instruction"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  maxLength={1000}
                  placeholder="Shorter, no jargon, mention the deadline…"
                  className="h-9 text-[12px]"
                />
              </div>

              <Button
                variant="signal"
                size="sm"
                className="w-full"
                loading={composing}
                disabled={!configured}
                onClick={() => void compose()}
              >
                <Wand2 className="h-3.5 w-3.5" /> Generate draft
              </Button>

              {composed ? (
                <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-signal">
                      Draft · review required
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(composed.draft);
                          toast.success("Draft copied.");
                        } catch {
                          toast.error("Could not access the clipboard.");
                        }
                      }}
                      className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground"
                    >
                      <Clipboard className="h-2.5 w-2.5" /> Copy
                    </button>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-foreground/85">
                    {composed.draft}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Button size="sm" variant="signal" onClick={insertDraft}>
                      Insert into composer
                    </Button>
                    <span className="text-[8.5px] text-muted-foreground">{composed.model}</span>
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>

        <footer className="border-t border-border/70 px-4 py-2.5 text-[9px] leading-relaxed text-muted-foreground">
          AI reads conversation messages on the server when you invoke it. NEXA is not end-to-end
          encrypted; see the privacy docs before sharing sensitive material.
        </footer>
      </aside>
    </div>
  );
}
