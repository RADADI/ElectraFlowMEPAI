/**
 * RFI List Page — Phase 8
 *
 * Fully dynamic: reads from rfi.service.ts which falls back to mock when
 * Supabase is not configured or JWT is not ready.
 *
 * Role gate (checked by RoleGuard in layout):
 *   Admin, PM, Senior EE, EE, QA/QC, Executive (read-only), Client (limited)
 *
 * Features: search, status/priority filter, sort, pagination (10/page),
 * due-date badges, Critical/Cost/Schedule impact badges, create button.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ChevronLeft, ChevronRight, Search, Plus, FileQuestion, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useRFIs } from "@/hooks/api/useRFI";
import { getRFIDueBadge } from "@/types/rfi-view";
import type { RFIView, RFIFilterInput } from "@/types/rfi-view";
import type { RFIStatus } from "@/types/database";
import { RFIFormModal } from "@/components/rfi/RFIFormModal";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/rfi")({
  component: RFIPage,
});

// ─── Status display maps ──────────────────────────────────────────────────────

const STATUS_LABEL: Record<RFIStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  open: "Open",
  under_review: "Under Review",
  answered: "Answered",
  closed: "Closed",
  reopened: "Reopened",
  voided: "Void",
  archived: "Archived",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<RFIStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  open: "bg-yellow-100 text-yellow-700",
  under_review: "bg-purple-100 text-purple-700",
  answered: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  reopened: "bg-orange-100 text-orange-700",
  voided: "bg-red-100 text-red-700",
  archived: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-50 text-red-500",
};

const PRIORITY_CLASS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-800 font-semibold",
};

const PAGE_SIZE = 10;

// ─── Role helpers ─────────────────────────────────────────────────────────────

const norm = (r?: string | null) => (r ?? "").toLowerCase().replace(/ /g, "_");

function canCreate(role?: string | null): boolean {
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RFITableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

// ─── Due badge pill ───────────────────────────────────────────────────────────

function DueBadge({ rfi }: { rfi: RFIView }) {
  const badge = getRFIDueBadge(rfi);
  if (!badge) return null;

  const map: Record<typeof badge, { label: string; cls: string }> = {
    overdue: { label: "Overdue", cls: "bg-red-100 text-red-700" },
    due_soon: { label: "Due Soon", cls: "bg-yellow-100 text-yellow-700" },
    answered_late: { label: "Answered Late", cls: "bg-orange-100 text-orange-700" },
    closed_late: { label: "Closed Late", cls: "bg-orange-100 text-orange-700" },
  };

  const { label, cls } = map[badge];
  return <Badge className={`text-xs ${cls}`}>{label}</Badge>;
}

// ─── Impact badges ────────────────────────────────────────────────────────────

function ImpactBadges({ rfi }: { rfi: RFIView }) {
  return (
    <span className="flex flex-wrap gap-1">
      {rfi.cost_impact && <Badge className="text-xs bg-amber-100 text-amber-700">Cost</Badge>}
      {rfi.schedule_impact && (
        <Badge className="text-xs bg-purple-100 text-purple-700">Schedule</Badge>
      )}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RFIPage() {
  const { role: userRole } = useAuth();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RFIStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const filters: RFIFilterInput = {
    status: statusFilter,
    search: search.trim() || undefined,
  };

  const rfiQuery = useRFIs(filters);

  // Client-side priority filter + sort (service handles status/search)
  const filtered = useMemo(() => {
    const allRFIs = rfiQuery.data?.data ?? [];
    let items = allRFIs;
    if (priorityFilter !== "all") items = items.filter((r) => r.priority === priorityFilter);
    return items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [rfiQuery.data?.data, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }

  function handleStatusChange(v: string) {
    setStatusFilter(v as RFIStatus | "all");
    setPage(1);
  }

  function handlePriorityChange(v: string) {
    setPriorityFilter(v);
    setPage(1);
  }

  const isMock = rfiQuery.data?.isMockData === true;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Requests for Information"
        subtitle="Track and manage RFIs across all projects"
        actions={
          canCreate(userRole) ? (
            <Button onClick={() => setShowCreate(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New RFI
            </Button>
          ) : undefined
        }
      />

      {isMock && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          Demo mode — changes are temporary and disappear after refresh.
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or RFI number..."
                className="pl-9"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="reopened">Reopened</SelectItem>
                <SelectItem value="voided">Void</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={handlePriorityChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {rfiQuery.isLoading ? (
            <div className="p-6">
              <RFITableSkeleton />
            </div>
          ) : rfiQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p>Failed to load RFIs. Please try refreshing the page.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16">
              <EmptyState
                icon={FileQuestion}
                title="No RFIs found"
                description={
                  search || statusFilter !== "all" || priorityFilter !== "all"
                    ? "Try adjusting your filters."
                    : "Create your first RFI to get started."
                }
                action={
                  canCreate(userRole) && !search && statusFilter === "all" ? (
                    <Button size="sm" onClick={() => setShowCreate(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      New RFI
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[100px]">Priority</TableHead>
                    <TableHead className="w-[140px]">Project</TableHead>
                    <TableHead className="w-[110px]">Assigned To</TableHead>
                    <TableHead className="w-[160px]">Badges</TableHead>
                    <TableHead className="w-[100px]">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((rfi) => (
                    <TableRow key={rfi.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link
                          to="/rfi/$id"
                          params={{ id: rfi.id }}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          {rfi.rfi_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/rfi/$id"
                          params={{ id: rfi.id }}
                          className="font-medium hover:underline line-clamp-1"
                        >
                          {rfi.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs ${STATUS_CLASS[rfi.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {STATUS_LABEL[rfi.status] ?? rfi.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-xs capitalize ${PRIORITY_CLASS[rfi.priority] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {rfi.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate">
                        {rfi.project_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rfi.assignee_name ?? (
                          <span className="italic text-slate-400">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <DueBadge rfi={rfi} />
                          <ImpactBadges rfi={rfi} />
                          {rfi.priority === "critical" && (
                            <Badge className="text-xs bg-red-100 text-red-800 font-semibold">
                              Critical
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rfi.required_date ? formatDate(rfi.required_date) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} RFIs
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create modal */}
      <RFIFormModal open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
