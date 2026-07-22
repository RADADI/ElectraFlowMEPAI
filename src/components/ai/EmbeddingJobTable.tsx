/**
 * Embedding jobs table — Phase 15C
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JOB_STATUS_LABEL } from "@/types/ai-view";
import type { EmbeddingJobView } from "@/types/ai-view";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "default",
  completed: "secondary",
  failed: "destructive",
};

interface EmbeddingJobTableProps {
  jobs: EmbeddingJobView[];
  onRetry?: (id: string) => void;
  isRetrying?: boolean;
  canManage?: boolean;
}

export function EmbeddingJobTable({
  jobs,
  onRetry,
  isRetrying,
  canManage,
}: EmbeddingJobTableProps) {
  if (jobs.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No embedding jobs yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Error</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <div className="text-sm font-medium">
                  {job.source_label ?? job.source_id.slice(0, 8)}
                </div>
                <div className="text-xs text-muted-foreground">{job.source_type}</div>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>
                  {JOB_STATUS_LABEL[job.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                {job.error_message ?? "—"}
              </TableCell>
              {canManage && (
                <TableCell>
                  {job.can_retry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRetry?.(job.id)}
                      disabled={isRetrying}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
