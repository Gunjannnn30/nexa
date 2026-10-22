"use client";

import * as React from "react";
import { Check, Clock3, Hash, LockKeyhole, Search, UserRound, Users, X } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  Input,
  Label,
  Spinner,
  Textarea,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { apiGet, errorMessage } from "@/lib/client/api";
import type { PublicUser } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Kind = "direct" | "group" | "room";

type SearchUser = PublicUser & { isContact?: boolean };

export function NewConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { createConversation, profile } = useNexa();
  const [kind, setKind] = React.useState<Kind>("direct");
  const [query, setQuery] = React.useState("");
  const [users, setUsers] = React.useState<SearchUser[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<PublicUser[]>([]);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [firstMessage, setFirstMessage] = React.useState("");
  const [expiresInHours, setExpiresInHours] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    apiGet<{ contacts: { user: PublicUser }[] }>("/api/contacts")
      .then((data) => {
        if (!cancelled) setUsers(data.contacts.map((contact) => ({ ...contact.user, isContact: true })));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiGet<{ users: SearchUser[] }>(
          `/api/contacts?type=search&q=${encodeURIComponent(trimmed)}`,
        );
        if (!cancelled) setUsers(data.users);
      } catch (error) {
        if (!cancelled) toast.error(errorMessage(error));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const reset = () => {
    setKind("direct");
    setQuery("");
    setSelected([]);
    setTitle("");
    setDescription("");
    setFirstMessage("");
    setExpiresInHours("");
  };

  const close = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const toggle = (user: PublicUser) => {
    if (kind === "direct") {
      setSelected([user]);
      return;
    }
    setSelected((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : current.length >= 49
          ? current
          : [...current, user],
    );
  };

  const submit = async () => {
    if (kind !== "direct" && title.trim().length < 2) {
      toast.error("Give the conversation a name of at least 2 characters.");
      return;
    }
    if (selected.length === 0) {
      toast.error(kind === "direct" ? "Choose someone to message." : "Add at least one member.");
      return;
    }
    const hours = expiresInHours ? Number(expiresInHours) : null;
    if (kind === "room" && hours !== null && (!Number.isFinite(hours) || hours <= 0)) {
      toast.error("Room expiry must be a positive number of hours.");
      return;
    }
    setCreating(true);
    try {
      await createConversation({
        kind,
        ...(kind !== "direct" ? { title: title.trim(), description: description.trim() || undefined } : {}),
        memberIds: selected.map((user) => user.id),
        ...(kind === "room" && hours ? { expiresInHours: Math.min(24 * 90, Math.round(hours)) } : {}),
        ...(firstMessage.trim() ? { firstMessage: firstMessage.trim() } : {}),
      });
      toast.success(
        kind === "direct"
          ? `Conversation with ${selected[0]?.name ?? "your contact"} ready.`
          : kind === "room"
            ? "Room created. It will expire automatically."
            : "Group created.",
      );
      close(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="md" className="flex max-h-[86vh] flex-col p-0">
        <DialogHeader
          eyebrow="New conversation"
          title="Start with the right people."
          description="Direct message, a lasting group, or a room that removes itself when time is up."
        />
        <div className="border-b border-border/70 px-5 py-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-background/40 p-1">
            {([
              { key: "direct", label: "Direct", icon: UserRound },
              { key: "group", label: "Group", icon: Users },
              { key: "room", label: "Room", icon: Clock3 },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setKind(item.key);
                  setSelected(item.key === "direct" ? selected.slice(0, 1) : selected);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[10.5px] font-medium transition",
                  kind === item.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {kind !== "direct" ? (
            <div className="mb-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="conversation-title">{kind === "room" ? "Room name" : "Group name"}</Label>
                <Input
                  id="conversation-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={kind === "room" ? "Friday launch room" : "Design critique"}
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conversation-description">Description (optional)</Label>
                <Textarea
                  id="conversation-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is this conversation for?"
                  rows={2}
                  maxLength={500}
                />
              </div>
              {kind === "room" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="room-expiry">Expires after hours</Label>
                  <div className="relative">
                    <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="room-expiry"
                      type="number"
                      min={1}
                      max={2160}
                      value={expiresInHours}
                      onChange={(event) => setExpiresInHours(event.target.value)}
                      placeholder="24"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-[9.5px] leading-relaxed text-muted-foreground">
                    Expired rooms are hidden and their content is removed from the active workspace. Leave blank for no expiry.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mb-2 flex items-center justify-between">
            <Label>{kind === "direct" ? "Choose a person" : "Members"}</Label>
            <span className="text-[9.5px] text-muted-foreground">{selected.length} selected</span>
          </div>

          {selected.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((user) => (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 py-0.5 pl-0.5 pr-1.5 text-[10px]"
                >
                  <Avatar name={user.name} src={user.avatarUrl} id={user.id} size="xs" />
                  {user.name}
                  <button
                    type="button"
                    onClick={() => setSelected((current) => current.filter((item) => item.id !== user.id))}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${user.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or username"
              className="h-9 pl-9 text-[12px]"
              aria-label="Search people"
            />
          </div>

          <div className="mt-2 space-y-0.5">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[10.5px] text-muted-foreground">
                <Spinner /> Finding people…
              </div>
            ) : users.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-[11px] font-medium">
                  {query.trim().length >= 2 ? "No discoverable people found." : "No contacts yet."}
                </p>
                <p className="mx-auto mt-1 max-w-[34ch] text-[9.5px] leading-relaxed text-muted-foreground">
                  {query.trim().length >= 2
                    ? "People can hide themselves from discovery in Settings. Try their exact username."
                    : "Search by username to find someone. You can also share a group invite from the conversation details."}
                </p>
              </div>
            ) : (
              users
                .filter((user) => user.id !== profile.id)
                .map((user) => {
                  const active = selected.some((item) => item.id === user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggle(user)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left transition",
                        active
                          ? "border-signal/40 bg-signal/[0.06]"
                          : "border-transparent hover:border-border/60 hover:bg-secondary/30",
                      )}
                    >
                      <Avatar name={user.name} src={user.avatarUrl} id={user.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium">{user.name}</span>
                        <span className="block truncate text-[9.5px] text-muted-foreground">
                          @{user.username}
                          {user.statusText ? ` · ${user.statusText}` : ""}
                        </span>
                      </span>
                      {user.isContact ? <Badge tone="outline">contact</Badge> : null}
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border",
                          active ? "border-signal bg-signal text-signal-foreground" : "border-border",
                        )}
                      >
                        {active ? <Check className="h-3 w-3" /> : null}
                      </span>
                    </button>
                  );
                })
            )}
          </div>
        </div>

        <div className="border-t border-border/70 px-5 py-3">
          <div className="mb-3 flex items-center gap-2">
            <Input
              value={firstMessage}
              onChange={(event) => setFirstMessage(event.target.value)}
              placeholder="Optional first message…"
              className="h-9 text-[12px]"
              maxLength={4000}
              aria-label="Optional first message"
            />
            <Button variant="signal" size="lg" onClick={() => void submit()} loading={creating} className="shrink-0">
              <Hash className="h-3.5 w-3.5" />
              {kind === "direct" ? "Open chat" : kind === "room" ? "Create room" : "Create group"}
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <LockKeyhole className="h-2.5 w-2.5 text-signal" />
            Conversations are private to their members. Invitations can be sent from the details panel.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
