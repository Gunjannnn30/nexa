"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { apiGet, apiPost, errorMessage } from "@/lib/client/api";
import { setAppFlash } from "@/lib/client/flash";
import { Avatar, Badge, Button, Input, Label, Spinner } from "@/components/ui";
import type { AppInvitePreview } from "@/lib/client/types";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

type FieldErrors = Record<string, string>;

type RegisterInviteResult =
  | { accepted: true; conversationId: string | null; inviterName: string }
  | { accepted: false; reason: string };

type RegisterResponse = {
  invite?: RegisterInviteResult;
};

export function AuthForm({
  mode,
  inviteToken = null,
}: {
  mode: Mode;
  inviteToken?: string | null;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [pending, setPending] = React.useState(false);
  const [invite, setInvite] = React.useState<AppInvitePreview | null>(null);
  const [inviteLoading, setInviteLoading] = React.useState(Boolean(inviteToken));

  React.useEffect(() => {
    if (!inviteToken) return;
    let active = true;
    setInviteLoading(true);
    apiGet<{ invite: AppInvitePreview }>(`/api/app-invites/public/${encodeURIComponent(inviteToken)}`)
      .then((data) => {
        if (active) setInvite(data.invite);
      })
      .catch(() => {
        if (active) {
          setInvite({
            valid: false,
            status: "invalid",
            reason: "We could not check this invite link. You can still create an account normally.",
            inviter: null,
            note: null,
            expiresAt: null,
            remainingUses: null,
          });
        }
      })
      .finally(() => {
        if (active) setInviteLoading(false);
      });
    return () => {
      active = false;
    };
  }, [inviteToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      if (mode === "login") {
        await apiPost("/api/auth/login", { identifier, password });
        router.replace("/app");
      } else {
        const data = await apiPost<RegisterResponse>("/api/auth/register", {
          name,
          email,
          username,
          password,
          ...(inviteToken ? { inviteToken } : {}),
        });
        if (data?.invite) {
          if (data.invite.accepted && data.invite.conversationId) {
            router.replace(`/app/${data.invite.conversationId}`);
          } else {
            setAppFlash({
              tone: "warning",
              message: data.invite.accepted
                ? "Your account was created, but the welcome conversation could not be opened yet. Find your inviter in Contacts to start chatting."
                : `Your account was created, but the invite link could not connect you. ${data.invite.reason}`,
            });
            router.replace("/app");
          }
        } else {
          router.replace("/app");
        }
      }
      router.refresh();
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      const details = (cause as { details?: unknown }).details;
      if (Array.isArray(details)) {
        const next: FieldErrors = {};
        for (const issue of details as { path?: string; message?: string }[]) {
          if (issue.path && issue.message) next[issue.path] = issue.message;
        }
        setFieldErrors(next);
      }
    } finally {
      setPending(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="w-full max-w-[400px] animate-fade-up">
      <div className="mb-8">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-signal">
          {isLogin ? "Welcome back" : invite?.valid ? "You're invited" : "Create your workspace"}
        </p>
        <h1 className="font-display text-[2rem] leading-tight tracking-[-0.02em]">
          {isLogin
            ? "Pick up where you left off."
            : invite?.valid
              ? "Join the conversation."
              : "Start with a signal, not a signup form."}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {isLogin
            ? "Sign in with your email or username. Sessions are server-side and revocable."
            : invite?.valid
              ? `Create your account to join ${invite.inviter?.name ?? "your inviter"} on NEXA.`
              : "Real people, real conversations. No demo mode, no fake inbox."}
        </p>
      </div>

      {!isLogin && inviteToken ? (
        <div
          className={cn(
            "mb-5 rounded-2xl border p-3.5",
            invite?.valid || inviteLoading
              ? "border-signal/30 bg-signal/[0.05]"
              : "border-amber-500/30 bg-amber-500/[0.06]",
          )}
        >
          {inviteLoading ? (
            <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              Checking your invite link…
            </div>
          ) : invite?.valid && invite.inviter ? (
            <div className="flex items-start gap-3">
              <Avatar name={invite.inviter.name} src={invite.inviter.avatarUrl} id={invite.inviter.username} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="signal">Invite ready</Badge>
                  <span className="text-[9.5px] text-muted-foreground">
                    {invite.remainingUses === 1 ? "1 use left" : `${invite.remainingUses ?? 0} uses left`}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold">
                  {invite.inviter.name} invited you to NEXA
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  {invite.note?.trim()
                    ? `“${invite.note.trim()}”`
                    : `Create an account below and you will start with a direct conversation with ${invite.inviter.name}.`}
                </p>
                {invite.expiresAt ? (
                  <p className="mt-1 text-[9.5px] text-muted-foreground/80">
                    Link valid until {new Date(invite.expiresAt).toLocaleDateString()}.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-[11px] font-semibold text-amber-500">
                !
              </span>
              <div>
                <p className="text-[12px] font-semibold">This invite link will not connect you</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  {invite?.reason ?? "This invite could not be checked."} You can still create a normal
                  NEXA account below.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-4" noValidate>
        {!isLogin ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  className={cn("pl-9", fieldErrors.name && "border-danger/60")}
                  required
                />
              </div>
              {fieldErrors.name ? <p className="text-[11px] text-danger">{fieldErrors.name}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  placeholder="ada"
                  autoComplete="username"
                  className={cn(fieldErrors.username && "border-danger/60")}
                  required
                />
                {fieldErrors.username ? (
                  <p className="text-[11px] text-danger">{fieldErrors.username}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ada@example.com"
                    autoComplete="email"
                    className={cn("pl-9", fieldErrors.email && "border-danger/60")}
                    required
                  />
                </div>
                {fieldErrors.email ? <p className="text-[11px] text-danger">{fieldErrors.email}</p> : null}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or username</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                className="pl-9"
                required
                autoFocus
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {isLogin ? (
              <span className="text-[10px] text-muted-foreground/70">At least 8 characters</span>
            ) : null}
          </div>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className={cn("pl-9 pr-10", fieldErrors.password && "border-danger/60")}
              required
              minLength={isLogin ? 1 : 8}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password ? (
            <p className="text-[11px] text-danger">{fieldErrors.password}</p>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2.5 text-[11px] leading-relaxed text-danger"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" variant="signal" size="lg" loading={pending} className="w-full">
          {pending ? "One moment…" : isLogin ? "Sign in" : "Create account"}
          {!pending ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
        <span>
          Passwords are hashed with bcrypt. Sessions use hashed, httpOnly cookies. Your conversations are
          stored on this server, not in a third-party inbox.
        </span>
      </div>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        {isLogin ? "New to NEXA?" : "Already have an account?"}{" "}
        <Link
          href={isLogin ? (inviteToken ? `/register?invite=${encodeURIComponent(inviteToken)}` : "/register") : "/login"}
          className="font-medium text-foreground underline decoration-signal/50 underline-offset-4 transition hover:text-signal"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
