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
import { CheckCircle2, Clock, FolderOpen, Info, Pencil } from "lucide-react";
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
};

const SUB_STATUS_LABEL: Record<SubmittalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In Review",
  approved: "Approved",
  approved_as_noted: "Approved as Noted",
  rejected: "Rejected",
  revise_and_resubmit: "Revise & Resubmit",
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
  const { role, isDemo } = useAuth();

  const { data: result, isLoading } = useProject(id);
  const project = result?.data ?? null;
  const projectExists = !isLoading && (result?.data != null || result?.error != null);

  // Sub-resource hooks — only enabled once we know the project exists
  const { data: members = [], isLoading: membersLoading } = useProjectMembers(project ? id : "");
  const { data: milestones = [], isLoading: milestonesLoading } = useProjectMilestones(
    project ? id : "",
  );
  const { data: docs = [], isLoading: docsLoading } = useDocuments(project ? id : undefined);
  const { data: subs = [], isLoading: subsLoading } = useSubmittals(project ? id : undefined);

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

      {/* Demo mode banner */}
      {!IS_SUPABASE_CONFIGURED && isDemo && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <Info className="h-4 w-4 shrink-0" />
          Demo mode — changes are temporary and disappear after refresh.
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Budget
                  </div>
                  <div className="text-xl font-semibold">{formatMoney(project.budget)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Estimated Cost
                  </div>
                  <div className="text-xl font-semibold text-muted-foreground">—</div>
                  <div className="text-xs text-muted-foreground mt-1">Coming in Phase 5</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Actual Cost
                  </div>
                  <div className="text-xl font-semibold text-muted-foreground">—</div>
                  <div className="text-xs text-muted-foreground mt-1">Coming in Phase 5</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit modal */}
      <ProjectFormModal mode="edit" project={project} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
