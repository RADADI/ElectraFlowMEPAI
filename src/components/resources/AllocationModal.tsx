/**
 * AllocationModal — Phase 10
 *
 * Create or edit a resource allocation.
 * Handles overbooking warning + Admin force-override.
 * Validates date range, allocation percent, and project selection.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { useCreateAllocation, useUpdateAllocation } from "@/hooks/api/useEmployees";
import { useProjects } from "@/hooks/api/useProjects";
import { useAuth } from "@/contexts/auth-context";
import type { AllocationView, AllocationCreateInput } from "@/types/employee-view";

interface AllocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  initialAllocation?: AllocationView;
  onSuccess?: () => void;
}

export function AllocationModal({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  initialAllocation,
  onSuccess,
}: AllocationModalProps) {
  const isEdit = !!initialAllocation;
  const { role } = useAuth();
  const isAdmin = (role ?? "").toLowerCase() === "admin";

  const [projectId, setProjectId] = useState(initialAllocation?.project_id ?? "");
  const [roleOnProject, setRoleOnProject] = useState(initialAllocation?.role_on_project ?? "");
  const [allocationPct, setAllocationPct] = useState(
    String(initialAllocation?.allocation_percent ?? 100),
  );
  const [weeklyHours, setWeeklyHours] = useState(String(initialAllocation?.weekly_hours ?? ""));
  const [startDate, setStartDate] = useState(initialAllocation?.start_date ?? "");
  const [endDate, setEndDate] = useState(initialAllocation?.end_date ?? "");
  const [notes, setNotes] = useState(initialAllocation?.notes ?? "");
  const [forceOverride, setForceOverride] = useState(false);
  const [overbooked, setOverbooked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateAllocation();
  const updateMut = useUpdateAllocation(employeeId);
  const isBusy = createMut.isPending || updateMut.isPending;

  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setProjectId(initialAllocation?.project_id ?? "");
      setRoleOnProject(initialAllocation?.role_on_project ?? "");
      setAllocationPct(String(initialAllocation?.allocation_percent ?? 100));
      setWeeklyHours(String(initialAllocation?.weekly_hours ?? ""));
      setStartDate(initialAllocation?.start_date ?? "");
      setEndDate(initialAllocation?.end_date ?? "");
      setNotes(initialAllocation?.notes ?? "");
      setForceOverride(false);
      setOverbooked(false);
      setError(null);
    }
  }, [open, initialAllocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOverbooked(false);

    if (!projectId) {
      setError("Please select a project.");
      return;
    }
    if (!startDate) {
      setError("Start date is required.");
      return;
    }
    if (endDate && endDate < startDate) {
      setError("End date must be after start date.");
      return;
    }
    const pct = Number(allocationPct);
    if (isNaN(pct) || pct < 1 || pct > 100) {
      setError("Allocation percent must be between 1 and 100.");
      return;
    }

    const input: AllocationCreateInput = {
      employee_id: employeeId,
      project_id: projectId,
      role_on_project: roleOnProject.trim() || undefined,
      allocation_percent: pct,
      weekly_hours: weeklyHours ? Number(weeklyHours) : undefined,
      start_date: startDate,
      end_date: endDate || undefined,
      notes: notes.trim() || undefined,
      force: isAdmin && forceOverride,
    };

    if (isEdit && initialAllocation) {
      const result = await updateMut.mutateAsync({
        id: initialAllocation.id,
        input: {
          role_on_project: input.role_on_project,
          allocation_percent: input.allocation_percent,
          weekly_hours: input.weekly_hours,
          start_date: input.start_date,
          end_date: input.end_date,
          notes: input.notes,
          force: input.force,
        },
      });
      if (result.error) {
        const msg = result.error.message ?? "An error occurred.";
        if (msg.startsWith("OVERBOOK:")) {
          setOverbooked(true);
          setError(msg.replace("OVERBOOK: ", ""));
        } else {
          setError(msg);
        }
        return;
      }
    } else {
      const result = await createMut.mutateAsync(input);
      if (result.error) {
        const msg = result.error.message ?? "An error occurred.";
        if (msg.startsWith("OVERBOOK:")) {
          setOverbooked(true);
          setError(msg.replace("OVERBOOK: ", ""));
        } else {
          setError(msg);
        }
        return;
      }
    }

    onSuccess?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Allocation" : `Allocate ${employeeName}`}</DialogTitle>
          <DialogDescription>
            Assign {isEdit ? "updated allocation" : "project allocation"} for this team member.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant={overbooked ? "default" : "destructive"}>
            {overbooked ? (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription className={overbooked ? "text-yellow-700" : ""}>
              {error}
            </AlertDescription>
          </Alert>
        )}

        {overbooked && isAdmin && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2">
            <Checkbox
              id="force-override"
              checked={forceOverride}
              onCheckedChange={(v) => setForceOverride(v === true)}
            />
            <Label htmlFor="force-override" className="text-yellow-800 cursor-pointer">
              Admin override — force-create despite overbooking
            </Label>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder="Select project..." />
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

          <div className="space-y-1.5">
            <Label htmlFor="alloc-role">Role on Project</Label>
            <Input
              id="alloc-role"
              placeholder="e.g. Lead Engineer, Site Inspector"
              value={roleOnProject}
              onChange={(e) => setRoleOnProject(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="alloc-pct">Allocation % *</Label>
              <Input
                id="alloc-pct"
                type="number"
                min={1}
                max={100}
                value={allocationPct}
                onChange={(e) => setAllocationPct(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alloc-hrs">Weekly Hours (optional)</Label>
              <Input
                id="alloc-hrs"
                type="number"
                min={1}
                max={60}
                placeholder="Derived from %"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="alloc-start">Start Date *</Label>
              <Input
                id="alloc-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alloc-end">End Date</Label>
              <Input
                id="alloc-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alloc-notes">Notes</Label>
            <Input
              id="alloc-notes"
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isBusy || (overbooked && (!isAdmin || !forceOverride))}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Allocation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
