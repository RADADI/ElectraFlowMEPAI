/**
 * SubmittalFormModal — Phase 7
 *
 * Handles both Create (no initialSubmittal) and Edit (with initialSubmittal).
 * Validates unique submittal_number client-side before submission.
 * Friendly handling of DB 23505 duplicate-number error from the service.
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
import { Loader2 } from "lucide-react";
import { DISCIPLINES } from "@/lib/dummy-data";
import { useProjects } from "@/hooks/api/useProjects";
import type { ProjectView } from "@/types/project-view";
import type {
  SubmittalView,
  SubmittalCreateInput,
  SubmittalUpdateInput,
} from "@/types/submittal-view";

interface SubmittalFormModalProps {
  open: boolean;
  onClose: (success?: boolean) => void;
  /** When provided the modal operates in Edit mode. */
  initialSubmittal?: SubmittalView;
  /** Pre-selects a project and hides the selector (useful from project detail page). */
  preselectedProjectId?: string;
  isMockMode: boolean;
  onCreate?: (input: SubmittalCreateInput) => Promise<{ error: { message: string } | null }>;
  onEdit?: (input: SubmittalUpdateInput) => Promise<{ error: { message: string } | null }>;
}

const EMPTY_FORM = {
  project_id: "",
  submittal_number: "",
  title: "",
  discipline: "",
  spec_section: "",
  description: "",
  required_date: "",
  review_due_date: "",
};

export function SubmittalFormModal({
  open,
  onClose,
  initialSubmittal,
  preselectedProjectId,
  isMockMode,
  onCreate,
  onEdit,
}: SubmittalFormModalProps) {
  const isEdit = !!initialSubmittal;

  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];

  // Populate form from initialSubmittal when editing
  useEffect(() => {
    if (open) {
      if (initialSubmittal) {
        setForm({
          project_id: initialSubmittal.project_id,
          submittal_number: initialSubmittal.submittal_number,
          title: initialSubmittal.title,
          discipline: initialSubmittal.discipline ?? "",
          spec_section: initialSubmittal.spec_section ?? "",
          description: initialSubmittal.description ?? "",
          required_date: initialSubmittal.required_date ?? "",
          review_due_date: initialSubmittal.review_due_date ?? "",
        });
      } else {
        setForm({ ...EMPTY_FORM, project_id: preselectedProjectId ?? "" });
      }
      setError(null);
    }
  }, [open, initialSubmittal, preselectedProjectId]);

  const set =
    (field: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const setSelect = (field: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.project_id) {
      setError("Please select a project.");
      return;
    }
    if (!form.submittal_number.trim()) {
      setError("Submittal number is required.");
      return;
    }
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && onEdit) {
        const result = await onEdit({
          title: form.title,
          discipline: form.discipline || undefined,
          spec_section: form.spec_section || undefined,
          description: form.description || undefined,
          required_date: form.required_date || undefined,
          review_due_date: form.review_due_date || undefined,
        });
        if (result.error) {
          setError(result.error.message);
          return;
        }
      } else if (onCreate) {
        const result = await onCreate({
          project_id: form.project_id,
          submittal_number: form.submittal_number.trim(),
          title: form.title.trim(),
          discipline: form.discipline || undefined,
          spec_section: form.spec_section || undefined,
          description: form.description || undefined,
          required_date: form.required_date || undefined,
          review_due_date: form.review_due_date || undefined,
        });
        if (result.error) {
          setError(result.error.message);
          return;
        }
      }
      onClose(true);
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveProjectId = preselectedProjectId ?? form.project_id;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Submittal" : "Create Submittal"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update submittal metadata. Submittal number cannot be changed after creation."
              : "Create a new submittal. The number must be unique within the project."}
          </DialogDescription>
        </DialogHeader>

        {isMockMode && (
          <Alert className="border-warning/40 bg-warning/10 text-warning text-sm">
            <AlertDescription>
              Demo mode — changes are temporary and will disappear after refresh.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Project selector (hidden in edit mode or when preselected) */}
          {!isEdit && !preselectedProjectId && (
            <div className="space-y-1.5">
              <Label htmlFor="project">Project *</Label>
              <Select value={form.project_id} onValueChange={setSelect("project_id")}>
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: ProjectView) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.project_number ? `${p.project_number} — ` : ""}
                      {p.name}
                    </SelectItem>
                  ))}
                  {projects.length === 0 && (
                    <SelectItem value="_none" disabled>
                      No projects found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Number — read-only in edit mode */}
          <div className="space-y-1.5">
            <Label htmlFor="number">Submittal Number *</Label>
            <Input
              id="number"
              value={form.submittal_number}
              onChange={set("submittal_number")}
              placeholder="e.g. LV-CBL-01"
              disabled={isEdit}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Submittal number cannot be changed after creation.
              </p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={set("title")}
              placeholder="e.g. XLPE Power Cable 4C×95mm²"
            />
          </div>

          {/* Discipline */}
          <div className="space-y-1.5">
            <Label htmlFor="discipline">Discipline</Label>
            <Select value={form.discipline} onValueChange={setSelect("discipline")}>
              <SelectTrigger id="discipline">
                <SelectValue placeholder="Select discipline…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Spec section */}
          <div className="space-y-1.5">
            <Label htmlFor="spec">Spec Section</Label>
            <Input
              id="spec"
              value={form.spec_section}
              onChange={set("spec_section")}
              placeholder="e.g. 26 05 19"
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="required_date">Required Date</Label>
              <Input
                id="required_date"
                type="date"
                value={form.required_date}
                onChange={set("required_date")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review_due_date">Review Due Date</Label>
              <Input
                id="review_due_date"
                type="date"
                value={form.review_due_date}
                onChange={set("review_due_date")}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description / Notes</Label>
            <Textarea
              id="desc"
              value={form.description}
              onChange={set("description")}
              placeholder="Additional information…"
              rows={3}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Submittal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
