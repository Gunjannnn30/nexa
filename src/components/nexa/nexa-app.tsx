"use client";

import * as React from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui";
import { AiPanel } from "@/components/nexa/ai-panel";
import { ChatView } from "@/components/nexa/chat-view";
import { ForwardDialog } from "@/components/nexa/forward-dialog";
import { InfoPanel } from "@/components/nexa/info-panel";
import { NewConversationDialog } from "@/components/nexa/new-conversation-dialog";
import { NotificationsPanel } from "@/components/nexa/notifications-panel";
import { Rail, type InboxFilter } from "@/components/nexa/rail";
import { SavedDialog } from "@/components/nexa/saved-dialog";
import { SearchDialog } from "@/components/nexa/search-dialog";
import { SettingsDialog } from "@/components/nexa/settings-dialog";
import { Sidebar } from "@/components/nexa/sidebar";
import { useNexa } from "@/components/nexa/nexa-store";
import { takeAppFlash } from "@/lib/client/flash";
import type { InfoTab } from "@/components/nexa/types";
import type { Message } from "@/lib/client/types";
import { cn } from "@/lib/utils";

function useThemeSync() {
  const { profile } = useNexa();
  const [resolved, setResolved] = React.useState<"light" | "dark">("dark");
  const theme = profile.settings.theme;

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      try {
        localStorage.setItem("nexa-theme", theme);
      } catch {
        /* storage can be unavailable in private mode */
      }
      setResolved(dark ? "dark" : "light");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return resolved;
}

export function NexaApp() {
  const { activeId, activeConversation, openConversation, closeConversation, profile } = useNexa();
  const [filter, setFilter] = React.useState<InboxFilter>("all");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchScope, setSearchScope] = React.useState<"all" | "conversation">("all");
  const [newOpen, setNewOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [savedOpen, setSavedOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [infoTab, setInfoTab] = React.useState<InfoTab>("overview");
  const [aiOpen, setAiOpen] = React.useState(false);
  const [forwarding, setForwarding] = React.useState<Message | null>(null);
  const theme = useThemeSync();

  React.useEffect(() => {
    const flash = takeAppFlash();
    if (!flash) return;
    if (flash.tone === "warning") toast.warning(flash.message);
    else if (flash.tone === "error") toast.error(flash.message);
    else toast.success(flash.message);
  }, []);

  const openSearch = React.useCallback((scope: "all" | "conversation") => {
    setSearchScope(scope);
    setSearchOpen(true);
  }, []);

  const openInfo = React.useCallback((tab: InfoTab) => {
    setInfoTab(tab);
    setInfoOpen(true);
    setAiOpen(false);
    setNotificationsOpen(false);
  }, []);

  const toggleAi = React.useCallback(() => {
    setAiOpen((value) => !value);
    setInfoOpen(false);
  }, []);

  const jumpTo = React.useCallback(
    (conversationId: string, messageId?: string | null) => {
      setInfoOpen(false);
      setAiOpen(false);
      openConversation(conversationId, messageId ?? null);
    },
    [openConversation],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchScope("all");
        setSearchOpen(true);
        return;
      }
      if (modifier && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNewOpen(true);
        return;
      }
      if (modifier && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!activeId) {
      setInfoOpen(false);
      setAiOpen(false);
    }
  }, [activeId]);

  React.useEffect(() => {
    if (activeConversation?.isAi) setAiOpen(false);
  }, [activeConversation?.isAi]);

  return (
    <TooltipProvider delayDuration={220}>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <a
          href="#nexa-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-signal focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-signal-foreground"
        >
          Skip to conversation
        </a>

        <Rail
          filter={filter}
          onFilter={setFilter}
          onSaved={() => setSavedOpen(true)}
          onNotifications={() => setNotificationsOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          notificationsOpen={notificationsOpen}
        />

        <div
          className={cn(
            "h-full min-w-0 shrink-0 md:flex md:w-[306px] xl:w-[326px]",
            activeId ? "hidden md:block" : "flex w-full",
          )}
        >
          <Sidebar
            filter={filter}
            onFilter={setFilter}
            onNew={() => setNewOpen(true)}
            onSearch={() => openSearch("all")}
            onSettings={() => setSettingsOpen(true)}
            onNotifications={() => setNotificationsOpen(true)}
            notificationsOpen={notificationsOpen}
          />
        </div>

        <main
          id="nexa-main"
          className={cn("h-full min-w-0 flex-1", activeId ? "flex" : "hidden md:flex")}
        >
          <ChatView
            onOpenSearch={openSearch}
            onOpenInfo={openInfo}
            onToggleAi={toggleAi}
            aiOpen={aiOpen}
            onForward={setForwarding}
            onBranch={(conversationId: string) => jumpTo(conversationId)}
            onBack={closeConversation}
          />
        </main>

        <InfoPanel
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          tab={infoTab}
          onTabChange={setInfoTab}
          onJump={jumpTo}
        />

        <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} onJump={jumpTo} />

        <NotificationsPanel
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onJump={jumpTo}
        />

        <SearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          initialScope={searchScope}
          onJump={jumpTo}
        />

        <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} />

        <SavedDialog
          open={savedOpen}
          onOpenChange={setSavedOpen}
          onJump={(conversationId, messageId) => jumpTo(conversationId, messageId)}
        />

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

        <ForwardDialog
          message={forwarding}
          onOpenChange={(open) => {
            if (!open) setForwarding(null);
          }}
        />

        <Toaster
          theme={theme}
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
              fontSize: "12.5px",
            },
          }}
        />

        <span className="sr-only" aria-live="polite">
          Signed in as {profile.name}
        </span>
      </div>
    </TooltipProvider>
  );
}
