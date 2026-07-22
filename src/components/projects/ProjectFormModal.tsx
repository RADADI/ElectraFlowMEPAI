/**
 * ProjectFormModal — shared create / edit form for projects.
 *
 * Reused for both the "Create Project" button and the inline "Edit" action
 * in the project list. Validates required fields client-side and calls
 * the appropriate React Query mutation.
 *
 * In mock mode (no Supabase configured) changes go to the sessionStorage
 * overlay and a demo-mode banner is shown.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useCreateProject, useUpdateProject } from "@/hooks/api/useProjects";
import type { ProjectView, ProjectCreateInput } from "@/types/project-view";

// ─── Disciplines constant (static MEP list) ───────────────────────────────────

const DISCIPLINES = [
  "Division 21 - Fire Suppression",
  "Division 22 - Plumbing",
  "Division 23 - HVAC",
  "Division 26 - Electrical",
  "Division 27 - Communications",
  "Division 28 - Security",
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProjectFormModalProps {
  mode: "create" | "edit";
  project?: ProjectView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ─── Initial form state ───────────────────────────────────────────────────────

type FormState = {
  project_number: string;
  name: string;
  description: string;
  client_name: string;
  pm_name: string;
  location: string;
  discipline: string;
  status: ProjectView["status"];
  priority: ProjectView["priority"];
  risk_level: ProjectView["risk_level"];
  start_date: string;
  end_date: string;
  budget: string;
};

function emptyForm(): FormState {
  return {
    project_number: "",
    name: "",
    description: "",
    client_name: "",
    pm_name: "",
    location: "",
    discipline: "",
    status: "planning",
    priority: "medium",
    risk_level: "low",
    start_date: "",
    end_date: "",
    budget: "",
  };
}

function fromProject(p: ProjectView): FormState {
  return {
    project_number: p.project_number,
    name: p.name,
    description: p.description ?? "",
    client_name: p.client_name ?? "",
    pm_name: p.pm_name ?? "",
    location: p.location ?? "",
    discipline: p.discipline ?? "",
    status: p.status,
    priority: p.priority,
    risk_level: p.risk_level,
    start_date: p.start_date ?? "",
    end_date: p.end_date ?? "",
    budget: p.budget != null ? String(p.budget) : "",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectFormModal({
  mode,
  project,
  open,
  onOpenChange,
  onSuccess,
}: ProjectFormModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(project?.id ?? "");
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Sync form when modal opens or project changes
  useEffect(() => {
    if (open) {
      setForm(mode === "edit" && project ? fromProject(project) : emptyForm());
      setErrors({});
    }
  }, [open, mode, project]);

  const set = (field: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.project_number.trim()) errs.project_number = "Project number is required.";
    if (!form.name.trim()) errs.name = "Project name is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = (): ProjectCreateInput => ({
    project_number: form.project_number.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    client_name: form.client_name.trim() || null,
    pm_name: form.pm_name.trim() || null,
    location: form.location.trim() || null,
    discipline: form.discipline || null,
    status: form.status,
    priority: form.priority,
    risk_level: form.risk_level,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    budget: form.budget ? parseFloat(form.budget) : null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = buildPayload();

    if (mode === "create") {
      const result = await createMutation.mutateAsync(payload);
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        result.isMockData
          ? "Project created (demo — changes disappear after refresh)"
          : "Project created successfully.",
      );
    } else {
      const result = await updateMutation.mutateAsync(payload);
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        result.isMockData
          ? "Project updated (demo — changes disappear after refresh)"
          : "Project updated successfully.",
      );
    }

    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create new project" : "Edit project"}</DialogTitle>
        </DialogHeader>

        {!IS_SUPABASE_CONFIGURED && (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <Info className="h-4 w-4 shrink-0" />
            Demo mode — changes are temporary and disappear after refresh.
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-2 gap-3 py-2">
            {/* Project Number */}
            <div className="space-y-1.5">
              <Label>
                Project Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.project_number}
                onChange={(e) => set("project_number")(e.target.value)}
                placeholder="EF-2025-001"
              />
              {errors.project_number && (
                <p className="text-xs text-destructive">{errors.project_number}</p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label>
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="Metro Station Electrical Upgrade"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input
                value={form.client_name}
                onChange={(e) => set("client_name")(e.target.value)}
                placeholder="Metro Transit Authority"
              />
            </div>

            {/* PM */}
            <div className="space-y-1.5">
              <Label>Project Manager</Label>
              <Input
                value={form.pm_name}
                onChange={(e) => set("pm_name")(e.target.value)}
                placeholder="Ahmed Hassan"
              />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => set("location")(e.target.value)}
                placeholder="Riyadh, KSA"
              />
            </div>

            {/* Discipline */}
            <div className="space-y-1.5">
              <Label>Discipline</Label>
              <Select value={form.discipline} onValueChange={set("discipline")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select discipline" />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active (On Track)</SelectItem>
                  <SelectItem value="on_hold">On Hold (Delayed)</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Risk Level */}
            <div className="space-y-1.5">
              <Label>Risk Level</Label>
              <Select value={form.risk_level} onValueChange={set("risk_level")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Budget */}
            <div className="space-y-1.5">
              <Label>Budget (USD)</Label>
              <Input
                type="number"
                min="0"
                value={form.budget}
                onChange={(e) => set("budget")(e.target.value)}
                placeholder="4200000"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date")(e.target.value)}
              />
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date")(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5 col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => set("description")(e.target.value)}
                placeholder="Brief project description"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "create" ? "Create Project" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
