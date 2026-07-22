import { Skeleton } from "@/components/ui/skeleton";
import { ClientEmptyState } from "./ClientEmptyState";
import type { ClientActivityView } from "@/types/client-portal-view";

export function ClientActivityFeed({
  items,
  loading,
  compact,
}: {
  items: ClientActivityView[];
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ClientEmptyState
        title="No activity yet"
        description="Project updates shared with clients will appear here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((e) => (
        <div key={e.id} className="rounded-md border p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm">{e.message}</p>
            <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              {new Date(e.created_at).toLocaleDateString()}
            </span>
          </div>
          {e.entity_label && (
            <div className="text-xs text-muted-foreground mt-1">{e.entity_label}</div>
          )}
        </div>
      ))}
    </div>
  );
}
