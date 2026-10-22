"use client";

import * as React from "react";
import {
  Archive,
  ArrowUpRight,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  GitBranch,
  Hash,
  Image as ImageIcon,
  ListChecks,
  ListTodo,
  LogOut,
  Mail,
  Music,
  Pencil,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  SectionTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import type { InfoTab } from "@/components/nexa/types";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/client/api";
import type {
  Branch,
  ConversationMember,
  Message,
  PublicUser,
  TimelineEvent,
  Workspace,
  WorkspaceItem,
} from "@/lib/client/types";
import { formatBytes, relative, timeShort } from "@/lib/client/format";
import { cn } from "@/lib/utils";

const tabs: { key: InfoTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "members", label: "Members" },
  { key: "files", label: "Files" },
  { key: "tasks", label: "Tasks" },
  { key: "timeline", label: "Timeline" },
  { key: "branches", label: "Threads" },
];

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background/60 px-2.5 text-[12px] text-foreground outline-none transition focus:border-signal/50 focus:ring-2 focus:ring-signal/15";

const timelineIcons: Record<TimelineEvent["kind"], typeof Pin> = {
  decision: ListChecks,
  task: ListTodo,
  deadline: Clock3,
  file: FileText,
  pin: Pin,
  summary: Star,
  branch: GitBranch,
};

const fileIcon = (mime: string | null | undefined) => {
  if (mime?.startsWith("image/")) return ImageIcon;
  if (mime?.startsWith("video/")) return Video;
  if (mime?.startsWith("audio/")) return Music;
  return FileText;
};

