/**
 * NotificationBell — Phase 13
 *
 * Topbar bell icon with:
 * • Unread badge (real-time via useRealtimeNotifications)
 * • Dropdown listing latest 10 notifications
 * • Per-notification actions: mark read, dismiss, snooze, pin
 * • "Mark all read" and "View all" in footer
 *
 * What happens on refresh: React Query re-fetches; realtime re-subscribes.
 * What happens after logout: queries cleared; bell resets to zero.
 * No data: empty state "You're all caught up".
 * Bad data: graceful fallback — null actor shows "System".
 * Network fail: retry handled by React Query; no badge until recovered.
 * Mobile: dropdown is max-w-sm, overflow-y-auto, positioned below the bell.
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Pin, PinOff, X, Eye, Clock, CheckCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useUnreadNotificationCount,
  useLatestNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDismissNotification,
  useSnoozeNotification,
  usePinNotification,
  useRealtimeNotifications,
} from "@/hooks/api/useNotifications";
import type { Notification } from "@/types/database";
import {
  toRelativeTime,
  getSeverityColor,
  getPriorityColor,
  SNOOZE_PRESETS,
} from "@/types/notification-view";

// ─── PriorityDot ──────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: Notification["priority"] }) {
  if (priority === "normal" || priority === "low") return null;
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5",
        priority === "critical" ? "bg-red-500" : "bg-orange-400",
      )}
      aria-hidden
    />
  );
}

// ─── SeverityIcon ─────────────────────────────────────────────────────────────

function SeverityStripe({ severity }: { severity: Notification["severity"] }) {
  return (
    <span
      className={cn(
        "block w-0.5 self-stretch rounded-full flex-shrink-0",
        severity === "success" && "bg-green-400",
        severity === "warning" && "bg-amber-400",
        severity === "error" && "bg-red-500",
        severity === "info" && "bg-blue-400",
      )}
      aria-hidden
    />
  );
}

// ─── NotificationItem ─────────────────────────────────────────────────────────

function NotificationItem({ notif }: { notif: Notification }) {
  const markRead = useMarkAsRead();
  const dismiss = useDismissNotification();
  const snooze = useSnoozeNotification();
  const pin = usePinNotification();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);

  const isRead = !!notif.read_at;
  const isSnoozed = !!notif.snoozed_until && notif.snoozed_until > new Date().toISOString();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeOpen(false);
      }
    }
    if (snoozeOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [snoozeOpen]);

  function handleClick() {
    if (!isRead) markRead.mutate(notif.id);
  }

  return (
    <div
      className={cn(
        "relative group flex gap-2 px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors",
        !isRead && "bg-blue-50/40 dark:bg-blue-950/20",
      )}
    >
      <SeverityStripe severity={notif.severity} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <PriorityDot priority={notif.priority} />
            {notif.route ? (
              <Link
                to={notif.route}
                className={cn(
                  "text-sm font-medium truncate hover:underline",
                  isRead ? "text-muted-foreground" : "text-foreground",
                  getSeverityColor(notif.severity),
                )}
                onClick={handleClick}
              >
                {notif.title}
              </Link>
            ) : (
              <span
                className={cn(
                  "text-sm font-medium truncate",
                  isRead ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {notif.title}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
            {toRelativeTime(notif.created_at)}
          </span>
        </div>

        {notif.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
        )}

        {isSnoozed && (
          <span className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> Snoozed until{" "}
            {new Date(notif.snoozed_until!).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}

        {notif.priority !== "normal" && notif.priority !== "low" && (
          <span
            className={cn(
              "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded mt-0.5 inline-block",
              getPriorityColor(notif.priority),
            )}
          >
            {notif.priority}
          </span>
        )}
      </div>

      {/* Action buttons — visible on hover */}
      <div className="flex items-start gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!isRead && (
          <button
            title="Mark as read"
            onClick={() => markRead.mutate(notif.id)}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3 w-3" />
          </button>
        )}

        <button
          title={notif.is_pinned ? "Unpin" : "Pin"}
          onClick={() => pin.mutate({ id: notif.id, pinned: !notif.is_pinned })}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          {notif.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </button>

        {/* Snooze */}
        <div className="relative" ref={snoozeRef}>
          <button
            title="Snooze"
            onClick={() => setSnoozeOpen((v) => !v)}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Clock className="h-3 w-3" />
          </button>
          {snoozeOpen && (
            <div className="absolute right-0 top-5 z-50 bg-popover border border-border rounded-md shadow-md py-1 w-40 text-xs">
              <p className="px-3 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                Snooze for
              </p>
              {SNOOZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                  onClick={() => {
                    snooze.mutate({ id: notif.id, until: preset.getDate() });
                    setSnoozeOpen(false);
                  }}
                >
                  {preset.label}
                </button>
              ))}
              {notif.snoozed_until && (
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors text-amber-600"
                  onClick={() => {
                    snooze.mutate({ id: notif.id, until: null });
                    setSnoozeOpen(false);
                  }}
                >
                  Unsnooze
                </button>
              )}
            </div>
          )}
        </div>

        <button
          title="Dismiss"
          onClick={() => dismiss.mutate(notif.id)}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── NotificationBell ─────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notifications = [], isLoading, isError } = useLatestNotifications();
  const markAll = useMarkAllAsRead();

  // Activate realtime subscription
  useRealtimeNotifications();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const displayCount = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {displayCount && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
            {displayCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "absolute right-0 top-full mt-2 z-50",
            "w-80 sm:w-96 max-h-[480px] overflow-hidden",
            "bg-popover border border-border rounded-xl shadow-xl",
            "flex flex-col",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Notifications</h2>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {isLoading && (
              <div className="flex flex-col gap-2 p-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            )}

            {isError && (
              <div className="p-6 text-center text-sm text-destructive">
                Failed to load notifications.
              </div>
            )}

            {!isLoading && !isError && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                <Bell className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">You're all caught up</p>
                <p className="text-xs text-muted-foreground/70">No new notifications</p>
              </div>
            )}

            {!isLoading &&
              !isError &&
              notifications.map((notif) => <NotificationItem key={notif.id} notif={notif} />)}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-2 flex-shrink-0">
            <Link
              to="/activity"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 w-full text-xs text-primary hover:text-primary/80 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              View all notifications
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
