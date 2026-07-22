/**
 * AI Copilot hub — Phase 15C
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { AIBackendBanner } from "@/components/ai/AIBackendBanner";
import { useAIOverviewStats } from "@/hooks/api/useAI";
import {
  Sparkles,
  MessageSquare,
  Lightbulb,
  Database,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/ai")({
  head: () => ({ meta: [{ title: "AI Copilot — ElectraFlow AI" }] }),
  component: AIHubPage,
});

function AIHubPage() {
  const { data: stats, isLoading, isError, refetch } = useAIOverviewStats();

  return (
    <>
      <PageHeader
        title="AI Copilot"
        subtitle="Chat, suggestions, and document indexing foundation."
      />

      <AIBackendBanner onRetry={() => refetch()} className="mb-6" />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load AI overview"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={MessageSquare}
              label="Chat sessions"
              value={stats?.session_count ?? 0}
            />
            <StatCard
              icon={Lightbulb}
              label="Pending suggestions"
              value={stats?.pending_suggestions ?? 0}
            />
            <StatCard icon={Database} label="Indexed chunks" value={stats?.indexed_chunks ?? 0} />
            <StatCard
              icon={AlertTriangle}
              label="Failed jobs"
              value={stats?.failed_jobs ?? 0}
              highlight={(stats?.failed_jobs ?? 0) > 0}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NavCard
              to="/ai/chat"
              icon={MessageSquare}
              title="Chat"
              description="Ask questions with citation-backed answers when configured."
            />
            <NavCard
              to="/ai/suggestions"
              icon={Lightbulb}
              title="Suggestions"
              description="Review AI and manual suggestions for project entities."
            />
            <NavCard
              to="/ai/jobs"
              icon={Database}
              title="Embedding jobs"
              description="Track document indexing and retry failed jobs."
            />
          </div>
        </>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Sparkles;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-destructive/50" : undefined}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${highlight ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function NavCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <Card className="hover:bg-muted/40 transition-colors">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to={to}>
            Open
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
