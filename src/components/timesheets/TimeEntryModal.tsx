/**
 * TimeEntryModal — Phase 11
 * Add or edit a single timesheet entry (project + date + hours).
 * Shows weekend badge, blocks >24h per day.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle } from "lucide-react";
import { useProjects } from "@/hooks/api/useProjects";
import { isWeekend } from "@/types/timesheet-view";
import type { TimesheetEntryView, TimesheetWorkType } from "@/types/timesheet-view";

interface TimeEntryModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  timesheetId: string;
  initialEntry?: TimesheetEntryView;
  prefillDate?: string;
  weekDays: string[];
  onAdd?: (data: {
    project_id: string;
    entry_date: string;
    hours: number;
    work_type: TimesheetWorkType;
    description?: string;
    billable: boolean;
  }) => Promise<void>;
  onUpdate?: (
    id: string,
    patch: {
      hours?: number;
      description?: string;
      work_type?: TimesheetWorkType;
      billable?: boolean;
    },
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isBusy?: boolean;
}

const WORK_TYPES: { value: TimesheetWorkType; label: string }[] = [
  { value: "regular", label: "Regular" },
  { value: "overtime", label: "Overtime" },
  { value: "travel", label: "Travel" },
  { value: "training", label: "Training" },
  { value: "admin", label: "Admin" },
];

export function TimeEntryModal({
  open,
  onOpenChange,
  timesheetId: _timesheetId,
  initialEntry,
  prefillDate,
  weekDays,
  onAdd,
  onUpdate,
  onDelete,
  isBusy,
}: TimeEntryModalProps) {
  const isEdit = !!initialEntry;
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];

  const [projectId, setProjectId] = useState(initialEntry?.project_id ?? "");
  const [entryDate, setEntryDate] = useState(
    initialEntry?.entry_date ?? prefillDate ?? weekDays[0] ?? "",
  );
  const [hours, setHours] = useState(String(initialEntry?.hours ?? ""));
  const [workType, setWorkType] = useState<TimesheetWorkType>(initialEntry?.work_type ?? "regular");
  const [description, setDescription] = useState(initialEntry?.description ?? "");
  const [billable, setBillable] = useState(initialEntry?.billable ?? true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProjectId(initialEntry?.project_id ?? "");
      setEntryDate(initialEntry?.entry_date ?? prefillDate ?? weekDays[0] ?? "");
      setHours(String(initialEntry?.hours ?? ""));
      setWorkType(initialEntry?.work_type ?? "regular");
      setDescription(initialEntry?.description ?? "");
      setBillable(initialEntry?.billable ?? true);
      setError(null);
    }
  }, [open, initialEntry, prefillDate, weekDays]);

  const weekend = entryDate ? isWeekend(entryDate) : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && !projectId) {
      setError("Please select a project.");
      return;
    }
    if (!entryDate) {
      setError("Please select a date.");
      return;
    }
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) {
      setError("Hours must be greater than 0.");
      return;
    }
    if (h > 24) {
      setError("Hours cannot exceed 24 in a single entry.");
      return;
    }

    if (isEdit && onUpdate) {
      await onUpdate(initialEntry!.id, {
        hours: h,
        description: description.trim() || undefined,
        work_type: workType,
        billable,
      });
    } else if (onAdd) {
      await onAdd({
        project_id: projectId,
        entry_date: entryDate,
        hours: h,
        work_type: workType,
        description: description.trim() || undefined,
        billable,
      });
    }
    onOpenChange(false);
  }

  async function handleDelete() {
    if (onDelete && initialEntry) {
      await onDelete(initialEntry.id);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Time Entry" : "Log Time"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this time entry." : "Add hours to a project for a specific day."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: { id: string; name: string }) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEdit && (
            <p className="text-sm font-medium">Project: {initialEntry?.project_name ?? "—"}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Select value={entryDate} onValueChange={setEntryDate} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekDays.map((d) => (
                    <SelectItem key={d} value={d}>
                      {new Date(d + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {weekend && (
                <Badge className="bg-orange-100 text-orange-700 text-[10px]">Weekend Entry</Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entry-hours">Hours *</Label>
              <Input
                id="entry-hours"
                type="number"
                step={0.5}
                min={0.1}
                max={24}
                placeholder="e.g. 8"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Work Type</Label>
            <Select value={workType} onValueChange={(v) => setWorkType(v as TimesheetWorkType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_TYPES.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-desc">Description</Label>
            <Textarea
              id="entry-desc"
              placeholder="What did you work on?"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="entry-billable"
              checked={billable}
              onCheckedChange={(v) => setBillable(v === true)}
            />
            <Label htmlFor="entry-billable" className="cursor-pointer">
              Billable
            </Label>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {isEdit && onDelete && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive border-destructive/50 hover:bg-destructive/10 sm:mr-auto"
                onClick={handleDelete}
                disabled={isBusy}
              >
                Delete Entry
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save" : "Log Hours"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
