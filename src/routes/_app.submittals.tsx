/**
 * Submittals List Page — Phase 7
 *
 * Dynamic data from useSubmittals() with search, status filter, discipline
 * filter, client-side pagination, and due-date badges.
 * Role-gated Create button and Link to detail page.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { SubmittalFormModal } from "@/components/submittals/SubmittalFormModal";
import { useSubmittals, useCreateSubmittal } from "@/hooks/api/useSubmittals";
import { useAuth } from "@/contexts/auth-context";
import { IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getDueBadge } from "@/types/submittal-view";
import type { SubmittalStatus } from "@/types/database";
import { DISCIPLINES } from "@/lib/dummy-data";
import {
  Plus,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/submittals")({
  head: () => ({ meta: [{ title: "Submittals — ElectraFlow AI" }] }),
  component: SubmittalsPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<SubmittalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In Review",
  approved: "Approved",
  approved_as_noted: "Approved as Noted",
  revise_and_resubmit: "Revise & Resubmit",
  rejected: "Rejected",
  archived: "Archived",
};

const STATUS_CLASS: Record<SubmittalStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-info/15 text-info border-info/30",
  under_review: "bg-info/15 text-info border-info/30",
  approved: "bg-success/15 text-success border-success/30",
  approved_as_noted: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  revise_and_resubmit: "bg-warning/15 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground border-border",
};

function canCreate(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase().replace(/ /g, "_");
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

// ─── Due badge component ──────────────────────────────────────────────────────

function DueBadgeChip({ type }: { type: ReturnType<typeof getDueBadge> }) {
  if (!type) return null;
  if (type === "overdue")
    return (
      <Badge
        variant="outline"
        className="ml-1 bg-destructive/15 text-destructive border-destructive/30 text-[10px] px-1.5 py-0"
      >
        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Overdue
      </Badge>
    );
  if (type === "due_soon")
    return (
      <Badge
        variant="outline"
        className="ml-1 bg-warning/15 text-warning border-warning/30 text-[10px] px-1.5 py-0"
      >
        <Clock className="h-2.5 w-2.5 mr-0.5" /> Due Soon
      </Badge>
    );
  if (type === "approved_late")
    return (
      <Badge
        variant="outline"
        className="ml-1 bg-orange-500/15 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0"
      >
        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Approved Late
      </Badge>
    );
  return null;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

function SubmittalsPage() {
  const { role } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SubmittalStatus | "all">("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useSubmittals({
    status: statusFilter,
    discipline: disciplineFilter === "all" ? undefined : disciplineFilter,
    includeArchived: showArchived,
  });

  const createMutation = useCreateSubmittal();

  const isMockMode = result?.isMockData ?? !IS_SUPABASE_CONFIGURED;

  // Client-side search + pagination
  const allItems = result?.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.submittal_number.toLowerCase().includes(q) ||
        s.spec_section?.toLowerCase().includes(q) ||
        s.project_name?.toLowerCase().includes(q),
    );
  }, [allItems, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }
  function handleStatusChange(v: string) {
    setStatusFilter(v as SubmittalStatus | "all");
    setPage(1);
  }
  function handleDisciplineChange(v: string) {
    setDisciplineFilter(v);
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageHeader
          title="Submittals"
          subtitle="Track submittal packages, reviews, and approvals."
        />
        {canCreate(role) && (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" /> Create Submittal
          </Button>
        )}
      </div>

      {/* Demo banner */}
      {isMockMode && (
        <Alert className="border-warning/40 bg-warning/10 text-warning text-sm">
          <AlertDescription>
            Demo mode — data is simulated. Configure Supabase to use the real database.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by number, title, or project…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as SubmittalStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={disciplineFilter} onValueChange={handleDisciplineChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All disciplines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Disciplines</SelectItem>
            {DISCIPLINES.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          className="whitespace-nowrap self-stretch sm:self-auto"
          onClick={() => {
            setShowArchived((p) => !p);
            setPage(1);
          }}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </Button>
      </div>

      {/* Table / states */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center space-y-3">
          <p className="text-destructive font-medium">Failed to load submittals</p>
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ?? "Unknown error"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            search || statusFilter !== "all"
              ? "No submittals match your filters"
              : "No submittals yet"
          }
          description={
            canCreate(role)
              ? "Create the first submittal to get started."
              : "No submittals have been created for this organisation yet."
          }
          action={
            canCreate(role) ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Submittal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="px-4 py-3 font-semibold">Number</TableHead>
                  <TableHead className="px-3 py-3 font-semibold">Title</TableHead>
                  <TableHead className="px-3 py-3 font-semibold hidden md:table-cell">
                    Project
                  </TableHead>
                  <TableHead className="px-3 py-3 font-semibold">Status</TableHead>
                  <TableHead className="px-3 py-3 font-semibold hidden sm:table-cell">
                    Rev
                  </TableHead>
                  <TableHead className="px-3 py-3 font-semibold hidden lg:table-cell">
                    Due Date
                  </TableHead>
                  <TableHead className="px-3 py-3 font-semibold hidden xl:table-cell">
                    Submitted By
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((s) => {
                  const badge = getDueBadge(s);
                  return (
                    <TableRow key={s.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="px-4 py-3">
                        <Link
                          to="/submittals/$id"
                          params={{ id: s.id }}
                          className="font-mono text-sm font-medium text-primary hover:underline"
                        >
                          {s.submittal_number}
                        </Link>
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <Link
                          to="/submittals/$id"
                          params={{ id: s.id }}
                          className="hover:underline text-sm font-medium line-clamp-1"
                        >
                          {s.title}
                        </Link>
                        {s.spec_section && (
                          <p className="text-xs text-muted-foreground mt-0.5">{s.spec_section}</p>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 hidden md:table-cell text-sm text-muted-foreground line-clamp-1">
                        {s.project_name ?? "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <Badge variant="outline" className={`text-xs ${STATUS_CLASS[s.status]}`}>
                          {STATUS_LABELS[s.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-3 hidden sm:table-cell text-sm text-center">
                        v{s.revision_number}
                      </TableCell>
                      <TableCell className="px-3 py-3 hidden lg:table-cell text-sm">
                        {s.review_due_date ? (
                          <span className="inline-flex items-center gap-1">
                            {formatDate(s.review_due_date)}
                            <DueBadgeChip type={badge} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 hidden xl:table-cell text-sm text-muted-foreground">
                        {s.submitter_name ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 py-1 border rounded text-sm">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={safePage === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      <SubmittalFormModal
        open={createOpen}
        onClose={(success) => {
          setCreateOpen(false);
          if (success) toast.success("Submittal created successfully.");
        }}
        isMockMode={isMockMode}
        onCreate={async (input) => {
          const result = await createMutation.mutateAsync(input);
          return { error: result.error };
        }}
      />
    </div>
  );
}
