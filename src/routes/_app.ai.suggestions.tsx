/**
 * AI Suggestions — Phase 15C
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { SuggestionCard } from "@/components/ai/SuggestionCard";
import { ManualSuggestionModal } from "@/components/ai/ManualSuggestionModal";
import {
  useAISuggestions,
  useAcceptSuggestion,
  useRejectSuggestion,
  useDismissSuggestion,
  useCreateSuggestion,
} from "@/hooks/api/useAI";
import { useAuth } from "@/contexts/auth-context";
import { isAIReadOnly, canManageAI } from "@/types/ai-view";
import type { AISuggestionStatus } from "@/types/database";
import { AI_FEATURES } from "@/lib/ai-features";
import { ArrowLeft, Plus, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ai/suggestions")({
  head: () => ({ meta: [{ title: "AI Suggestions — ElectraFlow AI" }] }),
  component: AISuggestionsPage,
});

function AISuggestionsPage() {
  const { role } = useAuth();
  const readOnly = isAIReadOnly(role);
  const canCreate = canManageAI(role) && AI_FEATURES.manualSuggestions;
  const [status, setStatus] = useState<AISuggestionStatus | "all">("pending");
  const [modalOpen, setModalOpen] = useState(false);

  const filters = useMemo(() => ({ status }), [status]);
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAISuggestions(filters);

  const acceptMut = useAcceptSuggestion();
  const rejectMut = useRejectSuggestion();
  const dismissMut = useDismissSuggestion();
  const createMut = useCreateSuggestion();

  const items = data?.pages.flatMap((p) => p.data?.items ?? []) ?? [];
  const isPending = acceptMut.isPending || rejectMut.isPending || dismissMut.isPending;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/ai">
          <ArrowLeft className="h-4 w-4 mr-1" />
          AI Hub
        </Link>
      </Button>

      <PageHeader
        title="AI Suggestions"
        subtitle="Review pending suggestions or create manual entries."
        actions={
          canCreate ? (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Manual suggestion
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={status}
        onValueChange={(v) => setStatus(v as AISuggestionStatus | "all")}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load suggestions"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No suggestions" description="Nothing matches this filter." />
      ) : (
        <div className="space-y-4">
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              isPending={isPending}
              onAccept={
                readOnly
                  ? undefined
                  : (id) => void runAction(() => acceptMut.mutateAsync(id), "Accepted")
              }
              onReject={
                readOnly
                  ? undefined
                  : (id) => void runAction(() => rejectMut.mutateAsync(id), "Rejected")
              }
              onDismiss={
                readOnly
                  ? undefined
                  : (id) => void runAction(() => dismissMut.mutateAsync(id), "Dismissed")
              }
            />
          ))}
          {hasNextPage && (
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              Load more
            </Button>
          )}
        </div>
      )}

      <ManualSuggestionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        isPending={createMut.isPending}
        onSubmit={async (input) => {
          const res = await createMut.mutateAsync(input);
          if (res.error) toast.error(res.error.message);
          else toast.success("Suggestion created");
        }}
      />
    </>
  );
}

async function runAction(fn: () => Promise<{ error?: { message: string } | null }>, okMsg: string) {
  const res = await fn();
  if (res.error) toast.error(res.error.message);
  else toast.success(okMsg);
}
