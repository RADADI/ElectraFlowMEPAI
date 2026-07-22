/**
 * LeaveRequestModal — Phase 11
 * Create a new leave request with holiday-aware day count and conflict warnings.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useCreateLeaveRequest } from "@/hooks/api/useLeave";
import { useHolidays } from "@/hooks/api/useHolidays";
import { countWorkingDays } from "@/types/timesheet-view";
import { checkLeaveConflicts } from "@/services/leave.service";
import type { LeaveType, LeaveConflict } from "@/types/timesheet-view";

interface LeaveRequestModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId?: string;
  onSuccess?: () => void;
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "pto", label: "PTO / Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "holiday", label: "Public Holiday" },
  { value: "bereavement", label: "Bereavement" },
  { value: "other", label: "Other" },
];

function conflictBadge(c: LeaveConflict) {
  switch (c.severity) {
    case "critical_path_conflict":
      return (
        <Badge key={c.severity} className="bg-red-100 text-red-700 text-xs">
          Critical Path Conflict
        </Badge>
      );
    case "allocation_conflict":
      return (
        <Badge key={c.severity} className="bg-orange-100 text-orange-700 text-xs">
          Allocation Conflict
        </Badge>
      );
    case "overlapping_leave":
      return (
        <Badge key={c.severity} className="bg-yellow-100 text-yellow-700 text-xs">
          Overlapping Leave
        </Badge>
      );
    default:
      return (
        <Badge key={c.severity} className="bg-green-100 text-green-700 text-xs">
          No Conflict
        </Badge>
      );
  }
}

export function LeaveRequestModal({
  open,
  onOpenChange,
  employeeId,
  onSuccess,
}: LeaveRequestModalProps) {
  const [leaveType, setLeaveType] = useState<LeaveType>("pto");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<LeaveConflict[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);

  const createMut = useCreateLeaveRequest();
  const holidays = useHolidays();
  const holidayDates = (holidays.data ?? []).map((h) => h.holiday_date);

  useEffect(() => {
    if (open) {
      setLeaveType("pto");
      setStartDate("");
      setEndDate("");
      setReason("");
      setError(null);
      setConflicts([]);
      setWorkingDays(null);
    }
  }, [open]);

  useEffect(() => {
    if (startDate && endDate && endDate >= startDate) {
      const days = countWorkingDays(startDate, endDate, holidayDates);
      setWorkingDays(days);

      // Check conflicts async
      if (employeeId) {
        checkLeaveConflicts(employeeId, startDate, endDate).then(setConflicts);
      }
    } else {
      setWorkingDays(null);
      setConflicts([]);
    }
  }, [startDate, endDate, employeeId, holidayDates]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate) {
      setError("Start date is required.");
      return;
    }
    if (!endDate) {
      setError("End date is required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after start date.");
      return;
    }
    if (workingDays === 0) {
      setError("The selected range contains no working days.");
      return;
    }
    if (["bereavement", "other"].includes(leaveType) && !reason.trim()) {
      setError("A reason is required for this leave type.");
      return;
    }

    const hasBlockingConflict = conflicts.some((c) => c.severity === "overlapping_leave");
    if (hasBlockingConflict) {
      setError("You already have a pending or approved leave that overlaps these dates.");
      return;
    }

    const result = await createMut.mutateAsync({
      employee_id: employeeId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || undefined,
    });

    if (result.error) {
      setError(result.error.message ?? "An error occurred.");
      return;
    }

    onSuccess?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Request Leave</DialogTitle>
          <DialogDescription>Submit a leave request for HR / PM approval.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Leave Type *</Label>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="leave-start">Start Date *</Label>
              <Input
                id="leave-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-end">End Date *</Label>
              <Input
                id="leave-end"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {workingDays !== null && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30 text-sm">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span>
                <strong>{workingDays}</strong> working day
                {workingDays !== 1 ? "s" : ""} (weekends and holidays excluded)
              </span>
            </div>
          )}

          {/* Conflict badges */}
          {conflicts.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">{conflicts.map((c) => conflictBadge(c))}</div>
              {conflicts.map((c) => (
                <Alert
                  key={c.severity}
                  className={
                    c.severity === "overlapping_leave"
                      ? "border-yellow-200 bg-yellow-50"
                      : "border-orange-200 bg-orange-50"
                  }
                >
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="text-orange-700 text-sm">
                    {c.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="leave-reason">
              Reason
              {["bereavement", "other"].includes(leaveType) && " *"}
            </Label>
            <Textarea
              id="leave-reason"
              placeholder="Optional notes or reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMut.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                createMut.isPending || conflicts.some((c) => c.severity === "overlapping_leave")
              }
            >
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
