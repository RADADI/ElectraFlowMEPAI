import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context";
import {
  useTimesheet,
  useTimesheetEntries,
  useSubmitTimesheet,
  useApproveTimesheet,
  useRejectTimesheet,
  useUnlockTimesheet,
  useArchiveTimesheet,
  useAddTimesheetEntry,
  useUpdateTimesheetEntry,
  useDeleteTimesheetEntry,
} from "@/hooks/api/useTimesheets";
import { WeeklyTimesheetGrid } from "@/components/timesheets/WeeklyTimesheetGrid";
import { getWeekDays, toISODate } from "@/types/timesheet-view";
import type { TimesheetWorkType } from "@/types/timesheet-view";
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  Unlock,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Archive,
  Send,
} from "lucide-react";

export const Route = createFileRoute("/_app/timesheets/$id")({
  head: () => ({ meta: [{ title: "Timesheet Detail — ElectraFlow AI" }] }),
  component: TimesheetDetailPage,
});

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-100 text-green-700">Approved</Badge>;
    case "submitted":
      return <Badge className="bg-blue-100 text-blue-700">Submitted</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "archived":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}

function TimesheetDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();

  const normRole = (role ?? "").toLowerCase().replace(/ /g, "_");
  const isAdmin = normRole === "admin";
  const isHR = normRole === "hr";
  const isPM = normRole === "project_manager";
  const canApprove = isAdmin || isHR || isPM;
  const canUnlock = isAdmin || isHR;
  const canArchive = isAdmin || isHR;

  // Data
  const tsQuery = useTimesheet(id);
  const entriesQuery = useTimesheetEntries(id);
  const ts = tsQuery.data?.data ?? null;
  const entries = entriesQuery.data ?? [];

  // Mutations
  const submitMut = useSubmitTimesheet(id);
  const approveMut = useApproveTimesheet(id);
  const rejectMut = useRejectTimesheet(id);
  const unlockMut = useUnlockTimesheet(id);
  const archiveMut = useArchiveTimesheet(id);
  const addEntryMut = useAddTimesheetEntry(id);
  const updateEntryMut = useUpdateTimesheetEntry(id);
  const deleteEntryMut = useDeleteTimesheetEntry(id);

  const anyBusy =
    submitMut.isPending ||
    approveMut.isPending ||
    rejectMut.isPending ||
    unlockMut.isPending ||
    archiveMut.isPending ||
    addEntryMut.isPending ||
    updateEntryMut.isPending ||
    deleteEntryMut.isPending;

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Unlock dialog state
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Action error
  const [actionError, setActionError] = useState<string | null>(null);

  if (tsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (tsQuery.isError || !ts) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">
          {tsQuery.isError ? "Failed to load timesheet." : "Timesheet not found."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => tsQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/timesheets" })}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  const isEditable = ["draft", "rejected"].includes(ts.status) && !anyBusy;

  const weekDays = getWeekDays(ts.week_start_date);

  async function handleSubmit() {
    setActionError(null);
    const result = await submitMut.mutateAsync();
    if (result.error) setActionError(result.error.message ?? "Submit failed.");
  }

  async function handleApprove() {
    setActionError(null);
    const result = await approveMut.mutateAsync({ revision_number: ts!.revision_number });
    if (result.error) setActionError(result.error.message ?? "Approve failed.");
  }

  async function handleReject() {
    setRejectError(null);
    if (!rejectReason.trim()) {
      setRejectError("A rejection reason is required.");
      return;
    }
    const result = await rejectMut.mutateAsync({
      rejection_reason: rejectReason,
      revision_number: ts!.revision_number,
    });
    if (result.error) {
      setRejectError(result.error.message ?? "Reject failed.");
      return;
    }
    setRejectOpen(false);
    setRejectReason("");
  }

  async function handleUnlock() {
    setUnlockError(null);
    if (!unlockReason.trim()) {
      setUnlockError("An unlock reason is required.");
      return;
    }
    const result = await unlockMut.mutateAsync({
      unlock_reason: unlockReason,
      revision_number: ts!.revision_number,
    });
    if (result.error) {
      setUnlockError(result.error.message ?? "Unlock failed.");
      return;
    }
    setUnlockOpen(false);
    setUnlockReason("");
  }

  async function handleArchive() {
    const result = await archiveMut.mutateAsync();
    if (result.error) {
      setActionError(result.error.message ?? "Archive failed.");
      return;
    }
    navigate({ to: "/timesheets" });
  }

  async function handleAddEntry(data: {
    project_id: string;
    entry_date: string;
    hours: number;
    work_type: TimesheetWorkType;
    description?: string;
    billable: boolean;
  }) {
    setActionError(null);
    const result = await addEntryMut.mutateAsync(data);
    if (result.error) setActionError(result.error.message ?? "Failed to add entry.");
  }

  async function handleUpdateEntry(
    entryId: string,
    patch: {
      hours?: number;
      description?: string;
      work_type?: TimesheetWorkType;
      billable?: boolean;
    },
  ) {
    setActionError(null);
    const result = await updateEntryMut.mutateAsync({ id: entryId, input: patch });
    if (result.error) setActionError(result.error.message ?? "Failed to update entry.");
  }

  async function handleDeleteEntry(entryId: string) {
    setActionError(null);
    const result = await deleteEntryMut.mutateAsync(entryId);
    if (result.error) setActionError(result.error.message ?? "Failed to delete entry.");
  }

  const weekLabel = `${new Date(ts.week_start_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(ts.week_end_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/timesheets">
            <ChevronLeft className="h-4 w-4" />
            Timesheets
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Timesheet — ${weekLabel}`}
        subtitle={ts.employee_name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(ts.status)}
            {ts.overtime_hours > 0 && (
              <Badge className="bg-orange-100 text-orange-700">
                +{ts.overtime_hours}h Overtime
              </Badge>
            )}

            {/* Submit (employee, draft/rejected) */}
            {isEditable && (
              <Button size="sm" onClick={handleSubmit} disabled={anyBusy}>
                {submitMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                <Send className="mr-1.5 h-4 w-4" />
                Submit
              </Button>
            )}

            {/* Approve (PM/HR/Admin, submitted) */}
            {canApprove && ts.status === "submitted" && (
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleApprove}
                disabled={anyBusy}
              >
                {approveMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                <CheckCircle className="mr-1.5 h-4 w-4" />
                Approve
              </Button>
            )}

            {/* Reject (PM/HR/Admin, submitted) */}
            {canApprove && ts.status === "submitted" && (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setRejectOpen(true)}
                disabled={anyBusy}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Reject
              </Button>
            )}

            {/* Unlock (Admin/HR only, approved) */}
            {canUnlock && ts.status === "approved" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUnlockOpen(true)}
                disabled={anyBusy}
              >
                <Unlock className="mr-1.5 h-4 w-4" />
                Unlock
              </Button>
            )}

            {/* Archive (Admin/HR) */}
            {canArchive && !["archived"].includes(ts.status) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={handleArchive}
                disabled={anyBusy}
              >
                <Archive className="mr-1.5 h-4 w-4" />
                Archive
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Revision & audit trail */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Revision</p>
          <p className="font-medium">#{ts.revision_number}</p>
        </div>
        {ts.submitted_at && (
          <div>
            <p className="text-xs text-muted-foreground">Submitted</p>
            <p className="font-medium">{new Date(ts.submitted_at).toLocaleDateString()}</p>
          </div>
        )}
        {ts.approved_at && (
          <div>
            <p className="text-xs text-muted-foreground">Approved by</p>
            <p className="font-medium">
              {ts.approved_by_name ?? "—"}
              {ts.approved_at && (
                <span className="text-muted-foreground text-xs block">
                  {new Date(ts.approved_at).toLocaleDateString()}
                </span>
              )}
            </p>
          </div>
        )}
        {ts.rejected_at && (
          <div>
            <p className="text-xs text-muted-foreground">Rejected by</p>
            <p className="font-medium text-destructive">{ts.rejected_by_name ?? "—"}</p>
          </div>
        )}
      </div>

      {ts.rejection_reason && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <XCircle className="h-4 w-4 text-destructive" />
          <AlertDescription>
            <strong>Rejected:</strong> {ts.rejection_reason}
          </AlertDescription>
        </Alert>
      )}

      {ts.unlock_reason && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <Unlock className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700">
            <strong>Unlocked:</strong> {ts.unlock_reason}
          </AlertDescription>
        </Alert>
      )}

      {/* Weekly grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly Time Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entriesQuery.isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <WeeklyTimesheetGrid
              timesheet={ts}
              entries={entries}
              weekDays={weekDays}
              editable={isEditable}
              isBusy={anyBusy}
              onAddEntry={handleAddEntry}
              onUpdateEntry={handleUpdateEntry}
              onDeleteEntry={handleDeleteEntry}
            />
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
            <DialogDescription>
              Provide a clear reason so the employee knows what to fix before resubmitting.
            </DialogDescription>
          </DialogHeader>
          {rejectError && (
            <Alert variant="destructive">
              <AlertDescription>{rejectError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ts-reject-reason">Reason *</Label>
            <Textarea
              id="ts-reject-reason"
              rows={3}
              placeholder="e.g. Missing project allocation on Friday…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={rejectMut.isPending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejectMut.isPending}>
              {rejectMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock dialog */}
      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Unlock Timesheet</DialogTitle>
            <DialogDescription>
              Unlocking allows the employee to edit and resubmit. An audit reason is required.
            </DialogDescription>
          </DialogHeader>
          {unlockError && (
            <Alert variant="destructive">
              <AlertDescription>{unlockError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ts-unlock-reason">Unlock Reason *</Label>
            <Textarea
              id="ts-unlock-reason"
              rows={2}
              placeholder="e.g. Project code was entered incorrectly…"
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlockOpen(false)}
              disabled={unlockMut.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleUnlock} disabled={unlockMut.isPending}>
              {unlockMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Unlock Timesheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
