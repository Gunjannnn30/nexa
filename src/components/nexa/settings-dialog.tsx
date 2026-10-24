"use client";

import * as React from "react";
import {
  AtSign,
  Ban,
  Camera,
  Check,
  Clock3,
  Copy,
  Database,
  Download,
  KeyRound,
  Link2,
  Mail,
  Palette,
  Plus,
  Share2,
  ShieldCheck,
  SunMoon,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
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
  Label,
  SectionTitle,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { api, apiDelete, apiGet, apiPatch, apiPost, errorMessage, uploadFile } from "@/lib/client/api";
import type { AppInvite, Memory, PublicUser, UserSettings } from "@/lib/client/types";
import { relative } from "@/lib/client/format";
import { cn } from "@/lib/utils";

type BlockedUser = { id: string; user: PublicUser; createdAt: string };
type Contact = { id: string; nickname: string | null; createdAt: string; user: PublicUser };

type TabKey = "profile" | "preferences" | "privacy" | "share" | "security" | "data";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function SettingSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-5 rounded-xl border border-border/60 bg-background/30 px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="normal-case tracking-normal text-[12.5px] font-medium text-foreground">
          {label}
        </Label>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[10px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const themeOptions: { value: "light" | "dark" | "system"; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Warm paper" },
  { value: "dark", label: "Dark", hint: "Ink & signal" },
  { value: "system", label: "System", hint: "Match device" },
];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    profile,
    updateProfile,
    updateSettings,
    memories,
    memoryEnabled,
    loadMemories,
    setMemories,
    setMemoryEnabled,
  } = useNexa();

  const [tab, setTab] = React.useState<TabKey>("profile");
  const openedRef = React.useRef(false);

  const [name, setName] = React.useState(profile.name);
  const [username, setUsername] = React.useState(profile.username);
  const [bio, setBio] = React.useState(profile.bio ?? "");
  const [statusText, setStatusText] = React.useState(profile.statusText ?? "");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [pendingSetting, setPendingSetting] = React.useState<string | null>(null);

  const [memoryDraft, setMemoryDraft] = React.useState("");
  const [memoryBusy, setMemoryBusy] = React.useState(false);

  const [blocks, setBlocks] = React.useState<BlockedUser[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [privacyLoading, setPrivacyLoading] = React.useState(false);
  const [contactInput, setContactInput] = React.useState("");
  const [contactBusy, setContactBusy] = React.useState(false);

  const [appInvites, setAppInvites] = React.useState<AppInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = React.useState(false);
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [inviteNote, setInviteNote] = React.useState("");
  const [inviteMaxUses, setInviteMaxUses] = React.useState(5);
  const [inviteExpiry, setInviteExpiry] = React.useState(7);
  const [inviteCopied, setInviteCopied] = React.useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordBusy, setPasswordBusy] = React.useState(false);

  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleteConfirmation, setDeleteConfirmation] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setTab("profile");
    setName(profile.name);
    setUsername(profile.username);
    setBio(profile.bio ?? "");
    setStatusText(profile.statusText ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setDeletePassword("");
    setDeleteConfirmation("");
    setContactInput("");
    void loadMemories();
  }, [open, profile, loadMemories]);

  const patchSettings = async (patch: Partial<UserSettings>) => {
    const key = Object.keys(patch)[0] ?? "settings";
    setPendingSetting(key);
    try {
      await updateSettings(patch);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPendingSetting(null);
    }
  };

  const saveProfile = async () => {
    if (name.trim().length < 2) {
      toast.error("Your name needs at least two characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
      toast.error("Usernames use 3–24 letters, numbers, or underscores.");
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        statusText: statusText.trim() || null,
      });
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file for your avatar.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Avatars must be 8 MB or smaller.");
      return;
    }
    setAvatarBusy(true);
    try {
      const { attachment } = await uploadFile(file);
      await updateProfile({ avatarUrl: attachment.url });
      toast.success("Avatar updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadPrivacy = React.useCallback(async () => {
    setPrivacyLoading(true);
    try {
      const [blockData, contactData] = await Promise.all([
        apiGet<{ blocks: BlockedUser[] }>("/api/contacts?type=blocks"),
        apiGet<{ contacts: Contact[] }>("/api/contacts"),
      ]);
      setBlocks(blockData.blocks);
      setContacts(contactData.contacts);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPrivacyLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && tab === "privacy") void loadPrivacy();
  }, [open, tab, loadPrivacy]);

  const loadAppInvites = React.useCallback(async () => {
    setInvitesLoading(true);
    try {
      const data = await apiGet<{ invites: AppInvite[] }>("/api/app-invites");
      setAppInvites(data.invites);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && tab === "share") void loadAppInvites();
  }, [open, tab, loadAppInvites]);

  const createInvite = async () => {
    setInviteBusy(true);
    try {
      const data = await apiPost<{ invite: AppInvite }>("/api/app-invites", {
        ...(inviteNote.trim() ? { note: inviteNote.trim() } : {}),
        maxUses: inviteMaxUses,
        expiresInDays: inviteExpiry,
      });
      setAppInvites((current) => [data.invite, ...current]);
      setInviteNote("");
      toast.success("Invite link created. Share it with anyone you want on NEXA.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInviteBusy(false);
    }
  };

  const copyInvite = async (invite: AppInvite) => {
    const copied = await copyText(invite.url);
    if (!copied) {
      toast.error("Could not copy the invite link. Select it and copy manually.");
      return;
    }
    setInviteCopied(invite.id);
    window.setTimeout(() => setInviteCopied((current) => (current === invite.id ? null : current)), 2200);
    toast.success("Invite link copied.");
  };

  const shareInvite = async (invite: AppInvite) => {
    const text = `${profile.name} invited you to NEXA — a real-time messaging workspace. Join here: ${invite.url}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join NEXA", text, url: invite.url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyInvite(invite);
  };

  const revokeInvite = async (invite: AppInvite) => {
    if (!window.confirm("Revoke this invite? Anyone who already joined keeps their account, but the link will stop working.")) {
      return;
    }
    setInviteCopied(null);
    try {
      const data = await apiDelete<{ invite: AppInvite }>(`/api/app-invites/${invite.id}`);
      setAppInvites((current) => current.map((item) => (item.id === invite.id ? data.invite : item)));
      toast.success("Invite revoked.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const addContact = async () => {
    if (contactInput.trim().length < 3) {
      toast.error("Enter a username or email address.");
      return;
    }
    setContactBusy(true);
    try {
      await apiPost("/api/contacts", { identifier: contactInput.trim() });
      setContactInput("");
      await loadPrivacy();
      toast.success("Contact added.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setContactBusy(false);
    }
  };

  const removeContact = async (id: string) => {
    try {
      await apiDelete(`/api/contacts?id=${encodeURIComponent(id)}`);
      setContacts((prev) => prev.filter((contact) => contact.id !== id));
      toast.success("Contact removed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const unblock = async (userId: string) => {
    try {
      await apiDelete(`/api/contacts?blockUserId=${encodeURIComponent(userId)}`);
      setBlocks((prev) => prev.filter((block) => block.user.id !== userId));
      toast.success("User unblocked.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const addMemory = async () => {
    if (memoryDraft.trim().length < 2) {
      toast.error("Write at least a couple of words.");
      return;
    }
    setMemoryBusy(true);
    try {
      const data = await apiPost<{ memory: Memory }>("/api/memories", {
        content: memoryDraft.trim(),
      });
      setMemories([data.memory, ...memories]);
      setMemoryDraft("");
      toast.success("Memory saved. Future AI answers can use it.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setMemoryBusy(false);
    }
  };

  const toggleMemory = async (memory: Memory) => {
    try {
      const data = await apiPatch<{ memory: Memory }>(`/api/memories/${memory.id}`, {
        isActive: !memory.isActive,
      });
      setMemories(memories.map((item) => (item.id === memory.id ? data.memory : item)));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteMemory = async (memory: Memory) => {
    try {
      await apiDelete(`/api/memories/${memory.id}`);
      setMemories(memories.filter((item) => item.id !== memory.id));
      toast.success("Memory deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error("Use at least 8 characters with a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await apiPost("/api/auth/password", { currentPassword, newPassword });
      toast.success("Password changed. Signing you out…");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (error) {
      toast.error(errorMessage(error));
      setPasswordBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    if (!deletePassword) {
      toast.error("Enter your password.");
      return;
    }
    setDeleteBusy(true);
    try {
      await api("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, confirmation: "DELETE" }),
      });
      toast.success("Account deleted.");
      window.location.href = "/";
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleteBusy(false);
    }
  };

  const settingDisabled = pendingSetting !== null;
  const activeMemories = memories.filter((memory) => memory.isActive);
  const inactiveMemories = memories.filter((memory) => !memory.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="flex h-[min(88vh,760px)] flex-col p-0">
        <DialogHeader
          title="Settings"
          description="Your identity, preferences, privacy, and data — all stored on this server."
          eyebrow="Workspace"
        />

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TabKey)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b border-border/60 px-4 py-2">
            <TabsList className="gap-0 sm:gap-0.5">
              <TabsTrigger value="profile">
                <span className="inline-flex items-center gap-1.5 [&>svg]:hidden sm:[&>svg]:block">
                  <UserRound className="h-3 w-3" /> Profile
                </span>
              </TabsTrigger>
              <TabsTrigger value="preferences">
                <span className="inline-flex items-center gap-1.5 [&>svg]:hidden sm:[&>svg]:block">
                  <Palette className="h-3 w-3" /> Preferences
                </span>
              </TabsTrigger>
              <TabsTrigger value="privacy">
                <span className="inline-flex items-center gap-1.5 [&>svg]:hidden sm:[&>svg]:block">
                  <ShieldCheck className="h-3 w-3" /> Privacy
                </span>
              </TabsTrigger>
              <TabsTrigger value="share">
                <span className="inline-flex items-center gap-1.5 [&>svg]:hidden sm:[&>svg]:block">
                  <Share2 className="h-3 w-3" /> Share
                </span>
              </TabsTrigger>
              <TabsTrigger value="security">
                <span className="inline-flex items-center gap-1.5 [&>svg]:hidden sm:[&>svg]:block">
                  <KeyRound className="h-3 w-3" /> Security
                </span>
              </TabsTrigger>
              <TabsTrigger value="data">
                <span className="inline-flex items-center gap-1.5 [&>svg]:hidden sm:[&>svg]:block">
                  <Database className="h-3 w-3" /> Data
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <TabsContent value="profile" className="space-y-6">
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-background/30 p-4">
                <Avatar
                  name={profile.name}
                  src={profile.avatarUrl}
                  id={profile.id}
                  size="xl"
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{profile.name}</p>
                  <p className="text-[11px] text-muted-foreground">@{profile.username}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadAvatar(file);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      loading={avatarBusy}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Camera className="h-3.5 w-3.5" /> Change avatar
                    </Button>
                    {profile.avatarUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void updateProfile({ avatarUrl: null })}
                        disabled={avatarBusy}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display name">
                  <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
                </Field>
                <Field label="Username" hint="Letters, numbers, and underscores. Used to find you.">
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      maxLength={24}
                      className="pl-9"
                    />
                  </div>
                </Field>
              </div>

              <Field label="Status" hint="A short line shown next to your name. Max 80 characters.">
                <Input
                  value={statusText}
                  onChange={(event) => setStatusText(event.target.value)}
                  maxLength={80}
                  placeholder="In deep work until 3pm"
                />
              </Field>

              <Field label="Bio" hint="Visible to people who share a conversation with you. Max 240 characters.">
                <Textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={240}
                  rows={3}
                  placeholder="What you work on, and how you like to collaborate."
                />
              </Field>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/30 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{profile.email}</span>
                </div>
                <Badge tone="outline">Sign-in email</Badge>
              </div>

              <div className="flex justify-end">
                <Button variant="signal" loading={savingProfile} onClick={() => void saveProfile()}>
                  <Check className="h-3.5 w-3.5" /> Save profile
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preferences" className="space-y-7">
              <section>
                <SectionTitle>Appearance</SectionTitle>
                <div className="grid gap-2 sm:grid-cols-3">
                  {themeOptions.map((option) => {
                    const active = profile.settings.theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={settingDisabled}
                        onClick={() => void patchSettings({ theme: option.value })}
                        className={cn(
                          "rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60",
                          active
                            ? "border-signal/50 bg-signal/[0.07]"
                            : "border-border/60 bg-background/30 hover:border-border hover:bg-secondary/40",
                        )}
                        aria-pressed={active}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-[12px] font-medium">{option.label}</span>
                          {active ? <Check className="h-3.5 w-3.5 text-signal" /> : <SunMoon className="h-3.5 w-3.5 text-muted-foreground/60" />}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionTitle>Notifications</SectionTitle>
                <div className="space-y-2">
                  <SettingSwitch
                    label="Desktop and in-app notifications"
                    description="Show a toast and update the title when a message arrives while NEXA is open."
                    checked={profile.settings.notificationsEnabled}
                    onChange={(value) => void patchSettings({ notificationsEnabled: value })}
                    disabled={settingDisabled}
                  />
                  <SettingSwitch
                    label="Sound on new messages"
                    description="A short ping when a message arrives and the conversation is not focused."
                    checked={profile.settings.soundEnabled}
                    onChange={(value) => void patchSettings({ soundEnabled: value })}
                    disabled={settingDisabled}
                  />
                  <SettingSwitch
                    label="Message previews"
                    description="Include message text in notification bodies. Turn off for more discreet alerts."
                    checked={profile.settings.messagePreview}
                    onChange={(value) => void patchSettings({ messagePreview: value })}
                    disabled={settingDisabled}
                  />
                </div>
              </section>

              <section>
                <SectionTitle>Daily digest</SectionTitle>
                <div className="space-y-2">
                  <SettingSwitch
                    label="Morning digest"
                    description="Generate a digest of unread mentions and open commitments. AI must be configured."
                    checked={profile.settings.digestEnabled}
                    onChange={(value) => void patchSettings({ digestEnabled: value })}
                    disabled={settingDisabled}
                  />
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/30 px-4 py-3">
                    <div>
                      <p className="text-[12.5px] font-medium">Digest hour</p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                        Used by scheduled jobs in your local timezone.
                      </p>
                    </div>
                    <select
                      value={profile.settings.digestHour}
                      onChange={(event) =>
                        void patchSettings({ digestHour: Number(event.target.value) })
                      }
                      disabled={settingDisabled}
                      aria-label="Digest hour"
                      className="h-9 rounded-lg border border-input bg-background/60 px-2.5 text-[12px] text-foreground outline-none focus:border-signal/50 focus:ring-2 focus:ring-signal/15"
                    >
                      {Array.from({ length: 24 }).map((_, hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <SectionTitle action={<Badge tone={profile.settings.aiMemoryEnabled ? "signal" : "outline"}>{profile.settings.aiMemoryEnabled ? "On" : "Off"}</Badge>}>
                  AI memory
                </SectionTitle>
                <div className="space-y-3">
                  <SettingSwitch
                    label="Let AI use what you teach it"
                    description="When enabled, memories you write here can be included in AI prompts for your conversations. Memories stay on this server and can be deleted at any time."
                    checked={profile.settings.aiMemoryEnabled}
                    onChange={(value) => {
                      void (async () => {
                        await patchSettings({ aiMemoryEnabled: value });
                        setMemoryEnabled(value);
                        await loadMemories();
                      })();
                    }}
                    disabled={settingDisabled}
                  />

                  {profile.settings.aiMemoryEnabled || memoryEnabled ? (
                    <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-4">
                      <div className="flex gap-2">
                        <Input
                          value={memoryDraft}
                          onChange={(event) => setMemoryDraft(event.target.value)}
                          placeholder="e.g. I prefer updates as bullet points"
                          maxLength={1000}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addMemory();
                            }
                          }}
                          className="h-9 text-xs"
                        />
                        <Button size="sm" variant="signal" loading={memoryBusy} onClick={() => void addMemory()}>
                          <Plus className="h-3.5 w-3.5" /> Add
                        </Button>
                      </div>

                      {memories.length === 0 ? (
                        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                          No memories yet. Add preferences, context, or standing instructions.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {[...activeMemories, ...inactiveMemories].map((memory) => (
                            <li
                              key={memory.id}
                              className={cn(
                                "flex items-start gap-2 rounded-lg border px-2.5 py-2",
                                memory.isActive
                                  ? "border-border/60 bg-background/40"
                                  : "border-border/40 bg-background/20 opacity-60",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => void toggleMemory(memory)}
                                aria-label={memory.isActive ? "Disable memory" : "Enable memory"}
                                className={cn(
                                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                  memory.isActive
                                    ? "border-signal bg-signal text-signal-foreground"
                                    : "border-border text-transparent",
                                )}
                              >
                                <Check className="h-2.5 w-2.5" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                                  {memory.content}
                                </p>
                                <p className="mt-0.5 text-[9px] text-muted-foreground">
                                  {memory.source.toLowerCase()} · {relative(memory.updatedAt)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void deleteMemory(memory)}
                                className="mt-0.5 rounded p-0.5 text-muted-foreground transition hover:text-danger"
                                aria-label="Delete memory"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="privacy" className="space-y-7">
              <section>
                <SectionTitle>Visibility</SectionTitle>
                <div className="space-y-2">
                  <SettingSwitch
                    label="Read receipts"
                    description="Let people see when you have read their messages. Off means their view shows delivered only."
                    checked={profile.settings.readReceipts}
                    onChange={(value) => void patchSettings({ readReceipts: value })}
                    disabled={settingDisabled}
                  />
                  <SettingSwitch
                    label="Show last seen"
                    description="When off, direct-message headers show “last seen hidden” instead of a timestamp."
                    checked={profile.settings.lastSeenVisible}
                    onChange={(value) => void patchSettings({ lastSeenVisible: value })}
                    disabled={settingDisabled}
                  />
                  <SettingSwitch
                    label="Discoverable"
                    description="Allow people to find you by username or email when starting a conversation."
                    checked={profile.settings.discoverable}
                    onChange={(value) => void patchSettings({ discoverable: value })}
                    disabled={settingDisabled}
                  />
                </div>
              </section>

              <section>
                <SectionTitle>Contacts</SectionTitle>
                <div className="flex gap-2">
                  <Input
                    value={contactInput}
                    onChange={(event) => setContactInput(event.target.value)}
                    placeholder="Username or email"
                    className="h-9 text-xs"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addContact();
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" loading={contactBusy} onClick={() => void addContact()}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>

                {privacyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner />
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      icon={<Users className="h-4 w-4" />}
                      title="No contacts yet"
                      description="Add people by username or email to start direct messages faster."
                    />
                  </div>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {contacts.map((contact) => (
                      <li
                        key={contact.id}
                        className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/30 px-3 py-2"
                      >
                        <Avatar
                          name={contact.user.name}
                          src={contact.user.avatarUrl}
                          id={contact.user.id}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">
                            {contact.nickname ?? contact.user.name}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            @{contact.user.username}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeContact(contact.id)}
                          className="rounded-md px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-danger/10 hover:text-danger"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <SectionTitle>Blocked users</SectionTitle>
                {blocks.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-5 text-center">
                    <Ban className="mx-auto h-4 w-4 text-muted-foreground" />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      You have not blocked anyone. Blocked users cannot message you or add you to groups.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {blocks.map((block) => (
                      <li
                        key={block.id}
                        className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/30 px-3 py-2"
                      >
                        <Avatar
                          name={block.user.name}
                          src={block.user.avatarUrl}
                          id={block.user.id}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium">{block.user.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            @{block.user.username} · blocked {relative(block.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void unblock(block.user.id)}
                          className="rounded-md px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          Unblock
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </TabsContent>

            <TabsContent value="share" className="space-y-6">
              <section className="rounded-2xl border border-signal/25 bg-signal/[0.04] p-4">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-signal/30 bg-signal/10 text-signal">
                    <UserPlus className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">Invite someone to NEXA</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                      A link creates a real account, connects you as mutual contacts, and opens a
                      direct conversation. Each link expires and has a use limit.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <Field label="Note (optional)" hint="Only shown on the registration page to the invitee.">
                    <Input
                      value={inviteNote}
                      onChange={(event) => setInviteNote(event.target.value)}
                      maxLength={280}
                      placeholder="Join me on NEXA"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Link expires in">
                      <select
                        value={inviteExpiry}
                        onChange={(event) => setInviteExpiry(Number(event.target.value))}
                        className="h-9 w-full rounded-lg border border-input bg-background/60 px-2.5 text-[12px] text-foreground outline-none focus:border-signal/50 focus:ring-2 focus:ring-signal/15"
                      >
                        {[1, 3, 7, 14, 30].map((days) => (
                          <option key={days} value={days}>
                            {days === 1 ? "1 day" : `${days} days`}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Maximum uses">
                      <select
                        value={inviteMaxUses}
                        onChange={(event) => setInviteMaxUses(Number(event.target.value))}
                        className="h-9 w-full rounded-lg border border-input bg-background/60 px-2.5 text-[12px] text-foreground outline-none focus:border-signal/50 focus:ring-2 focus:ring-signal/15"
                      >
                        {[1, 3, 5, 10, 25, 50].map((uses) => (
                          <option key={uses} value={uses}>
                            {uses === 1 ? "1 person" : `${uses} people`}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9.5px] leading-relaxed text-muted-foreground">
                      Anyone with an active link can register until it expires or runs out.
                    </p>
                    <Button variant="signal" loading={inviteBusy} onClick={() => void createInvite()}>
                      <Link2 className="h-3.5 w-3.5" /> Create link
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <SectionTitle
                  action={
                    <button
                      type="button"
                      onClick={() => void loadAppInvites()}
                      className="text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      Refresh
                    </button>
                  }
                >
                  Your invite links
                </SectionTitle>

                {invitesLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/30 px-4 py-8 text-[11px] text-muted-foreground">
                    <Spinner className="h-3.5 w-3.5" /> Loading links…
                  </div>
                ) : appInvites.length === 0 ? (
                  <EmptyState
                    icon={<Share2 className="h-4 w-4" />}
                    title="No invite links yet"
                    description="Create a link above and send it to someone you want on NEXA. You can revoke it at any time."
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {appInvites.map((invite) => (
                      <li
                        key={invite.id}
                        className="rounded-2xl border border-border/60 bg-background/30 p-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                tone={
                                  invite.status === "active"
                                    ? "signal"
                                    : invite.status === "revoked"
                                      ? "danger"
                                      : "outline"
                                }
                              >
                                {invite.status}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {invite.usedCount} of {invite.maxUses} used
                              </span>
                            </div>
                            <p className="mt-1 text-[12px] font-medium">
                              {invite.note || "No note"}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="h-2.5 w-2.5" />
                                {invite.status === "expired" ? "expired" : "expires"}{" "}
                                {new Date(invite.expiresAt).toLocaleDateString()}
                              </span>
                              <span>·</span>
                              <span>created {relative(invite.createdAt)}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void shareInvite(invite)}
                              disabled={invite.status !== "active"}
                            >
                              <Share2 className="h-3 w-3" /> Share
                            </Button>
                            {invite.status === "active" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:text-danger"
                                onClick={() => void revokeInvite(invite)}
                              >
                                <Trash2 className="h-3 w-3" /> Revoke
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center gap-1.5">
                          <input
                            readOnly
                            value={invite.url}
                            aria-label="Invite link"
                            onFocus={(event) => event.currentTarget.select()}
                            className="h-8 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/60 px-2.5 text-[10px] text-muted-foreground outline-none focus:border-signal/40"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => void copyInvite(invite)}
                          >
                            {inviteCopied === invite.id ? (
                              <>
                                <Check className="h-3 w-3 text-signal" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Copy
                              </>
                            )}
                          </Button>
                        </div>

                        {invite.redemptions.length > 0 ? (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
                            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Joined
                            </span>
                            {invite.redemptions.map((redemption) => (
                              <span
                                key={redemption.id}
                                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/50 py-0.5 pl-0.5 pr-2 text-[9.5px] text-muted-foreground"
                                title={`${redemption.user.name} joined ${relative(redemption.createdAt)}`}
                              >
                                <Avatar
                                  name={redemption.user.name}
                                  src={redemption.user.avatarUrl}
                                  id={redemption.user.id}
                                  size="xs"
                                />
                                {redemption.user.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 rounded-xl border border-border/50 bg-background/30 px-3 py-2.5 text-[9.5px] leading-relaxed text-muted-foreground">
                  Treat invite links like passwords: anyone who has one can use it while it is active.
                  Revoking stops new sign-ups immediately. People who already joined keep their accounts.
                </p>
              </section>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <div className="rounded-xl border border-border/60 bg-background/30 p-4 text-[11px] leading-relaxed text-muted-foreground">
                Passwords are hashed with bcrypt. Sessions are random tokens stored as SHA-256 hashes,
                sent in httpOnly cookies. Changing your password signs out every device, including this one.
              </div>

              <div className="space-y-4">
                <Field label="Current password">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New password" hint="At least 8 characters, with a letter and a number.">
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="signal"
                    loading={passwordBusy}
                    disabled={!currentPassword || !newPassword || !confirmPassword}
                    onClick={() => void changePassword()}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Change password
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <SectionTitle>AI and message access</SectionTitle>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  NEXA is not end-to-end encrypted. Messages are stored on this server so AI summaries,
                  search, and moderation can work. AI requests send only the selected conversation context
                  to the provider you configure, and answers cite their evidence.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              <section className="rounded-xl border border-border/60 bg-background/30 p-4">
                <SectionTitle>Export your data</SectionTitle>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  Download a JSON file with your profile, settings, contacts, messages, bookmarks,
                  memberships, memories, AI summaries, workspace items, and notifications.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const anchor = document.createElement("a");
                      anchor.href = "/api/auth/account";
                      anchor.download = `nexa-export-${profile.username}.json`;
                      document.body.appendChild(anchor);
                      anchor.click();
                      anchor.remove();
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Download export
                  </Button>
                  <Badge tone="outline">JSON</Badge>
                </div>
              </section>

              <section className="rounded-xl border border-danger/30 bg-danger/[0.04] p-4">
                <SectionTitle>Delete account</SectionTitle>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  This permanently deletes your profile, memberships, messages, attachments, and
                  memories. Other members may still see conversations without you. This cannot be undone.
                </p>
                <div className="mt-3 space-y-3">
                  <Field label="Password">
                    <Input
                      type="password"
                      value={deletePassword}
                      onChange={(event) => setDeletePassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </Field>
                  <Field label='Type "DELETE" to confirm'>
                    <Input
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button
                      variant="danger"
                      loading={deleteBusy}
                      disabled={deleteConfirmation !== "DELETE" || !deletePassword}
                      onClick={() => void deleteAccount()}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete my account
                    </Button>
                  </div>
                </div>
              </section>

              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Self-hosted NEXA stores data in PostgreSQL and in the storage adapter you configure.
                Backups are your responsibility. See the README for retention and backup guidance.
              </p>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
