"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { apiPost, errorMessage } from "@/lib/client/api";
import { Button, Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

type FieldErrors = Record<string, string>;

export function AuthForm({ mode }: { mode: Mode }) {
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    try {
      if (mode === "login") {
        await apiPost("/api/auth/login", { identifier, password });
      } else {
        await apiPost("/api/auth/register", { name, email, username, password });
      }
      router.replace("/app");
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
          {isLogin ? "Welcome back" : "Create your workspace"}
        </p>
        <h1 className="font-display text-[2rem] leading-tight tracking-[-0.02em]">
          {isLogin ? "Pick up where you left off." : "Start with a signal, not a signup form."}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {isLogin
            ? "Sign in with your email or username. Sessions are server-side and revocable."
            : "Real people, real conversations. No demo mode, no fake inbox."}
        </p>
      </div>

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
          href={isLogin ? "/register" : "/login"}
          className="font-medium text-foreground underline decoration-signal/50 underline-offset-4 transition hover:text-signal"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
