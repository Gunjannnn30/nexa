"use client";

import * as React from "react";
import { Bell, CheckCheck, Inbox, X } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Spinner,
} from "@/components/ui";
import { useNexa } from "@/components/nexa/nexa-store";
import { relative } from "@/lib/client/format";
import { cn } from "@/lib/utils";

export function NotificationsPanel({
  open,
  onClose,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  onJump: (conversationId: string, messageId?: string | null) => void;
}) {
  const {
    notifications,
    notificationsCursor,
    unreadNotifications,
    invites,
    markNotificationsRead,
    loadNotificationsMore,
    handleInvite,
    openConversation,
  } = useNexa();
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [invitePending, setInvitePending] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const openNotification = async (notification: (typeof notifications)[number]) => {
    if (!notification.isRead) {
      await markNotificationsRead(false, [notification.id]).catch(() => {});
    }
    if (notification.conversationId) {
      if (notification.messageId) onJump(notification.conversationId, notification.messageId);
      else openConversation(notification.conversationId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[85]" role="dialog" aria-modal="true" aria-label="Notifications">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <aside className="absolute inset-y-0 right-0 flex w-[min(100vw,390px)] flex-col border-l border-border bg-card shadow-lift">
        <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Inbox
            </p>
            <h2 className="mt-0.5 font-display text-xl">Notifications</h2>
          </div>
          <div className="flex items-center gap-1">
            {unreadNotifications > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void markNotificationsRead(true)}
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark read
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {invites.length > 0 ? (
            <section className="border-b border-border/70 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="signal">Invitations</Badge>
                <span className="text-[9.5px] text-muted-foreground">{invites.length} pending</span>
              </div>
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div key={invite.id} className="rounded-xl border border-signal/25 bg-signal/[0.05] p-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar
                        name={invite.inviter.name}
                        src={invite.inviter.avatarUrl}
                        id={invite.inviter.id}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] leading-snug">
                          <span className="font-semibold">{invite.inviter.name}</span> invited you to{" "}
                          <span className="font-semibold">{invite.conversation.title ?? "a conversation"}</span>
                        </p>
                        {invite.conversation.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                            {invite.conversation.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="signal"
                            loading={invitePending === invite.id}
                            onClick={async () => {
                              setInvitePending(invite.id);
                              try {
                                await handleInvite(invite, "accept");
                              } finally {
                                setInvitePending(null);
                              }
                            }}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={invitePending === invite.id}
                            onClick={async () => {
                              setInvitePending(invite.id);
                              try {
                                await handleInvite(invite, "decline");
                              } finally {
                                setInvitePending(null);
                              }
                            }}
                          >
                            Decline
                          </Button>
                          <span className="ml-auto text-[9px] text-muted-foreground">
                            expires {new Date(invite.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-4 w-4" />}
              title="Nothing new"
              description="Mentions, replies, invitations, task assignments, and AI digests will appear here."
              className="py-16"
            />
          ) : (
            <ul className="divide-y divide-border/50">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-secondary/30",
                      !notification.isRead && "bg-signal/[0.035]",
                    )}
                  >
                    {notification.actor ? (
                      <Avatar
                        name={notification.actor.name}
                        src={notification.actor.avatarUrl}
                        id={notification.actor.id}
                        size="sm"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
                        <Inbox className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span
                          className={cn(
                            "text-[11.5px] leading-snug",
                            notification.isRead ? "text-foreground/80" : "font-medium text-foreground",
                          )}
                        >
                          {notification.title}
                        </span>
                        {!notification.isRead ? (
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-relaxed text-muted-foreground">
                        {notification.body}
                      </span>
                      <span className="mt-1 block text-[9px] text-muted-foreground/70">
                        {relative(notification.createdAt)} ago
                        {notification.conversationId ? " · open conversation" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {notificationsCursor ? (
            <div className="p-4">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                loading={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  try {
                    await loadNotificationsMore();
                  } finally {
                    setLoadingMore(false);
                  }
                }}
              >
                {loadingMore ? <Spinner /> : null} Load older notifications
              </Button>
            </div>
          ) : null}
        </div>
        <footer className="border-t border-border/70 px-4 py-2.5 text-[9px] text-muted-foreground">
          Notification preferences live in Settings → Preferences.
        </footer>
      </aside>
    </div>
  );
}
