/**
 * MetricWidgetShell — independent loading/error/empty wrapper for dashboard widgets.
 */

import { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MetricWidgetShellProps {
  label: string;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  notConfigured?: boolean;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
}

export function MetricWidgetShell({
  label,
  isLoading,
  isError,
  isEmpty,
  notConfigured,
  onRetry,
  children,
  className,
}: MetricWidgetShellProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-lg border bg-card p-4 space-y-2", className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn("rounded-lg border border-destructive/30 bg-card p-4", className)}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Failed to load</span>
        </div>
        {onRetry && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        )}
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className={cn("rounded-lg border border-dashed bg-muted/30 p-4", className)}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className="text-sm text-muted-foreground">Not configured yet</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={cn("rounded-lg border bg-card p-4", className)}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-semibold text-muted-foreground">—</p>
        <p className="text-xs text-muted-foreground mt-1">No data</p>
      </div>
    );
  }

  return <>{children}</>;
}
