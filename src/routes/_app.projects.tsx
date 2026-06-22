import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Eye,
  Pencil,
  Archive,
  Search,
  Filter,
  FolderOpen,
  Info,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import {
  ProjectStatusBadge,
  ProjectPriorityBadge,
  ProjectRiskBadge,
} from "@/components/projects/ProjectBadges";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { useProjects, useArchiveProject } from "@/hooks/api/useProjects";
import { useAuth } from "@/contexts/auth-context";
import { IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { formatMoney, formatDate } from "@/lib/format";
import type { ProjectView } from "@/types/project-view";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({ meta: [{ title: "Projects — ElectraFlow AI" }] }),
  component: ProjectsPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;

type SortableCol = keyof Pick<
  ProjectView,
  | "name"
  | "client_name"
  | "pm_name"
  | "status"
  | "priority"
  | "risk_level"
  | "start_date"
  | "end_date"
  | "budget"
  | "progress_percent"
>;

// ─── Sort indicator ───────────────────────────────────────────────────────────

function SortIcon({
  col,
  active,
  dir,
}: {
  col: SortableCol;
  active: SortableCol;
  dir: "asc" | "desc";
}) {
  if (col !== active)
    return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />;
  return dir === "asc" ? (
    <ChevronUp className="ml-1 h-3 w-3 inline" />
  ) : (
    <ChevronDown className="ml-1 h-3 w-3 inline" />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ProjectsPage() {
  const { role, isDemo, isJwtReady } = useAuth();
  const { data: allProjects = [], isLoading, error } = useProjects();
  const archiveMutation = useArchiveProject();

  // ── Filter / sort / paginate state ──
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectView["status"] | "all">("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [sortCol, setSortCol] = useState<SortableCol>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  // ── Modal state ──
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectView | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProjectView | null>(null);

  // ── Role capabilities ──
  const canWrite = role === "Admin" || role === "Project Manager";
  // Demo users see all projects (not role-filtered) regardless of Supabase config
  const showDemoBanner =
    isDemo &&
    (role === "Project Manager" ||
      role === "Senior Electrical Engineer" ||
      role === "Electrical Engineer");

  // ── Derive unique disciplines for filter ──
  const disciplines = useMemo(
    () => Array.from(new Set(allProjects.map((p) => p.discipline).filter(Boolean))).sort(),
    [allProjects],
  );

  // ── Data pipeline: filter → sort → paginate ──
  const processed = useMemo(() => {
    let items = [...allProjects];

    // Search
    if (q.trim()) {
      const ql = q.toLowerCase();
      items = items.filter((p) =>
        [p.name, p.client_name, p.project_number, p.pm_name, p.location]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(ql)),
      );
    }

    // Status filter
    if (statusFilter !== "all") items = items.filter((p) => p.status === statusFilter);

    // Discipline filter
    if (disciplineFilter !== "all") items = items.filter((p) => p.discipline === disciplineFilter);

    // Sort
    items.sort((a, b) => {
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [allProjects, q, statusFilter, disciplineFilter, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / ITEMS_PER_PAGE));
  const pageItems = processed.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const handleSort = (col: SortableCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(0);
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    const result = await archiveMutation.mutateAsync(archiveTarget.id);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success(
        result.isMockData
          ? `"${archiveTarget.name}" archived (demo — disappears after refresh)`
          : `"${archiveTarget.name}" archived successfully.`,
      );
    }
    setArchiveTarget(null);
  };

  const clearFilters = () => {
    setQ("");
    setStatusFilter("all");
    setDisciplineFilter("all");
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={
          isLoading
            ? "Loading…"
            : `${processed.length} of ${allProjects.length} project${allProjects.length !== 1 ? "s" : ""}`
        }
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          ) : undefined
        }
      />

      {/* Data-source banner: shows context-appropriate message */}
      {(!IS_SUPABASE_CONFIGURED || !isJwtReady) && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <Info className="h-4 w-4 shrink-0" />
          {IS_SUPABASE_CONFIGURED && !isJwtReady
            ? "Supabase is configured, but authenticated database access is not connected yet. Using mock data."
            : "Demo mode — changes are temporary and disappear after refresh."}
        </div>
      )}

      {/* Demo users see all projects regardless of role */}
      {showDemoBanner && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-info/30 bg-info/10 px-4 py-2.5 text-sm text-info">
          <Info className="h-4 w-4 shrink-0" />
          Demo mode — showing all projects. Real account access is filtered by your assignments.
        </div>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, client, number, PM…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              className="pl-9"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as typeof statusFilter);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="active">On Track</SelectItem>
              <SelectItem value="on_hold">Delayed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {disciplines.length > 0 && (
            <Select
              value={disciplineFilter}
              onValueChange={(v) => {
                setDisciplineFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Discipline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All disciplines</SelectItem>
                {disciplines.map((d) => (
                  <SelectItem key={d!} value={d!}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(q || statusFilter !== "all" || disciplineFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={11} rows={5} />
          ) : error ? (
            <EmptyState
              title="Failed to load projects"
              description={(error as Error)?.message ?? "An unexpected error occurred."}
              action={
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              }
            />
          ) : processed.length === 0 && allProjects.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={
                role === "Project Manager"
                  ? "No projects assigned to you yet"
                  : role === "Senior Electrical Engineer" || role === "Electrical Engineer"
                    ? "You are not assigned to any projects"
                    : "No projects yet"
              }
              description={
                role === "Senior Electrical Engineer" || role === "Electrical Engineer"
                  ? "Contact your Project Manager to get assigned."
                  : canWrite
                    ? "Create your first project to get started."
                    : "Projects will appear here once they are created."
              }
              action={
                canWrite ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                ) : undefined
              }
            />
          ) : processed.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="No projects match your search"
              description="Try changing the search term or clearing the filters."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-3 whitespace-nowrap font-medium">#</TableHead>
                      {(
                        [
                          ["name", "Project"],
                          ["client_name", "Client"],
                          ["pm_name", "PM"],
                          ["status", "Status"],
                          ["priority", "Priority"],
                          ["risk_level", "Risk"],
                          ["start_date", "Start"],
                          ["end_date", "Due"],
                          ["progress_percent", "Progress"],
                          ["budget", "Budget"],
                        ] as [SortableCol, string][]
                      ).map(([col, label]) => (
                        <TableHead
                          key={col}
                          className="px-3 whitespace-nowrap font-medium cursor-pointer select-none"
                          onClick={() => handleSort(col)}
                        >
                          {label}
                          <SortIcon col={col} active={sortCol} dir={sortDir} />
                        </TableHead>
                      ))}
                      <TableHead className="px-3 font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="px-3 font-mono text-xs whitespace-nowrap">
                          {p.project_number}
                        </TableCell>
                        <TableCell className="px-3 font-medium max-w-48 truncate" title={p.name}>
                          {p.name}
                        </TableCell>
                        <TableCell className="px-3 max-w-36 truncate">
                          {p.client_name ?? "—"}
                        </TableCell>
                        <TableCell className="px-3 max-w-36 truncate">{p.pm_name ?? "—"}</TableCell>
                        <TableCell className="px-3">
                          <ProjectStatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="px-3">
                          <ProjectPriorityBadge priority={p.priority} />
                        </TableCell>
                        <TableCell className="px-3">
                          <ProjectRiskBadge risk={p.risk_level} />
                        </TableCell>
                        <TableCell className="px-3 whitespace-nowrap text-sm">
                          {formatDate(p.start_date)}
                        </TableCell>
                        <TableCell className="px-3 whitespace-nowrap text-sm">
                          {formatDate(p.end_date)}
                        </TableCell>
                        <TableCell className="px-3 w-32">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${p.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">{p.progress_percent}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 whitespace-nowrap text-sm">
                          {formatMoney(p.budget)}
                        </TableCell>
                        <TableCell className="px-3">
                          <div className="flex items-center gap-1">
                            <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                              <Link to="/projects/$id" params={{ id: p.id }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            {canWrite && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => setEditProject(p)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 hover:text-destructive"
                                  onClick={() => setArchiveTarget(p)}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-t">
                <div>
                  Showing {page * ITEMS_PER_PAGE + 1}–
                  {Math.min((page + 1) * ITEMS_PER_PAGE, processed.length)} of {processed.length}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="px-2">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Project modal */}
      <ProjectFormModal mode="create" open={createOpen} onOpenChange={setCreateOpen} />

      {/* Edit Project modal */}
      <ProjectFormModal
        mode="edit"
        project={editProject ?? undefined}
        open={!!editProject}
        onOpenChange={(o) => !o && setEditProject(null)}
      />

      {/* Archive confirm dialog */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{archiveTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This project will be hidden from the list. The data is preserved and can be restored
              from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
