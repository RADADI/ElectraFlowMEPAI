/**
 * Project Detail Page — Phase 4
 *
 * Fetches data from React Query hooks (service layer → Supabase or mock overlay).
 * Never reads from dummy-data directly.
 *
 * Tab scope (Phase 4): Overview · Team · Schedule · Documents · Submittals · Financials
 * Deferred to later phases: Tasks · Feedback · AI
 */

import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  Info,
  Pencil,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Receipt,
  Banknote,
} from "lucide-react";
import { useProjectBudget, useExpenses, useInvoices } from "@/hooks/api/useFinancials";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import {
  ProjectStatusBadge,
  ProjectPriorityBadge,
  ProjectRiskBadge,
} from "@/components/projects/ProjectBadges";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { useProject, useProjectMembers, useProjectMilestones } from "@/hooks/api/useProjects";
import { useDocuments } from "@/hooks/api/useDocuments";
import { useSubmittals } from "@/hooks/api/useSubmittals";
import { useAuth } from "@/contexts/auth-context";
import { IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { formatMoney, formatDate } from "@/lib/format";
import type { DocumentStatus, SubmittalStatus } from "@/types/database";

export const Route = createFileRoute("/_app/projects/$id")({
  head: () => ({ meta: [{ title: "Project Details — ElectraFlow AI" }] }),
  component: ProjectDetailPage,
});

// ─── Inline style helpers for document/submittal/member status badges ─────────

const DOC_STATUS_CLASS: Record<DocumentStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  under_review: "bg-info/15 text-info border-info/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  superseded: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted text-muted-foreground border-border",
};

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
  archived: "Archived",
};

const SUB_STATUS_CLASS: Record<SubmittalStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-info/15 text-info border-info/30",
  under_review: "bg-info/15 text-info border-info/30",
  approved: "bg-success/15 text-success border-success/30",
  approved_as_noted: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  revise_and_resubmit: "bg-warning/15 text-warning border-warning/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const SUB_STATUS_LABEL: Record<SubmittalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In Review",
  approved: "Approved",
  approved_as_noted: "Approved as Noted",
  rejected: "Rejected",
  revise_and_resubmit: "Revise & Resubmit",
  archived: "Archived",
};

const MEMBER_STATUS_CLASS: Record<string, string> = {
  Healthy: "bg-info/15 text-info border-info/30",
  Available: "bg-success/15 text-success border-success/30",
  Overallocated: "bg-destructive/15 text-destructive border-destructive/30",
};

// ─── Field label/value pair ───────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

// ─── Detail skeleton ──────────────────────────────────────────────────────────

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2 mb-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[120, 80, 100, 110, 110, 100].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-md" style={{ width: w }} />
        ))}
      </div>
      {/* Content */}
      <Card>
        <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Not found state ──────────────────────────────────────────────────────────

