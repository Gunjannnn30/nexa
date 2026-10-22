"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  Bell,
  Inbox,
  MessagesSquare,
  Settings2,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Avatar, Badge, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useNexa } from "@/components/nexa/nexa-store";

export type InboxFilter = "all" | "unread" | "favorites" | "archived";

export function Rail({
  filter,
  onFilter,
  onSaved,
  onNotifications,
  onSettings,
  notificationsOpen,
}: {
  filter: InboxFilter;
  onFilter: (filter: InboxFilter) => void;
  onSaved: () => void;
  onNotifications: () => void;
  onSettings: () => void;
  notificationsOpen: boolean;
}) {
  const { profile, totalUnread, unreadNotifications, connected } = useNexa();

  const items: { key: InboxFilter; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "all", label: "All conversations", icon: MessagesSquare, count: totalUnread },
    { key: "unread", label: "Unread", icon: Inbox, count: totalUnread },
    { key: "favorites", label: "Favorites", icon: Star },
    { key: "archived", label: "Archived", icon: Archive },
  ];

  return (
    <nav
      aria-label="Workspace navigation"
      className="hidden w-[68px] shrink-0 flex-col items-center border-r border-border/70 bg-card/20 py-4 md:flex"
    >
      <Link
        href="/app"
        className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-signal text-signal-foreground shadow-[0_0_30px_-8px_hsl(var(--signal)/.8)]"
        aria-label="NEXA home"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
          <path d="M5 18V6l14 12V6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
        </svg>
      </Link>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        {items.map((item) => {
          const active = filter === item.key;
          return (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onFilter(item.key)}
                  aria-label={item.label}
                  aria-pressed={active}
                  className={cn(
                    "group relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition",
                    active
                      ? "border-border bg-secondary text-foreground"
                      : "hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  {item.count ? (
                    <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-signal px-1 text-[9px] font-bold text-signal-foreground">
                      {item.count > 99 ? "99+" : item.count}
                    </span>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="my-2 h-px w-6 bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSaved}
              aria-label="Saved messages"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Star className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Saved messages</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onNotifications}
              aria-label="Notifications"
              aria-pressed={notificationsOpen}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition",
                notificationsOpen
                  ? "border-border bg-secondary text-foreground"
                  : "hover:bg-accent hover:text-foreground",
              )}
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadNotifications ? (
                <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-danger-foreground">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Notifications</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            connected ? "bg-signal shadow-[0_0_8px_hsl(var(--signal)/.8)]" : "bg-danger/80",
          )}
          title={connected ? "Real-time connected" : "Reconnecting"}
          aria-label={connected ? "Real-time connected" : "Reconnecting"}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSettings}
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Settings2 className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onSettings}
              aria-label="Your profile"
              className="relative rounded-full ring-offset-2 ring-offset-background transition hover:ring-2 hover:ring-border"
            >
              <Avatar name={profile.name} src={profile.avatarUrl} id={profile.id} size="sm" online={connected} />
              {profile.statusText ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-signal" />
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{profile.name}</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}

export function MobileTopBar({
  onSettings,
  onNotifications,
  unreadNotifications,
}: {
  onSettings: () => void;
  onNotifications: () => void;
  unreadNotifications: number;
}) {
  const { profile } = useNexa();
  return (
    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 md:hidden">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-signal text-signal-foreground">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
            <path d="M5 18V6l14 12V6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
          </svg>
        </span>
        <span className="text-[13px] font-semibold tracking-[0.24em]">NEXA</span>
        <Badge tone="outline">beta</Badge>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNotifications}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadNotifications ? (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />
          ) : null}
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="rounded-full"
          aria-label="Your profile and settings"
        >
          <Avatar name={profile.name} src={profile.avatarUrl} id={profile.id} size="sm" />
        </button>
      </div>
    </div>
  );
}
