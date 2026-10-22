import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (session) redirect("/app");
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute -right-24 top-0 h-[380px] w-[380px] rounded-full bg-signal/[0.08] blur-[100px]" />
      <header className="relative z-10 flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="NEXA home">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-signal text-signal-foreground">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path d="M5 18V6l14 12V6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
            </svg>
          </span>
          <span className="text-[13px] font-semibold tracking-[0.24em]">NEXA</span>
        </Link>
        <Link
          href="/"
          className="text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          Back to overview
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">{children}</main>
      <div className="relative z-10 px-5 pb-5 text-center text-[10px] text-muted-foreground">
        Server-side AI reads messages only when you invoke it. Never E2E encrypted.
      </div>
    </div>
  );
}