function ProjectNotFound({ id }: { id: string }) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="Project not found"
      description={`No project with ID "${id}" exists or you don't have access to it.`}
      action={
        <Button asChild variant="outline">
          <Link to="/projects">Back to Projects</Link>
        </Button>
      }
      className="min-h-96"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function ProjectDetailPage() {
  const { id } = useParams({ from: "/_app/projects/$id" });
  const { role, isDemo, isJwtReady } = useAuth();

  const { data: result, isLoading } = useProject(id);
  const project = result?.data ?? null;
  const projectExists = !isLoading && (result?.data != null || result?.error != null);

  // Sub-resource hooks — only enabled once we know the project exists
  const { data: members = [], isLoading: membersLoading } = useProjectMembers(project ? id : "");
  const { data: milestones = [], isLoading: milestonesLoading } = useProjectMilestones(
    project ? id : "",
  );
  const { data: docs = [], isLoading: docsLoading } = useDocuments(
    project ? { projectId: id } : {},
  );
  const { data: subsResult, isLoading: subsLoading } = useSubmittals(
    project ? { projectId: id } : undefined,
  );
  const subs = subsResult?.data ?? [];

  const [editOpen, setEditOpen] = useState(false);

  // ── Role capabilities ──
  const canEdit = role === "Admin" || role === "Project Manager";
  const canSeeFinancials = role === "Admin" || role === "Project Manager" || role === "Executive";

  // Loading state
  if (isLoading) return <ProjectDetailSkeleton />;

  // Not found — never fall back to another project
  if (!project) {
    // Check if there's an explicit error about not found vs a generic error
    const errMsg = result?.error?.message ?? "";
    if (result?.error || errMsg) return <ProjectNotFound id={id} />;
    return <ProjectNotFound id={id} />;
  }

  const nextMilestone = milestones.find((m) => !m.is_done);

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={[project.client_name, project.location].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.project_number }]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectStatusBadge status={project.status} />
            <ProjectPriorityBadge priority={project.priority} />
            <ProjectRiskBadge risk={project.risk_level} />
            {canEdit && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        }
      />

      {/* Data-source banner */}
      {(!IS_SUPABASE_CONFIGURED || !isJwtReady) && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <Info className="h-4 w-4 shrink-0" />
          {IS_SUPABASE_CONFIGURED && !isJwtReady
            ? "Supabase is configured, but authenticated database access is not connected yet. Using mock data."
            : "Demo mode — changes are temporary and disappear after refresh."}
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto">
          {[
            { value: "overview", label: "Overview" },
            { value: "team", label: "Team" },
            { value: "schedule", label: "Schedule" },
            { value: "documents", label: "Documents" },
            { value: "submittals", label: "Submittals" },
            ...(canSeeFinancials ? [{ value: "financials", label: "Financials" }] : []),
          ].map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              <Field label="Project Name" value={project.name} />
              <Field
                label="Project Number"
                value={<span className="font-mono">{project.project_number}</span>}
              />
              <Field label="Location" value={project.location} />
              <Field label="Client" value={project.client_name} />
              <Field label="Project Manager" value={project.pm_name} />
              <Field label="Start Date" value={formatDate(project.start_date)} />
              <Field label="End Date" value={formatDate(project.end_date)} />
              <Field label="Budget" value={formatMoney(project.budget)} />
              <Field label="Status" value={<ProjectStatusBadge status={project.status} />} />
              <Field
                label="Priority"
                value={<ProjectPriorityBadge priority={project.priority} />}
              />
              <Field label="Risk Level" value={<ProjectRiskBadge risk={project.risk_level} />} />
              <Field label="Discipline" value={project.discipline} />
              <Field label="Progress" value={`${project.progress_percent}%`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overall Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={project.progress_percent} className="h-2" />
              <div className="text-xs text-muted-foreground mt-2">
                {project.progress_percent}% complete
                {nextMilestone && ` · Next milestone: ${nextMilestone.name}`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Team ──────────────────────────────────────────────────────────── */}
        <TabsContent value="team">
          <Card>
            <CardContent className="p-0">
              {membersLoading ? (
                <TableSkeleton cols={4} rows={4} />
              ) : members.length === 0 ? (
                <EmptyState
                  title="No team members found"
                  description="Engineers assigned to this project will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {["Name", "Role", "Utilization", "Status"].map((h) => (
                        <TableHead key={h} className="px-3 font-medium">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="px-3 font-medium">{m.name}</TableCell>
                        <TableCell className="px-3">{m.role}</TableCell>
                        <TableCell className="px-3 w-48">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${m.utilization_percent}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">{m.utilization_percent}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3">
                          <Badge
                            variant="outline"
                            className={
                              MEMBER_STATUS_CLASS[m.status] ??
                              "bg-muted text-muted-foreground border-border"
                            }
                          >
                            {m.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Schedule ──────────────────────────────────────────────────────── */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Milestone Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {milestonesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : milestones.length === 0 ? (
                <EmptyState
                  title="No milestones defined"
                  description="Milestones for this project will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {milestones.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      {m.is_done ? (
                        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{m.name}</div>
                        {m.due_date && (
                          <div className="text-xs text-muted-foreground">
                            Due: {formatDate(m.due_date)}
                          </div>
                        )}
                      </div>
                      {m.is_done && (
                        <Badge
                          variant="outline"
                          className="bg-success/15 text-success border-success/30"
                        >
                          Done
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Documents ─────────────────────────────────────────────────────── */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="p-0">
              {docsLoading ? (
                <TableSkeleton cols={5} rows={5} />
              ) : docs.length === 0 ? (
                <EmptyState
                  title="No documents"
                  description="Documents linked to this project will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {["File", "Discipline", "Version", "Uploaded By", "Status"].map((h) => (
                        <TableHead key={h} className="px-3 font-medium">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.slice(0, 10).map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="px-3 font-medium max-w-48 truncate" title={d.title}>
                          {d.title}
                        </TableCell>
                        <TableCell className="px-3">{d.discipline ?? "—"}</TableCell>
                        <TableCell className="px-3 font-mono text-xs">{d.revision}</TableCell>
                        <TableCell className="px-3">{d.created_by ?? "—"}</TableCell>
                        <TableCell className="px-3">
                          <Badge variant="outline" className={DOC_STATUS_CLASS[d.status]}>
                            {DOC_STATUS_LABEL[d.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Submittals ────────────────────────────────────────────────────── */}
        <TabsContent value="submittals">
          <Card>
            <CardContent className="p-0">
              {subsLoading ? (
                <TableSkeleton cols={5} rows={5} />
              ) : subs.length === 0 ? (
                <EmptyState
                  title="No submittals"
                  description="Submittals for this project will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {["Section", "Number", "Title", "Status", "Submitted By"].map((h) => (
                        <TableHead key={h} className="px-3 font-medium">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.slice(0, 10).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="px-3 font-mono text-xs">
                          {s.spec_section ?? "—"}
                        </TableCell>
                        <TableCell className="px-3 font-mono text-xs">
                          {s.submittal_number}
                        </TableCell>
                        <TableCell className="px-3 max-w-40 truncate" title={s.title}>
                          {s.title}
                        </TableCell>
                        <TableCell className="px-3">
                          <Badge variant="outline" className={SUB_STATUS_CLASS[s.status]}>
                            {SUB_STATUS_LABEL[s.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3">{s.submitted_by ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Financials ────────────────────────────────────────────────────── */}
        {canSeeFinancials && (
          <TabsContent value="financials">
            <ProjectFinancialsTab projectId={project.id} projectBudget={project.budget} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit modal */}
      <ProjectFormModal mode="edit" project={project} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

// ─── Project Financials Tab ───────────────────────────────────────────────────

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

const EXP_STATUS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

const INV_STATUS: Record<string, string> = {
  draft: "bg-slate-50 text-slate-700",
  sent: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
  overdue: "bg-red-50 text-red-700",
  voided: "bg-gray-100 text-gray-500",
};

function ProjectFinancialsTab({
  projectId,
  projectBudget,
}: {
  projectId: string;
  projectBudget: number | null;
}) {
  const budgetQ = useProjectBudget(projectId);
  const expensesQ = useExpenses({ projectId });
  const invoicesQ = useInvoices({ projectId });

  const budget = budgetQ.data;
  const expenses = (expensesQ.data ?? []).slice(0, 5);
  const invoices = (invoicesQ.data ?? []).slice(0, 5);

  const revisedBudget = budget?.revised_budget ?? projectBudget ?? 0;
  const totalActual = budget?.total_actual ?? 0;
  const variance = budget ? budget.variance : revisedBudget - totalActual;
  const pctUsed = revisedBudget > 0 ? (totalActual / revisedBudget) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Budget summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Revised Budget
            </p>
            {budgetQ.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <p className="text-xl font-semibold">{fmtMoney(revisedBudget)}</p>
            )}
            {budget?.approved_changes !== undefined && budget.approved_changes !== 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Base {fmtMoney(budget.total_budget)} +{" "}
                <span className={budget.approved_changes >= 0 ? "text-green-600" : "text-red-600"}>
                  COs {fmtMoney(budget.approved_changes)}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Actual Cost
            </p>
            {budgetQ.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <p className="text-xl font-semibold">{fmtMoney(totalActual)}</p>
            )}
            {revisedBudget > 0 && (
              <Progress value={Math.min(pctUsed, 100)} className="h-1 mt-1.5" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Variance</p>
            {budgetQ.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="flex items-center gap-1">
                {variance >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <p
                  className={`text-xl font-semibold ${variance >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {fmtMoney(Math.abs(variance))}
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {variance >= 0 ? "Under budget" : "Over budget"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Outstanding AR
            </p>
            {invoicesQ.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <p
                className={`text-xl font-semibold ${budget && budget.outstanding > 0 ? "text-amber-600" : ""}`}
              >
                {fmtMoney(budget?.outstanding ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Labor cost note */}
      {budget && budget.labor_cost > 0 && (
        <p className="text-xs text-muted-foreground">
          Labor cost from approved timesheets: {fmtMoney(budget.labor_cost)} · Approved expenses:{" "}
          {fmtMoney(budget.actual_expenses)}
        </p>
      )}

      {/* Recent expenses */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent Expenses</CardTitle>
            <Link
              to="/financials"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              All financials <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {expensesQ.isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Receipt className="h-8 w-8 opacity-30" />
              No expenses recorded.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {["Date", "Category", "Description", "Amount", "Status"].map((h) => (
                    <TableHead key={h} className="px-3 text-xs font-medium">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell className="px-3 text-xs whitespace-nowrap">
                      {exp.expense_date}
                    </TableCell>
                    <TableCell className="px-3">
                      <Badge variant="outline" className="text-xs capitalize">
                        {exp.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 text-xs max-w-[180px] truncate">
                      {exp.description}
                    </TableCell>
                    <TableCell className="px-3 text-xs font-medium">
                      {fmtMoney(exp.amount)}
                    </TableCell>
                    <TableCell className="px-3">
                      <Badge
                        variant="outline"
                        className={`${EXP_STATUS[exp.status]} text-xs capitalize`}
                      >
                        {exp.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent invoices */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Invoices</CardTitle>
            <Link
              to="/financials"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              All invoices <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {invoicesQ.isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Banknote className="h-8 w-8 opacity-30" />
              No invoices yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {["Invoice #", "Title", "Total", "Paid", "Status"].map((h) => (
                    <TableHead key={h} className="px-3 text-xs font-medium">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="px-3 text-xs font-mono">{inv.invoice_number}</TableCell>
                    <TableCell className="px-3 text-xs max-w-[180px] truncate">
                      {inv.title}
                    </TableCell>
                    <TableCell className="px-3 text-xs font-medium">
                      {fmtMoney(inv.total_amount)}
                    </TableCell>
                    <TableCell className="px-3 text-xs text-green-600">
                      {inv.paid_amount > 0 ? fmtMoney(inv.paid_amount) : "—"}
                    </TableCell>
                    <TableCell className="px-3">
                      <Badge
                        variant="outline"
                        className={`${inv.is_overdue ? INV_STATUS.overdue : INV_STATUS[inv.status]} text-xs capitalize`}
                      >
                        {inv.is_overdue ? "overdue" : inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
