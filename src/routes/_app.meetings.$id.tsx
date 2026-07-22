/**
 * Meeting Detail — Phase 15A
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { EmptyState } from "@/components/shared/EmptyState";
import { MeetingFormModal } from "@/components/meetings/MeetingFormModal";
import { AttendeeList } from "@/components/meetings/AttendeeList";
import { ActionItemList } from "@/components/meetings/ActionItemList";
import { MeetingTimeline } from "@/components/meetings/MeetingTimeline";
import {
  useMeeting,
  useMeetingAttendees,
  useMeetingActions,
  useMeetingTimeline,
  useUpdateMeeting,
  useCompleteMeeting,
  useCancelMeeting,
  useArchiveMeeting,
} from "@/hooks/api/useMeetings";
import { MEETING_STATUS_LABEL, MEETING_STATUS_CLASS } from "@/types/meeting-view";
import type { MeetingUpdateInput, MeetingActionView } from "@/types/meeting-view";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/contexts/auth-context";
import { getCurrentUserId } from "@/lib/auth-bridge";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Archive,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/meetings/$id")({
  component: MeetingDetailPage,
});

function MeetingDetailPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const profileId = getCurrentUserId();

  const meetingQuery = useMeeting(id);
  const attendeesQuery = useMeetingAttendees(id);
  const actionsQuery = useMeetingActions(id);
  const timelineQuery = useMeetingTimeline(id);

  const updateMut = useUpdateMeeting(id);
  const completeMut = useCompleteMeeting(id);
  const cancelMut = useCancelMeeting(id);
  const archiveMut = useArchiveMeeting(id);

  const [editOpen, setEditOpen] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [minutesDirty, setMinutesDirty] = useState(false);
  const [completeWarnOpen, setCompleteWarnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const meeting = meetingQuery.data?.data;
  const isMock = meetingQuery.data?.isMockData ?? false;

  useEffect(() => {
    if (meeting && !minutesDirty) {
      setMinutes(meeting.minutes ?? "");
    }
  }, [meeting, minutesDirty]);

  const canManage =
    role === "Admin" ||
    role === "Project Manager" ||
    meeting?.created_by === profileId ||
    meeting?.chair_profile_id === profileId;

  const canCompleteMeeting = canManage && meeting?.status === "scheduled";

  function canCompleteAction(action: MeetingActionView): boolean {
    if (action.status === "completed" || action.status === "cancelled") return false;
    return canManage || action.assigned_to === profileId;
  }

  async function saveMinutes() {
    const res = await updateMut.mutateAsync({ minutes: minutes.trim() || null });
    if (res.error) toast.error(res.error.message);
    else {
      toast.success("Minutes saved");
      setMinutesDirty(false);
    }
  }

  async function handleEdit(input: MeetingUpdateInput) {
    const res = await updateMut.mutateAsync(input);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Meeting updated");
    setEditOpen(false);
  }

  async function doComplete(skipWarning = false) {
    const res = await completeMut.mutateAsync(
      skipWarning ? { skip_minutes_warning: true } : undefined,
    );
    if (res.error) {
      if (res.error.code === "MINUTES_REQUIRED") {
        setCompleteWarnOpen(true);
        return;
      }
      toast.error(res.error.message);
      return;
    }
    toast.success("Meeting marked complete");
    setCompleteWarnOpen(false);
  }

  async function doCancel() {
    const res = await cancelMut.mutateAsync(undefined);
    if (res.error) toast.error(res.error.message);
    else {
      toast.success("Meeting cancelled");
      setCancelOpen(false);
    }
  }

  async function doArchive() {
    const res = await archiveMut.mutateAsync();
    if (res.error) toast.error(res.error.message);
    else {
      toast.success("Meeting archived");
      setArchiveOpen(false);
    }
  }

  if (meetingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (meetingQuery.isError || !meeting) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Meeting not found"
        description="This meeting may have been deleted or you don't have access."
        action={
          <Button variant="outline" asChild>
            <Link to="/meetings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Meetings
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/meetings">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Meetings
          </Link>
        </Button>
        <PageHeader
          title={meeting.title}
          subtitle={`${formatDateTime(meeting.scheduled_start)} – ${formatDateTime(meeting.scheduled_end)}${meeting.project_name ? ` · ${meeting.project_name}` : ""}`}
          actions={
            canManage && meeting.status !== "archived" ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {canCompleteMeeting && (
                  <Button size="sm" onClick={() => doComplete()} disabled={completeMut.isPending}>
                    {completeMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Mark Complete
                  </Button>
                )}
                {meeting.status !== "cancelled" && meeting.status !== "completed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelOpen(true)}
                    disabled={cancelMut.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )}
                {(meeting.status === "completed" || meeting.status === "cancelled") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchiveOpen(true)}
                    disabled={archiveMut.isPending}
                  >
                    <Archive className="h-4 w-4 mr-1" />
                    Archive
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      {isMock && (
        <p className="text-xs text-muted-foreground mb-3">Demo mode — mock meeting data.</p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <Badge className={MEETING_STATUS_CLASS[meeting.status]}>
          {MEETING_STATUS_LABEL[meeting.status]}
        </Badge>
        <Badge variant="outline">{meeting.meeting_type.replace(/_/g, " ")}</Badge>
        {meeting.visibility === "client_visible" && (
          <Badge variant="secondary">Client visible</Badge>
        )}
        {meeting.location && <Badge variant="outline">{meeting.location}</Badge>}
      </div>

      {meeting.status === "cancelled" && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            This meeting was cancelled
            {meeting.cancel_reason ? `: ${meeting.cancel_reason}` : "."}
          </AlertDescription>
        </Alert>
      )}

      {meeting.status === "archived" && (
        <Alert className="mb-4">
          <AlertDescription>
            This meeting is archived. Action items were soft-deleted.
          </AlertDescription>
        </Alert>
      )}

      {meeting.video_link && (
        <p className="text-sm mb-4">
          <a
            href={meeting.video_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Join video meeting
          </a>
        </p>
      )}

      <Tabs defaultValue="agenda" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="agenda">Agenda & Minutes</TabsTrigger>
          <TabsTrigger value="attendees">Attendees</TabsTrigger>
          <TabsTrigger value="actions">Action Items</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Agenda</Label>
            <pre className="mt-2 p-3 rounded-md border bg-muted/30 text-sm whitespace-pre-wrap font-sans">
              {meeting.agenda?.trim() || "No agenda recorded."}
            </pre>
          </div>
          <div>
            <Label htmlFor="minutes" className="text-sm font-semibold">
              Minutes
            </Label>
            {canManage && meeting.status !== "archived" ? (
              <>
                <Textarea
                  id="minutes"
                  className="mt-2"
                  rows={8}
                  value={minutes}
                  onChange={(e) => {
                    setMinutes(e.target.value);
                    setMinutesDirty(true);
                  }}
                  placeholder="Record discussion notes and decisions…"
                />
                <Button
                  className="mt-2"
                  size="sm"
                  onClick={saveMinutes}
                  disabled={updateMut.isPending || !minutesDirty}
                >
                  {updateMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save minutes
                </Button>
              </>
            ) : (
              <pre className="mt-2 p-3 rounded-md border bg-muted/30 text-sm whitespace-pre-wrap font-sans">
                {meeting.minutes?.trim() || "No minutes recorded."}
              </pre>
            )}
          </div>
        </TabsContent>

        <TabsContent value="attendees">
          <AttendeeList
            meetingId={id}
            attendees={attendeesQuery.data ?? []}
            canManage={canManage && meeting.status !== "archived"}
            isLoading={attendeesQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="actions">
          <ActionItemList
            meetingId={id}
            actions={actionsQuery.data ?? []}
            canManage={canManage && meeting.status !== "archived"}
            canComplete={canCompleteAction}
            isLoading={actionsQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <MeetingTimeline
            items={timelineQuery.data ?? []}
            isLoading={timelineQuery.isLoading}
            error={timelineQuery.isError}
            onRetry={() => timelineQuery.refetch()}
          />
        </TabsContent>
      </Tabs>

      <MeetingFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        meeting={meeting}
        onSubmit={handleEdit}
        isPending={updateMut.isPending}
      />

      <AlertDialog open={completeWarnOpen} onOpenChange={setCompleteWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete without minutes?</AlertDialogTitle>
            <AlertDialogDescription>
              No minutes have been recorded for this meeting. You can still mark it complete, but
              consider saving minutes first for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => doComplete(true)}>Complete anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Attendees will be notified. Open action items will remain open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep scheduled</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>Cancel meeting</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              The meeting will be hidden from the default list. Action items will be soft-deleted.
              Admins can filter by archived status to recover reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
