/**
 * Meeting action items — Phase 15A
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { Loader2, Plus, CheckCircle2, ClipboardList } from "lucide-react";
import type { MeetingActionView } from "@/types/meeting-view";
import { ACTION_STATUS_LABEL } from "@/types/meeting-view";
import {
  useAddActionItem,
  useCompleteMeetingAction,
  useUpdateMeetingAction,
} from "@/hooks/api/useMeetings";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

interface ActionItemListProps {
  meetingId: string;
  actions: MeetingActionView[];
  canManage: boolean;
  canComplete: (action: MeetingActionView) => boolean;
  isLoading?: boolean;
}

export function ActionItemList({
  meetingId,
  actions,
  canManage,
  canComplete,
  isLoading,
}: ActionItemListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");

  const addMut = useAddActionItem(meetingId);
  const completeMut = useCompleteMeetingAction(meetingId);
  const updateMut = useUpdateMeetingAction(meetingId);

  async function handleAdd() {
    if (!title.trim()) return;
    try {
      const res = await addMut.mutateAsync({
        title: title.trim(),
        assigned_to: assignee.trim() || null,
        due_date: dueDate || null,
      });
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Action item added");
      setAddOpen(false);
      setTitle("");
      setAssignee("");
      setDueDate("");
    } catch {
      toast.error("Failed to add action item");
    }
  }

  async function handleComplete(actionId: string) {
    try {
      const res = await completeMut.mutateAsync(actionId);
      if (res.error) toast.error(res.error.message);
      else toast.success("Action item completed");
    } catch {
      toast.error("Failed to complete action item");
    }
  }

  async function handleReopen(action: MeetingActionView) {
    try {
      const res = await updateMut.mutateAsync({ id: action.id, input: { status: "open" } });
      if (res.error) toast.error(res.error.message);
      else toast.success("Action item reopened");
    } catch {
      toast.error("Failed to reopen action item");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add action item
        </Button>
      )}

      {actions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No action items"
          description="Create follow-up tasks from this meeting."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">{a.title}</TableCell>
                  <TableCell>
                    {a.assignee_name ?? "—"}
                    {a.is_deactivated_assignee && (
                      <Badge variant="outline" className="ml-1 text-xs">
                        Former
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{a.due_date ? formatDate(a.due_date) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={a.display_status === "overdue" ? "destructive" : "outline"}>
                      {ACTION_STATUS_LABEL[a.display_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.status !== "completed" && a.status !== "cancelled" && canComplete(a) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={completeMut.isPending}
                        onClick={() => handleComplete(a.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Complete
                      </Button>
                    )}
                    {a.status === "completed" && canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={updateMut.isPending}
                        onClick={() => handleReopen(a)}
                      >
                        Undo
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add action item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Assignee profile ID</Label>
              <Input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="mock-prof-sara"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMut.isPending}>
              {addMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
