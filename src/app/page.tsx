import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  Layers3,
  MessagesSquare,
  Quote,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { getSessionUser } from "@/server/auth";

export default async function LandingPage() {
  const session = await getSessionUser();
  if (session) redirect("/app");

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-70" />
      <div className="pointer-events-none absolute -left-40 -top-48 h-[520px] w-[520px] rounded-full bg-signal/[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-[420px] w-[420px] rounded-full bg-[#7d5cff]/[0.06] blur-[120px]" />

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="NEXA home">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-signal text-signal-foreground">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M5 18V6l14 12V6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-[0.24em]">NEXA</span>
          <span className="hidden rounded-full border border-border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:inline">
            private beta
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            Create account
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <section className="grid items-center gap-12 pb-20 pt-12 lg:grid-cols-[1.02fr_.98fr] lg:pt-20">
          <div className="animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
              </span>
              AI with receipts. Every answer cites a message.
            </div>
            <h1 className="font-display text-[clamp(2.9rem,6vw,5.2rem)] leading-[0.98] tracking-[-0.035em] text-balance">
              Every conversation,
              <br />
              <span className="italic text-signal">more intelligent.</span>
            </h1>
            <p className="mt-7 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
              NEXA is a real-time messaging workspace built for teams who think out loud.
              Capture decisions, turn threads into tasks, and ask your conversation what it actually decided
              — with sources you can verify.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="group inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground shadow-[0_0_40px_-10px_hsl(var(--signal)/.8)] transition hover:brightness-105"
              >
                Start a conversation
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card/50 px-5 text-sm text-foreground backdrop-blur transition hover:bg-accent"
              >
                <MessagesSquare className="h-4 w-4 text-muted-foreground" />
                Enter workspace
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-signal" /> Self-hosted by default
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-signal" /> Ollama or Gemini AI
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-signal" /> No mock data
              </span>
            </div>
          </div>

          <div className="relative animate-fade-up animation-delay-100">
            <div className="absolute -inset-6 rounded-[32px] bg-signal/[0.04] blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 shadow-lift backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-danger/60" />
                    <span className="h-2 w-2 rounded-full bg-[#f0b84a]/60" />
                    <span className="h-2 w-2 rounded-full bg-signal/70" />
                  </div>
                  <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    #launch-room
                  </span>
                </div>
                <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-signal">
                  Live
                </span>
              </div>
              <div className="space-y-4 px-5 py-5">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2E1F2E] text-[9px] font-semibold text-[#E9B7E2]">
                    MC
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium">
                      Mira Chen <span className="ml-1 font-normal text-muted-foreground">10:42</span>
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
                      Locking the beta for Friday. Final QA on rooms tonight — anything still open?
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#20263A] text-[9px] font-semibold text-[#B9C6FF]">
                    JB
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium">
                      Jonas Berg <span className="ml-1 font-normal text-muted-foreground">10:44</span>
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
                      Two: room expiry copy, and attachment auth on S3. I can take both.
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground">
                      <Layers3 className="h-3 w-3 text-signal" />
                      Task · attachment auth · due Thu
                    </div>
                  </div>
                </div>
                <div className="ml-10 rounded-xl border border-signal/25 bg-signal/[0.06] p-3.5">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal">
                    <Sparkles className="h-3 w-3" /> Nexa intelligence
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">
                    Beta ships Friday. Jonas owns attachment auth; Mira owns final room QA.
                    One open question: S3 credential rotation.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      Mira · 10:42
                    </span>
                    <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      Jonas · 10:44
                    </span>
                    <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      +2 sources
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2.5">
                  <span className="text-[12px] text-muted-foreground">Ask this conversation…</span>
                  <span className="ml-auto rounded-md bg-signal px-2 py-1 text-[9px] font-semibold text-signal-foreground">
                    Ask NEXA
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-6 hidden rounded-xl border border-border bg-card/90 px-3.5 py-2.5 shadow-soft backdrop-blur md:block">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-signal" />
                <div>
                  <p className="text-[10px] font-medium">Server-side auth</p>
                  <p className="text-[9px] text-muted-foreground">Private files. Real permissions.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-border/70 py-14 md:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "Real-time, not refresh-time",
              body: "Socket.IO presence, typing, receipts, reactions, and pinned context — delivered instantly to the right people.",
            },
            {
              icon: Search,
              title: "Search that understands",
              body: "Postgres full-text plus optional embeddings. Ask a question and get an answer with evidence chips back to the source.",
            },
            {
              icon: Quote,
              title: "AI you can audit",
              body: "Summaries and answers cite stored message IDs. Conversation text is treated as untrusted data, never instructions.",
            },
          ].map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-border/70 bg-card/40 p-5">
              <feature.icon className="h-5 w-5 text-signal" />
              <h2 className="mt-4 text-sm font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-border/70 bg-card/50 p-7 md:flex-row md:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-signal">
              Built to be inspected
            </p>
            <h2 className="mt-2 font-display text-2xl">Private by architecture, intelligent by design.</h2>
            <p className="mt-2 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
              Every protected operation checks membership server-side. Sessions are hashed. Uploads are
              signature-validated and streamed through an authorization gate. AI is optional — and never
              pretends to be available when it isn&apos;t.
            </p>
          </div>
          <Link
            href="/register"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-signal/30 bg-signal/10 px-4 py-2.5 text-xs font-semibold text-signal transition hover:bg-signal/15"
          >
            Open NEXA
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-[10px] text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} NEXA. A self-hostable messaging workspace.</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-signal" />
            Not end-to-end encrypted. AI runs server-side when enabled.
          </span>
        </div>
      </footer>
    </div>
  );
}
