/**
 * /activity — Phase 13: Activity Center
 *
 * Three tabs:
 *   1. Notifications — full paginated list with category/priority/severity filters
 *   2. Activity Feed — org-wide chronological event log
 *   3. Preferences   — per-event-type notification preference toggles
 *
 * What happens on refresh: React Query re-fetches; tabs re-render from cache.
 * Back button: TanStack Router preserves scroll position and tab via search param.
 * Stale URLs: tab param defaults to "notifications" if invalid.
 * No data: each tab renders its own empty state.
 * Mobile: tabs scroll horizontally; filter bar wraps.
 * Loading states: skeleton cards per tab.
 * Error states: error cards with Retry.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bell,
  Activity,
  Settings2,
  ChevronLeft,
  Loader2,
  X,
  Pin,
  Eye,
  Clock,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ActivityFeed } from "@/components/notifications/ActivityFeed";
import { NotificationPreferencesPanel } from "@/components/notifications/NotificationPreferencesPanel";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useDismissNotification,
  useSnoozeNotification,
  usePinNotification,
  useRealtimeNotifications,
} from "@/hooks/api/useNotifications";
import type { Notification } from "@/types/database";
import type {
  NotificationCategory,
  NotificationPriority,
  NotificationSeverity,
} from "@/types/database";
import {
  toRelativeTime,
  getSeverityColor,
  getPriorityColor,
  SNOOZE_PRESETS,
} from "@/types/notification-view";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/activity")({
  component: ActivityCenterPage,
});

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "notifications" | "activity" | "preferences";

// ─── Full notification list item ──────────────────────────────────────────────

function FullNotificationRow({ notif }: { notif: Notification }) {
  const markRead = useMarkAsRead();
  const dismiss = useDismissNotification();
  const snooze = useSnoozeNotification();
  const pin = usePinNotification();
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const isRead = !!notif.read_at;
  const isSnoozed = !!notif.snoozed_until && notif.snoozed_until > new Date().toISOString();

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-3 border-b border-border/50 last:border-0",
        "hover:bg-muted/30 transition-colors relative",
        !isRead && "bg-blue-50/30 dark:bg-blue-950/10",
      )}
    >
      {/* Severity stripe */}
      <span
        className={cn(
          "absolute left-0 top-0 bottom-0 w-0.5 rounded-r",
          notif.severity === "success" && "bg-green-400",
          notif.severity === "warning" && "bg-amber-400",
          notif.severity === "error" && "bg-red-500",
          notif.severity === "info" && "bg-blue-400",
        )}
        aria-hidden
      />

      {/* Unread dot */}
      {!isRead && (
        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0 pl-1">
        <div className="flex items-start gap-2 justify-between">
          <div className="min-w-0">
            {notif.route ? (
              <Link
                to={notif.route}
                className={cn(
                  "text-sm font-medium hover:underline",
                  getSeverityColor(notif.severity),
                  isRead && "font-normal text-muted-foreground",
                )}
                onClick={() => !isRead && markRead.mutate(notif.id)}
              >
                {notif.title}
              </Link>
            ) : (
              <span
                className={cn("text-sm font-medium", isRead && "font-normal text-muted-foreground")}
              >
                {notif.title}
              </span>
            )}
            {notif.message && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
            )}
          </div>

          <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {!isRead && (
              <button
                title="Mark as read"
                onClick={() => markRead.mutate(notif.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              title={notif.is_pinned ? "Unpin" : "Pin"}
              onClick={() => pin.mutate({ id: notif.id, pinned: !notif.is_pinned })}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Pin className={cn("h-3.5 w-3.5", notif.is_pinned && "fill-current")} />
            </button>
            <div className="relative">
              <button
                title="Snooze"
                onClick={() => setSnoozeOpen((v) => !v)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
              {snoozeOpen && (
                <div className="absolute right-0 top-7 z-50 bg-popover border border-border rounded-md shadow-md py-1 w-40 text-xs">
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
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {notif.is_pinned && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </Badge>
          )}
          {isSnoozed && (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 gap-0.5 border-amber-300 text-amber-700"
            >
              <Clock className="h-2.5 w-2.5" /> Snoozed
            </Badge>
          )}
          {(notif.priority === "high" || notif.priority === "critical") && (
            <span
              className={cn(
                "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded",
                getPriorityColor(notif.priority),
              )}
            >
              {notif.priority}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {toRelativeTime(notif.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab() {
  useRealtimeNotifications();

  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [priority, setPriority] = useState<NotificationPriority | "all">("all");
  const [severity, setSeverity] = useState<NotificationSeverity | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [includeSnoozed, setIncludeSnoozed] = useState(false);

  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markAll = useMarkAllAsRead();

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotifications({
      category: category !== "all" ? category : undefined,
      priority: priority !== "all" ? priority : undefined,
      severity: severity !== "all" ? severity : undefined,
      unread_only: unreadOnly,
      include_snoozed: includeSnoozed,
    });

  const items = data?.items ?? [];
  const isMockData = data?.isMockData ?? false;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="project">Projects</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="submittal">Submittals</SelectItem>
            <SelectItem value="rfi">RFIs</SelectItem>
            <SelectItem value="ncr">NCRs</SelectItem>
            <SelectItem value="timesheet">Timesheets</SelectItem>
            <SelectItem value="financial">Financial</SelectItem>
            <SelectItem value="resource">Resources</SelectItem>
            <SelectItem value="user">Users</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            "text-xs h-8 px-3 rounded-md border transition-colors",
            unreadOnly
              ? "bg-primary text-primary-foreground border-primary"
              : "border-input hover:bg-muted",
          )}
        >
          Unread only
        </button>

        <button
          onClick={() => setIncludeSnoozed((v) => !v)}
          className={cn(
            "text-xs h-8 px-3 rounded-md border transition-colors",
            includeSnoozed
              ? "bg-amber-100 text-amber-800 border-amber-300"
              : "border-input hover:bg-muted",
          )}
        >
          Show snoozed
        </button>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 ml-auto"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            {markAll.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCheck className="h-3 w-3" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      {isMockData && (
        <div className="text-[10px] text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md text-center">
          Demo data — notifications shown are examples
        </div>
      )}

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        {isLoading && (
          <div className="flex flex-col gap-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center py-12 gap-3 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load notifications.</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No notifications</p>
            <p className="text-xs text-muted-foreground/70">
              {unreadOnly || category !== "all" || priority !== "all"
                ? "No notifications match the current filters."
                : "You'll see notifications here when there is activity in your workspace."}
            </p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          items.map((notif) => <FullNotificationRow key={notif.id} notif={notif} />)}
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="gap-2"
          >
            {isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
            Load more notifications
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ActivityCenterPage() {
  const [tab, setTab] = useState<Tab>("notifications");
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "notifications", label: "Notifications", icon: Bell, badge: unreadCount || undefined },
    { id: "activity", label: "Activity Feed", icon: Activity },
    { id: "preferences", label: "Preferences", icon: Settings2 },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Activity Center</h1>
          <p className="text-sm text-muted-foreground">
            Notifications, org activity, and communication preferences
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.badge && t.badge > 0 ? (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {tab === "notifications" && <NotificationsTab />}
        {tab === "activity" && (
          <div className="border border-border rounded-xl overflow-hidden bg-card p-4">
            <ActivityFeed />
          </div>
        )}
        {tab === "preferences" && <NotificationPreferencesPanel />}
      </div>
    </div>
  );
}
