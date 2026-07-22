/**
 * ExportFormatBadge — honest status for CSV/XLSX/PDF exports.
 */

import { Badge } from "@/components/ui/badge";
import type { ReportFormat, ReportRunStatus } from "@/types/database";
import { cn } from "@/lib/utils";

interface ExportFormatBadgeProps {
  format: ReportFormat;
  status: ReportRunStatus;
  className?: string;
}

export function ExportFormatBadge({ format, status, className }: ExportFormatBadgeProps) {
  const isUnavailable = (format === "xlsx" || format === "pdf") && status === "failed";

  if (isUnavailable) {
    return (
      <Badge variant="outline" className={cn("text-amber-700 border-amber-300", className)}>
        {format.toUpperCase()} — Not configured
      </Badge>
    );
  }

  const variant =
    status === "completed"
      ? "default"
      : status === "failed"
        ? "destructive"
        : status === "running"
          ? "secondary"
          : "outline";

  return (
    <Badge variant={variant} className={className}>
      {format.toUpperCase()} · {status}
    </Badge>
  );
}
