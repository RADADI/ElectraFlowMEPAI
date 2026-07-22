/**
 * Embedding jobs — Phase 15C
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { EmbeddingJobTable } from "@/components/ai/EmbeddingJobTable";
import { useEmbeddingJobs, useRetryEmbeddingJob } from "@/hooks/api/useAI";
import { useAuth } from "@/contexts/auth-context";
import { canManageAI } from "@/types/ai-view";
import type { EmbeddingJobStatus } from "@/types/database";
import { ArrowLeft, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ai/jobs")({
  head: () => ({ meta: [{ title: "Embedding Jobs — ElectraFlow AI" }] }),
  component: AIEmbeddingJobsPage,
});

function AIEmbeddingJobsPage() {
  const { role } = useAuth();
  const canManage = canManageAI(role);
  const [status, setStatus] = useState<EmbeddingJobStatus | "all">("all");

  const filters = useMemo(() => ({ status }), [status]);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEmbeddingJobs(filters);
  const retryMut = useRetryEmbeddingJob();

  const jobs = data?.pages.flatMap((p) => p.data?.items ?? []) ?? [];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/ai">
          <ArrowLeft className="h-4 w-4 mr-1" />
          AI Hub
        </Link>
      </Button>

      <PageHeader
        title="Embedding Jobs"
        subtitle="Track document indexing status and retry failures."
      />

      <div className="mb-4">
        <Select value={status} onValueChange={(v) => setStatus(v as EmbeddingJobStatus | "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load jobs"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <EmbeddingJobTable
            jobs={jobs}
            canManage={canManage}
            isRetrying={retryMut.isPending}
            onRetry={async (id) => {
              const res = await retryMut.mutateAsync(id);
              if (res.error) toast.error(res.error.message);
              else toast.success("Job retried");
            }}
          />
          {hasNextPage && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
