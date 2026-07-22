/**
 * ActivityFeed — Phase 13
 *
 * Renders a chronological list of ActivityEvent rows with cursor pagination
 * ("Load more" button). Used inside /activity route.
 */

import {
  FolderKanban,
  FileText,
  ClipboardCheck,
  MessageSquare,
  AlertTriangle,
  Users,
  Clock,
  DollarSign,
  UserCheck,
  Settings,
  Building2,
  Sparkles,
  BarChart3,
  Calendar,
  Zap,
  CreditCard,
  Bell,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useActivityEvents, useRealtimeActivity } from "@/hooks/api/useNotifications";
import type { ActivityEvent } from "@/types/database";
import type { NotificationCategory, ActivityFilters } from "@/types/notification-view";
import { toRelativeTime, getCategoryIcon } from "@/types/notification-view";

// ─── Category icon map ────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  FolderKanban,
  FileText,
  ClipboardCheck,
  MessageSquare,
  AlertTriangle,
  Users,
  Clock,
  DollarSign,
  UserCheck,
  Settings,
  Building2,
  Sparkles,
  BarChart3,
  Calendar,
  Zap,
  CreditCard,
  Bell,
};

function CategoryIcon({
  category,
  className,
}: {
  category: NotificationCategory;
  className?: string;
}) {
  const name = getCategoryIcon(category);
  const Icon = ICON_MAP[name] ?? Bell;
  return <Icon className={cn("h-4 w-4", className)} />;
}

// ─── Visibility badge ─────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility: ActivityEvent["visibility"] }) {
  if (visibility === "internal") return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] h-4 px-1.5 font-normal",
        visibility === "client_visible" && "border-blue-300 text-blue-700",
        visibility === "private" && "border-slate-300 text-slate-500",
      )}
    >
      {visibility === "client_visible" ? "Client visible" : "Private"}
    </Badge>
  );
}

// ─── ActivityEventRow ─────────────────────────────────────────────────────────

function ActivityEventRow({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      {/* Category icon */}
      <div className="flex-shrink-0 mt-0.5">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            "bg-muted text-muted-foreground",
          )}
        >
          <CategoryIcon category={event.category} className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-foreground">{event.message}</p>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
            {toRelativeTime(event.created_at)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {event.entity_label && (
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
              {event.entity_label}
            </span>
          )}
          <VisibilityBadge visibility={event.visibility} />
        </div>
      </div>
    </div>
  );
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  filters?: Omit<ActivityFilters, "cursor">;
  className?: string;
}

export function ActivityFeed({ filters = {}, className }: ActivityFeedProps) {
  useRealtimeActivity();

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useActivityEvents(filters);

  const items = data?.items ?? [];
  const isMockData = data?.isMockData ?? false;

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-3 p-4", className)}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
              <div className="h-3 bg-muted animate-pulse rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("flex flex-col items-center py-12 gap-3 text-center", className)}>
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive font-medium">Failed to load activity feed.</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn("flex flex-col items-center py-16 gap-3 text-center", className)}>
        <Bell className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground/70">
          Actions across your projects will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {isMockData && (
        <div className="text-[10px] text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md mb-2 text-center">
          Demo data — activity events shown are examples
        </div>
      )}

      {items.map((event) => (
        <ActivityEventRow key={event.id} event={event} />
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="gap-2"
          >
            {isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