export function InfoPanel({
  open,
  onClose,
  tab,
  onTabChange,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  tab: InfoTab;
  onTabChange: (tab: InfoTab) => void;
  onJump: (conversationId: string, messageId: string) => void;
}) {
  const {
    activeConversation,
    profile,
    presence,
    refreshConversations,
    conversationAction,
    leaveConversation,
    openConversation,
    togglePin,
    favoriteConversation,
    archiveConversation,
    closeConversation,
  } = useNexa();

  const conversationId = activeConversation?.id;

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [savingDetails, setSavingDetails] = React.useState(false);
  const [pins, setPins] = React.useState<Message[]>([]);
  const [workspace, setWorkspace] = React.useState<Workspace | null>(null);
  const [timeline, setTimeline] = React.useState<TimelineEvent[]>([]);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [fileFilter, setFileFilter] = React.useState("");
  const [taskFilter, setTaskFilter] = React.useState<"ALL" | "OPEN" | "DONE">("ALL");
  const [newTask, setNewTask] = React.useState({ title: "", type: "TASK", due: "", assigneeId: "" });
  const [creatingTask, setCreatingTask] = React.useState(false);
  const [memberQuery, setMemberQuery] = React.useState("");
  const [memberResults, setMemberResults] = React.useState<PublicUser[]>([]);
  const [searchingMembers, setSearchingMembers] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviting, setInviting] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<ConversationMember | null>(null);

  const conversation = activeConversation;
  const canModerate = conversation?.role === "OWNER" || conversation?.role === "ADMIN";
  const canEditDetails = Boolean(conversation && conversation.type !== "DIRECT" && canModerate);
  const isOwner = conversation?.role === "OWNER";
  const muted = Boolean(
    conversation?.mutedUntil && new Date(conversation.mutedUntil).getTime() > Date.now(),
  );

  React.useEffect(() => {
    if (!conversation) return;
    setTitle(conversation.title);
    setDescription(conversation.description ?? "");
    setEditing(false);
  }, [conversation?.id, conversation?.title, conversation?.description, conversation]);

  const loadPins = React.useCallback(async (id: string) => {
    try {
      const data = await apiGet<{ messages: Message[] }>(`/api/conversations/${id}/pins`);
      setPins(data.messages);
    } catch {
      setPins([]);
    }
  }, []);

  const loadWorkspace = React.useCallback(async (id: string) => {
    try {
      const data = await apiGet<{ workspace: Workspace }>(`/api/conversations/${id}/workspace`);
      setWorkspace(data.workspace);
    } catch {
      setWorkspace(null);
    }
  }, []);

  const loadTimeline = React.useCallback(async (id: string) => {
    try {
      const data = await apiGet<{ events: TimelineEvent[] }>(`/api/conversations/${id}/timeline`);
      setTimeline(data.events);
    } catch {
      setTimeline([]);
    }
  }, []);

  const loadBranches = React.useCallback(async (id: string) => {
    try {
      const data = await apiGet<{ branches: Branch[] }>(`/api/conversations/${id}/branches`);
      setBranches(data.branches);
    } catch {
      setBranches([]);
    }
  }, []);

  const reloadAll = React.useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        await Promise.all([loadPins(id), loadWorkspace(id), loadTimeline(id), loadBranches(id)]);
      } finally {
        setLoading(false);
      }
    },
    [loadBranches, loadPins, loadTimeline, loadWorkspace],
  );

  React.useEffect(() => {
    if (!open || !conversationId) return;
    void reloadAll(conversationId);
  }, [open, conversationId, reloadAll]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || tab !== "members") return;
    const trimmed = memberQuery.trim();
    if (trimmed.length < 2) {
      setMemberResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingMembers(true);
      try {
        const data = await apiGet<{ users: PublicUser[] }>(
          `/api/contacts?type=search&q=${encodeURIComponent(trimmed)}`,
        );
        if (!cancelled) {
          const existing = new Set(conversation?.members.map((member) => member.user.id) ?? []);
          setMemberResults(data.users.filter((user) => !existing.has(user.id)));
        }
      } catch {
        if (!cancelled) setMemberResults([]);
      } finally {
        if (!cancelled) setSearchingMembers(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [memberQuery, open, tab, conversation?.members]);

  if (!open || !conversation) return null;

  const saveDetails = async () => {
    if (title.trim().length < 2) {
      toast.error("A conversation name needs at least two characters.");
      return;
    }
    setSavingDetails(true);
    try {
      await apiPatch(`/api/conversations/${conversation.id}`, {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
      });
      await refreshConversations();
      setEditing(false);
      toast.success("Conversation details updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingDetails(false);
    }
  };

  const runAction = async (key: string, action: () => Promise<unknown>, success?: string) => {
    setPendingAction(key);
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  const setLevel = async (level: "ALL" | "MENTIONS" | "NONE") => {
    await runAction(`level-${level}`, async () => {
      await conversationAction(conversation.id, "notification-level", { level });
      await refreshConversations();
    }, "Notification preference saved.");
  };

  const togglePinned = async (message: Message) => {
    await runAction(`pin-${message.id}`, async () => {
      await togglePin(message.id);
      await loadPins(conversation.id);
      await loadTimeline(conversation.id);
    });
  };

  const addMember = async (user: PublicUser) => {
    await runAction(`add-${user.id}`, async () => {
      await conversationAction(conversation.id, "members", { userIds: [user.id] });
      setMemberQuery("");
      setMemberResults([]);
    }, `${user.name} joined the conversation.`);
  };

  const sendInvite = async () => {
    const identifier = inviteEmail.trim();
    if (identifier.length < 3) {
      toast.error("Enter a username or email address.");
      return;
    }
    setInviting(true);
    try {
      await apiPost(`/api/conversations/${conversation.id}/invite`, { identifier });
      setInviteEmail("");
      toast.success("Invitation sent. They will see it in their inbox.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member: ConversationMember) => {
    const nextRole = member.role === "ADMIN" ? "MEMBER" : "ADMIN";
    await runAction(`role-${member.id}`, async () => {
      await conversationAction(conversation.id, "role", { userId: member.user.id, role: nextRole });
    }, nextRole === "ADMIN" ? "Member promoted to admin." : "Member changed to member.");
  };

  const removeMember = async (member: ConversationMember) => {
    await runAction(`remove-${member.id}`, async () => {
      await conversationAction(conversation.id, "remove-member", { userId: member.user.id });
      setRemoveTarget(null);
    }, `${member.user.name} was removed.`);
  };

  const createTask = async () => {
    if (newTask.title.trim().length < 1) {
      toast.error("Give the task a title.");
      return;
    }
    setCreatingTask(true);
    try {
      const payload: Record<string, unknown> = {
        type: newTask.type,
        title: newTask.title.trim(),
      };
      if (newTask.due) payload.dueAt = new Date(`${newTask.due}T00:00:00`).toISOString();
      if (newTask.assigneeId) payload.assigneeId = newTask.assigneeId;
      await apiPost(`/api/conversations/${conversation.id}/workspace`, payload);
      setNewTask({ title: "", type: "TASK", due: "", assigneeId: "" });
      await loadWorkspace(conversation.id);
      await loadTimeline(conversation.id);
      toast.success("Added to the conversation workspace.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreatingTask(false);
    }
  };

  const updateTaskStatus = async (item: WorkspaceItem, status: "TODO" | "DONE" | "IN_PROGRESS") => {
    await runAction(`task-${item.id}`, async () => {
      await apiPatch(`/api/conversations/${conversation.id}/workspace/${item.id}`, { status });
      await loadWorkspace(conversation.id);
      await loadTimeline(conversation.id);
    });
  };

  const removeTask = async (item: WorkspaceItem) => {
    await runAction(`delete-task-${item.id}`, async () => {
      await apiDelete(`/api/conversations/${conversation.id}/workspace/${item.id}`);
      await loadWorkspace(conversation.id);
      await loadTimeline(conversation.id);
    }, "Workspace item deleted.");
  };

  const deleteConversation = async () => {
    await runAction("delete-conversation", async () => {
      await apiDelete(`/api/conversations/${conversation.id}`);
      await refreshConversations();
      closeConversation();
      setConfirmDelete(false);
      onClose();
    }, "Conversation deleted.");
  };

  const files = timeline.filter((event) => event.kind === "file");
  const visibleFiles = fileFilter.trim()
    ? files.filter((event) =>
        event.title.toLowerCase().includes(fileFilter.trim().toLowerCase()),
      )
    : files;
  const items = workspace?.items ?? [];
  const visibleItems = items.filter((item) =>
    taskFilter === "ALL" ? true : taskFilter === "DONE" ? item.status === "DONE" : item.status !== "DONE",
  );
  const openTasks = items.filter((item) => item.status !== "DONE").length;
  const onlineCount = conversation.members.filter(
    (member) => presence[member.user.id]?.online,
  ).length;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Conversation details">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close conversation details"
      />
      <aside className="absolute inset-y-0 right-0 flex w-[min(100vw,430px)] flex-col border-l border-border bg-card shadow-lift">
        <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {conversation.type === "DIRECT"
                ? "Direct message"
                : conversation.type === "ROOM"
                  ? "Expiring room"
                  : conversation.type === "BRANCH"
                    ? "Side thread"
                    : "Group conversation"}
            </p>
            <h2 className="mt-0.5 truncate font-display text-xl">{conversation.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <Tabs value={tab} onValueChange={(value) => onTabChange(value as InfoTab)} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border/70 px-3 py-2">
            <TabsList className="gap-0 sm:gap-0.5">
              {tabs.map((item) => (
                <TabsTrigger key={item.key} value={item.key}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {/* -------------------------------- overview ------------------------------- */}
            <TabsContent value="overview" className="space-y-6 p-5">
              <section className="flex items-center gap-3">
                <Avatar
                  name={conversation.title}
                  src={conversation.avatarUrl}
                  id={conversation.id}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-2">
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
                      <Textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="What is this conversation about?"
                        className="text-[12px]"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="signal" loading={savingDetails} onClick={() => void saveDetails()}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[15px] font-semibold">{conversation.title}</h3>
                        {conversation.isFavorite ? <Star className="h-3 w-3 fill-current text-signal" /> : null}
                        {canEditDetails ? (
                          <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label="Edit conversation details"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {conversation.description || "No description yet."}
                      </p>
                      <p className="mt-1 text-[9.5px] text-muted-foreground/70">
                        {conversation.type === "DIRECT"
                          ? "Direct conversation"
                          : `${conversation.members.length} members · ${onlineCount} online`}
                        {conversation.expiresAt
                          ? ` · expires ${new Date(conversation.expiresAt).toLocaleString()}`
                          : ""}
                      </p>
                    </>
                  )}
                </div>
              </section>

              <section>
                <SectionTitle>Quick actions</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    loading={pendingAction === "favorite"}
                    onClick={() =>
                      void runAction("favorite", () =>
                        favoriteConversation(conversation.id, !conversation.isFavorite),
                      )
                    }
                  >
                    <Star className={cn("h-3.5 w-3.5", conversation.isFavorite && "fill-current text-signal")} />
                    {conversation.isFavorite ? "Unfavorite" : "Favorite"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    loading={pendingAction === "archive"}
                    onClick={() =>
                      void runAction("archive", () =>
                        archiveConversation(conversation.id, !conversation.isArchived),
                      )
                    }
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {conversation.isArchived ? "Restore" : "Archive"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    loading={pendingAction === "mute"}
                    onClick={() =>
                      void runAction("mute", () =>
                        conversationAction(conversation.id, "mute", { hours: muted ? null : 8 }),
                      )
                    }
                  >
                    {muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                    {muted ? "Unmute" : "Mute 8h"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      const anchor = document.createElement("a");
                      anchor.href = `/api/conversations/${conversation.id}/export`;
                      anchor.rel = "noopener";
                      document.body.appendChild(anchor);
                      anchor.click();
                      anchor.remove();
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Export
                  </Button>
                </div>
              </section>

              <section>
                <SectionTitle>Notifications</SectionTitle>
                <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-background/30 p-1">
                  {(
                    [
                      { level: "ALL", label: "All" },
                      { level: "MENTIONS", label: "Mentions" },
                      { level: "NONE", label: "None" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.level}
                      type="button"
                      onClick={() => void setLevel(option.level)}
                      className={cn(
                        "h-7 rounded-md text-[10.5px] font-medium transition",
                        conversation.notificationLevel === option.level
                          ? "bg-secondary text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              {conversation.members.length > 0 ? (
                <section>
                  <SectionTitle
                    action={
                      <button
                        type="button"
                        onClick={() => onTabChange("members")}
                        className="text-[10px] text-signal hover:underline"
                      >
                        See all
                      </button>
                    }
                  >
                    Members
                  </SectionTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {conversation.members.slice(0, 8).map((member) => (
                      <span
                        key={member.id}
                        className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/40 py-0.5 pl-0.5 pr-2"
                        title={`${member.user.name} · ${member.role.toLowerCase()}`}
                      >
                        <Avatar
                          name={member.user.name}
                          src={member.user.avatarUrl}
                          id={member.user.id}
                          size="xs"
                          online={Boolean(presence[member.user.id]?.online)}
                        />
                        <span className="max-w-[110px] truncate text-[10px]">
                          {member.user.id === profile.id ? "You" : member.user.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <SectionTitle action={<Badge tone="outline">{pins.length}</Badge>}>Pinned messages</SectionTitle>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : pins.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[10.5px] text-muted-foreground">
                    Pin a decision or link to keep it here for everyone.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pins.map((message) => (
                      <li key={message.id} className="rounded-lg border border-border/70 bg-background/40 p-2.5">
                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                          <Pin className="h-2.5 w-2.5 rotate-45 text-signal" />
                          <span className="font-medium text-foreground/80">{message.sender.name}</span>
                          <span>· {timeShort(message.createdAt)}</span>
                          <button
                            type="button"
                            onClick={() => void togglePinned(message)}
                            className="ml-auto rounded p-0.5 text-muted-foreground hover:text-danger"
                            aria-label="Unpin message"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onJump(conversation.id, message.id);
                            onClose();
                          }}
                          className="mt-1 block w-full truncate text-left text-[11.5px] text-foreground/85 hover:text-foreground"
                        >
                          {message.body || "Attachment"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {conversation.branch ? (
                <section>
                  <SectionTitle>Source thread</SectionTitle>
                  <button
                    type="button"
                    onClick={() => openConversation(conversation.branch!.sourceConversationId)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-left text-[11px] text-muted-foreground transition hover:text-foreground"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-signal" />
                    <span className="min-w-0 flex-1 truncate">
                      {conversation.branch.sourceConversationTitle ?? "Open source conversation"}
                    </span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </section>
              ) : null}

              <section className="border-t border-border/60 pt-4">
                <SectionTitle>Membership</SectionTitle>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-danger hover:text-danger"
                    onClick={() => setConfirmLeave(true)}
                  >
                    <LogOut className="h-3.5 w-3.5" /> Leave conversation
                  </Button>
                  {isOwner && conversation.type !== "DIRECT" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-danger hover:text-danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete conversation
                    </Button>
                  ) : null}
                  <p className="text-[9px] leading-relaxed text-muted-foreground/70">
                    Deleting removes messages and stored attachments for everyone. Leaving keeps the
                    conversation for the remaining members.
                  </p>
                </div>
              </section>
            </TabsContent>

            {/* -------------------------------- members -------------------------------- */}
            <TabsContent value="members" className="space-y-6 p-5">
              <section>
                <SectionTitle action={<Badge tone="outline">{conversation.members.length}</Badge>}>
                  People
                </SectionTitle>
                <ul className="space-y-1">
                  {conversation.members.map((member) => {
                    const state = presence[member.user.id];
                    const isSelf = member.user.id === profile.id;
                    return (
                      <li
                        key={member.id}
                        className="flex items-center gap-2.5 rounded-lg px-1.5 py-2 transition hover:bg-secondary/30"
                      >
                        <Avatar
                          name={member.user.name}
                          src={member.user.avatarUrl}
                          id={member.user.id}
                          size="sm"
                          online={Boolean(state?.online)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">
                            {member.user.name}
                            {isSelf ? <span className="ml-1 text-[9px] text-muted-foreground">you</span> : null}
                          </p>
                          <p className="truncate text-[9.5px] text-muted-foreground">
                            @{member.user.username}
                            {state?.online
                              ? " · online"
                              : state?.hidden
                                ? " · last seen hidden"
                                : state?.lastSeenAt
                                  ? ` · seen ${relative(state.lastSeenAt)} ago`
                                  : ""}
                          </p>
                        </div>
                        {member.role !== "MEMBER" ? (
                          <Badge tone={member.role === "OWNER" ? "signal" : "outline"}>
                            {member.role.toLowerCase()}
                          </Badge>
                        ) : null}
                        {canModerate && !isSelf && member.role !== "OWNER" ? (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => void changeRole(member)}
                              disabled={pendingAction === `role-${member.id}`}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                              title={member.role === "ADMIN" ? "Change to member" : "Promote to admin"}
                              aria-label={member.role === "ADMIN" ? "Demote member" : "Promote member"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(member)}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger"
                              title="Remove member"
                              aria-label="Remove member"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {conversation.type !== "DIRECT" && canModerate ? (
                <>
                  <section>
                    <SectionTitle>Add people</SectionTitle>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={memberQuery}
                        onChange={(event) => setMemberQuery(event.target.value)}
                        placeholder="Search by name or @username"
                        className="h-9 pl-8 text-[12px]"
                      />
                    </div>
                    {searchingMembers ? (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="dot-typing flex gap-0.5">
                          <span />
                          <span />
                          <span />
                        </span>
                        Searching…
                      </div>
                    ) : memberQuery.trim().length >= 2 && memberResults.length === 0 ? (
                      <p className="mt-2 text-[10px] text-muted-foreground">No available people found.</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {memberResults.map((user) => (
                          <li key={user.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5">
                            <Avatar name={user.name} src={user.avatarUrl} id={user.id} size="xs" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium">{user.name}</p>
                              <p className="truncate text-[9px] text-muted-foreground">@{user.username}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={pendingAction === `add-${user.id}`}
                              onClick={() => void addMember(user)}
                            >
                              <Plus className="h-3 w-3" /> Add
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <SectionTitle>Invite by username or email</SectionTitle>
                    <div className="flex items-center gap-2">
                      <Input
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="name@example.com"
                        className="h-9 text-[12px]"
                      />
                      <Button
                        size="sm"
                        variant="signal"
                        loading={inviting}
                        onClick={() => void sendInvite()}
                      >
                        <Mail className="h-3.5 w-3.5" /> Invite
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground/70">
                      Invitations expire after 7 days and appear in the person&apos;s notification inbox.
                    </p>
                  </section>
                </>
              ) : conversation.type !== "DIRECT" ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-[10.5px] leading-relaxed text-muted-foreground">
                  Only the owner or an admin can add or remove members.
                </p>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-danger hover:text-danger"
                onClick={() => setConfirmLeave(true)}
              >
                <LogOut className="h-3.5 w-3.5" /> Leave conversation
              </Button>
            </TabsContent>

            {/* --------------------------------- files --------------------------------- */}
            <TabsContent value="files" className="space-y-4 p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={fileFilter}
                  onChange={(event) => setFileFilter(event.target.value)}
                  placeholder="Filter files"
                  className="h-9 pl-8 text-[12px]"
                />
              </div>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : visibleFiles.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-4 w-4" />}
                  title={files.length ? "No matching files" : "No files shared yet"}
                  description={
                    files.length
                      ? "Try a different file name."
                      : "Attach an image, document, or recording to a message and it will be collected here."
                  }
                  className="py-12"
                />
              ) : (
                <ul className="space-y-2">
                  {visibleFiles.map((event) => {
                    const meta = (event.meta ?? {}) as {
                      attachmentId?: string;
                      size?: number;
                      mimeType?: string;
                    };
                    const Icon = fileIcon(meta.mimeType);
                    return (
                      <li key={event.id} className="rounded-xl border border-border/70 bg-background/40 p-3">
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11.5px] font-medium">{event.title}</p>
                            <p className="mt-0.5 text-[9px] text-muted-foreground">
                              {meta.size ? `${formatBytes(meta.size)} · ` : ""}
                              {new Date(event.at).toLocaleDateString()}
                            </p>
                          </div>
                          {meta.attachmentId ? (
                            <a
                              href={`/api/attachments/${meta.attachmentId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              aria-label={`Download ${event.title}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {event.messageId ? (
                            <button
                              type="button"
                              onClick={() => {
                                onJump(conversation.id, event.messageId!);
                                onClose();
                              }}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              aria-label="Jump to message"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            {/* --------------------------------- tasks --------------------------------- */}
            <TabsContent value="tasks" className="space-y-4 p-5">
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <SectionTitle>New workspace item</SectionTitle>
                <div className="space-y-2">
                  <Input
                    value={newTask.title}
                    onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))}
                    placeholder="What needs to happen?"
                    maxLength={200}
                    className="h-9 text-[12px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newTask.type}
                      onChange={(event) => setNewTask((current) => ({ ...current, type: event.target.value }))}
                      className={selectClass}
                      aria-label="Workspace item type"
                    >
                      <option value="TASK">Task</option>
                      <option value="DECISION">Decision</option>
                      <option value="NOTE">Note</option>
                      <option value="CHECKLIST">Checklist</option>
                      <option value="PLAN">Plan</option>
                    </select>
                    <select
                      value={newTask.assigneeId}
                      onChange={(event) =>
                        setNewTask((current) => ({ ...current, assigneeId: event.target.value }))
                      }
                      className={selectClass}
                      aria-label="Assignee"
                    >
                      <option value="">Unassigned</option>
                      {conversation.members.map((member) => (
                        <option key={member.id} value={member.user.id}>
                          {member.user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={newTask.due}
                      onChange={(event) => setNewTask((current) => ({ ...current, due: event.target.value }))}
                      className="h-9 flex-1 text-[11px]"
                      aria-label="Due date"
                    />
                    <Button size="sm" variant="signal" loading={creatingTask} onClick={() => void createTask()}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/30 p-1">
                {(
                  [
                    { key: "ALL", label: "All" },
                    { key: "OPEN", label: "Open" },
                    { key: "DONE", label: "Done" },
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setTaskFilter(filter.key)}
                    className={cn(
                      "h-7 flex-1 rounded-md text-[10.5px] font-medium transition",
                      taskFilter === filter.key
                        ? "bg-secondary text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    {filter.key === "OPEN" ? ` (${openTasks})` : ""}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : visibleItems.length === 0 ? (
                <EmptyState
                  icon={<ListTodo className="h-4 w-4" />}
                  title={items.length ? "Nothing in this filter" : "No workspace items yet"}
                  description={
                    items.length
                      ? "Switch the filter or create a new item."
                      : "Turn a message into a task, or capture a decision for the whole conversation."
                  }
                  className="py-10"
                />
              ) : (
                <ul className="space-y-2">
                  {visibleItems.map((item) => {
                    const done = item.status === "DONE";
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "rounded-xl border p-3",
                          done
                            ? "border-border/50 bg-background/20 opacity-75"
                            : "border-border/70 bg-background/40",
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => void updateTaskStatus(item, done ? "TODO" : "DONE")}
                            disabled={pendingAction === `task-${item.id}`}
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                              done
                                ? "border-signal bg-signal text-signal-foreground"
                                : "border-border hover:border-signal/60",
                            )}
                            aria-label={done ? "Mark as open" : "Mark as done"}
                          >
                            {done ? <Check className="h-3 w-3" /> : null}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone={item.type === "DECISION" ? "signal" : "outline"}>
                                {item.type.toLowerCase()}
                              </Badge>
                              {item.dueAt ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[9px]",
                                    !done && new Date(item.dueAt).getTime() < Date.now()
                                      ? "text-danger"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  <Clock3 className="h-2.5 w-2.5" />
                                  {new Date(item.dueAt).toLocaleDateString()}
                                </span>
                              ) : null}
                              {item.assignee ? (
                                <span className="text-[9px] text-muted-foreground">
                                  assigned to {item.assignee.id === profile.id ? "you" : item.assignee.name}
                                </span>
                              ) : null}
                            </div>
                            <p
                              className={cn(
                                "mt-1 text-[12px] leading-snug",
                                done && "line-through decoration-border",
                              )}
                            >
                              {item.title}
                            </p>
                            {item.content ? (
                              <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                                {item.content}
                              </p>
                            ) : null}
                            {item.sourceMessageId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onJump(conversation.id, item.sourceMessageId!);
                                  onClose();
                                }}
                                className="mt-1 inline-flex items-center gap-1 text-[9px] text-signal hover:underline"
                              >
                                View source message <ArrowUpRight className="h-2.5 w-2.5" />
                              </button>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeTask(item)}
                            disabled={pendingAction === `delete-task-${item.id}`}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger disabled:opacity-40"
                            aria-label="Delete workspace item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            {/* -------------------------------- timeline -------------------------------- */}
            <TabsContent value="timeline" className="space-y-4 p-5">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : timeline.length === 0 ? (
                <EmptyState
                  icon={<Clock3 className="h-4 w-4" />}
                  title="The timeline is quiet"
                  description="Decisions, tasks, files, pins, summaries, and side threads will appear here as the conversation grows."
                  className="py-12"
                />
              ) : (
                <ol className="relative space-y-3 border-l border-border/70 pl-4">
                  {timeline.map((event) => {
                    const Icon = timelineIcons[event.kind];
                    const branchConversationId =
                      event.kind === "branch"
                        ? ((event.meta ?? {}) as { conversationId?: string }).conversationId
                        : undefined;
                    return (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[22px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                        <div className="rounded-lg border border-border/60 bg-background/30 px-2.5 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                              {event.kind}
                            </span>
                            <span className="ml-auto text-[9px] text-muted-foreground/70">
                              {new Date(event.at).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11.5px] leading-snug">{event.title}</p>
                          {event.detail ? (
                            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{event.detail}</p>
                          ) : null}
                          {event.messageId ? (
                            <button
                              type="button"
                              onClick={() => {
                                onJump(conversation.id, event.messageId!);
                                onClose();
                              }}
                              className="mt-1 inline-flex items-center gap-1 text-[9px] text-signal hover:underline"
                            >
                              Open message <ArrowUpRight className="h-2.5 w-2.5" />
                            </button>
                          ) : branchConversationId ? (
                            <button
                              type="button"
                              onClick={() => openConversation(branchConversationId)}
                              className="mt-1 inline-flex items-center gap-1 text-[9px] text-signal hover:underline"
                            >
                              Open side thread <ArrowUpRight className="h-2.5 w-2.5" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </TabsContent>

            {/* -------------------------------- branches -------------------------------- */}
            <TabsContent value="branches" className="space-y-4 p-5">
              <div className="rounded-lg border border-signal/25 bg-signal/[0.05] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-signal">
                  <GitBranch className="h-3 w-3" /> Side threads
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  Start one from any message menu to explore a tangent without derailing this conversation.
                </p>
              </div>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : branches.length === 0 ? (
                <EmptyState
                  icon={<GitBranch className="h-4 w-4" />}
                  title="No side threads yet"
                  description="Open a message's menu and choose “Start side thread” to branch off a focused discussion."
                  className="py-10"
                />
              ) : (
                <ul className="space-y-2">
                  {branches.map((branch) => (
                    <li key={branch.id} className="rounded-xl border border-border/70 bg-background/40 p-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-signal/10 text-signal">
                          <GitBranch className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-medium">{branch.title}</p>
                          <p className="mt-0.5 truncate text-[9.5px] text-muted-foreground">
                            from “{branch.message.body || "attachment"}”
                          </p>
                          <p className="mt-1 text-[9px] text-muted-foreground/70">
                            {branch.creator.name} · {relative(branch.createdAt)} ago · last reply{" "}
                            {relative(branch.lastMessageAt)} ago
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openConversation(branch.conversationId)}>
                          Open
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <footer className="flex items-center justify-between border-t border-border/70 px-4 py-2.5 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            {conversation.members.length} members
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Hash className="h-3 w-3" />
            {conversation.type.toLowerCase()} · server-enforced permissions
          </span>
        </footer>
      </aside>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave this conversation?"
        description="You will stop receiving messages here. The conversation stays available to everyone else."
        confirmLabel="Leave"
        danger
        onConfirm={async () => {
          await leaveConversation(conversation.id);
          onClose();
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this conversation forever?"
        description="All messages, polls, tasks, and stored attachments will be permanently removed for every member. This cannot be undone."
        confirmLabel="Delete everything"
        danger
        onConfirm={deleteConversation}
      />
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(value) => {
          if (!value) setRemoveTarget(null);
        }}
        title={`Remove ${removeTarget?.user.name ?? "this member"}?`}
        description="They will lose access to the conversation and its files immediately."
        confirmLabel="Remove member"
        danger
        onConfirm={async () => {
          if (removeTarget) await removeMember(removeTarget);
        }}
      />
    </div>
  );
}
