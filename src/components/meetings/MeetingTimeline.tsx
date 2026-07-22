/**
 * Meeting timeline — merged audit logs + activity events
 */

import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import type { MeetingTimelineItem } from "@/types/meeting-view";
import { formatDateTime } from "@/lib/format";

interface MeetingTimelineProps {
  items: MeetingTimelineItem[];
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function MeetingTimeline({ items, isLoading, error, onRetry }: MeetingTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load timeline"
        description="Check your connection and try again."
        action={
          onRetry ? (
            <button type="button" className="text-sm underline" onClick={onRetry}>
              Retry
            </button>
          ) : undefined
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Meeting events and audit entries will appear here."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 p-3 rounded-md border text-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium capitalize">{item.title}</span>
              <Badge variant="outline" className="text-xs">
                {item.source}
              </Badge>
            </div>
            {item.message && <p className="text-muted-foreground mt-1 text-xs">{item.message}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              {formatDateTime(item.created_at)} · {item.actor_name}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
