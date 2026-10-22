import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NEXA — Every conversation, more intelligent.",
    template: "%s · NEXA",
  },
  description:
    "NEXA is a real-time messaging workspace with grounded AI summaries, search, side threads, and shared task memory.",
  applicationName: "NEXA",
  keywords: ["messaging", "AI", "team chat", "summaries", "workspace"],
  authors: [{ name: "NEXA" }],
  openGraph: {
    title: "NEXA — Every conversation, more intelligent.",
    description:
      "Real-time messaging with AI that cites its sources. Groups, rooms, side threads, shared tasks, and search.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem("nexa-theme")||"dark";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain min-h-dvh">{children}</body>
    </html>
  );
}
