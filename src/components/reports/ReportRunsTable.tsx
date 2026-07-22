/**
 * ReportRunsTable
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2 } from "lucide-react";
import { ExportFormatBadge } from "@/components/reports/ExportFormatBadge";
import type { ReportRunView } from "@/types/report-view";

interface ReportRunsTableProps {
  runs: ReportRunView[];
  isLoading?: boolean;
  onDownload?: (runId: string) => void;
  downloadingId?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isFetchingMore?: boolean;
}

export function ReportRunsTable({
  runs,
  isLoading,
  onDownload,
  downloadingId,
  onLoadMore,
  hasMore,
  isFetchingMore,
}: ReportRunsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="font-medium">No report runs yet</p>
        <p className="text-sm mt-1">Run a saved report to see export history here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{run.report_name ?? "(Deleted report)"}</TableCell>
                <TableCell className="capitalize">{run.report_type}</TableCell>
                <TableCell>
                  <ExportFormatBadge format={run.format} status={run.status} />
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      run.status === "completed"
                        ? "default"
                        : run.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {run.status}
                  </Badge>
                  {run.error_message && (
                    <p
                      className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] truncate"
                      title={run.error_message}
                    >
                      {run.error_message}
                    </p>
                  )}
                </TableCell>
                <TableCell>{run.row_count}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {run.started_at ? new Date(run.started_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {run.status === "completed" && run.format === "csv" && onDownload ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingId === run.id}
                      onClick={() => onDownload(run.id)}
                    >
                      {downloadingId === run.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3 mr-1" />
                      )}
                      CSV
                    </Button>
                  ) : run.format !== "csv" ? (
                    <span className="text-xs text-muted-foreground">N/A</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isFetchingMore}>
            {isFetchingMore && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
