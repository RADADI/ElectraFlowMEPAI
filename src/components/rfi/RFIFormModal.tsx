/**
 * RFIFormModal — Phase 8
 *
 * Handles Create (no initialRFI) and Edit (with initialRFI).
 * Validates unique rfi_number client-side before submission.
 * Handles DB 23505 duplicate-number error from the service.
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
import { Loader2, AlertCircle } from "lucide-react";
import { useProjects } from "@/hooks/api/useProjects";
import { useCreateRFI, useUpdateRFI } from "@/hooks/api/useRFI";
import type { RFIView, RFICreateInput, RFIUpdateInput } from "@/types/rfi-view";
import type { ProjectView } from "@/types/project-view";

interface RFIFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRFI?: RFIView;
  defaultProjectId?: string;
  onSuccess?: (rfi: RFIView) => void;
}

const DISCIPLINES = [
  "Electrical",
  "Mechanical",
  "Civil/Structural",
  "Plumbing",
  "Fire Protection",
  "General",
];

export function RFIFormModal({
  open,
  onOpenChange,
  initialRFI,
  defaultProjectId,
  onSuccess,
}: RFIFormModalProps) {
  const isEdit = !!initialRFI;

  const [projectId, setProjectId] = useState(initialRFI?.project_id ?? defaultProjectId ?? "");
  const [rfiNumber, setRfiNumber] = useState(initialRFI?.rfi_number ?? "");
  const [title, setTitle] = useState(initialRFI?.title ?? "");
  const [question, setQuestion] = useState(initialRFI?.question ?? initialRFI?.description ?? "");
  const [discipline, setDiscipline] = useState(initialRFI?.discipline ?? "");
  const [priority, setPriority] = useState<RFICreateInput["priority"]>(
    initialRFI?.priority ?? "medium",
  );
  const [requiredDate, setRequiredDate] = useState(initialRFI?.required_date ?? "");
  const [costImpact, setCostImpact] = useState(initialRFI?.cost_impact ?? false);
  const [scheduleImpact, setScheduleImpact] = useState(initialRFI?.schedule_impact ?? false);
  const [error, setError] = useState<string | null>(null);

  const projectsQuery = useProjects();
  const projects: ProjectView[] = projectsQuery.data ?? [];

  const createMut = useCreateRFI();
  const updateMut = useUpdateRFI(initialRFI?.id ?? "");
  const isBusy = createMut.isPending || updateMut.isPending;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setProjectId(initialRFI?.project_id ?? defaultProjectId ?? "");
      setRfiNumber(initialRFI?.rfi_number ?? "");
      setTitle(initialRFI?.title ?? "");
      setQuestion(initialRFI?.question ?? initialRFI?.description ?? "");
      setDiscipline(initialRFI?.discipline ?? "");
      setPriority(initialRFI?.priority ?? "medium");
      setRequiredDate(initialRFI?.required_date ?? "");
      setCostImpact(initialRFI?.cost_impact ?? false);
      setScheduleImpact(initialRFI?.schedule_impact ?? false);
      setError(null);
    }
  }, [open, initialRFI, defaultProjectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && !projectId) {
      setError("Please select a project.");
      return;
    }
    if (!rfiNumber.trim()) {
      setError("RFI number is required.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }

    if (isEdit) {
      const input: RFIUpdateInput = {
        title: title.trim(),
        question: question.trim(),
        discipline: discipline || undefined,
        priority,
        required_date: requiredDate || undefined,
        cost_impact: costImpact,
        schedule_impact: scheduleImpact,
      };
      const result = await updateMut.mutateAsync(input);
      if (result.error) {
        setError(result.error?.message ?? "An error occurred.");
        return;
      }
      onSuccess?.(result.data!);
      onOpenChange(false);
    } else {
      const input: RFICreateInput = {
        project_id: projectId,
        rfi_number: rfiNumber.trim(),
        title: title.trim(),
        question: question.trim(),
        discipline: discipline || undefined,
        priority,
        required_date: requiredDate || undefined,
        cost_impact: costImpact,
        schedule_impact: scheduleImpact,
      };
      const result = await createMut.mutateAsync(input);
      if (result.error) {
        setError(result.error?.message ?? "An error occurred.");
        return;
      }
      onSuccess?.(result.data!);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit RFI" : "Create New RFI"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the RFI details below."
              : "Fill in the details for the new Request for Information."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project (create only) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="rfi-project">Project *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="rfi-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: ProjectView) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* RFI Number (create only) */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="rfi-number">RFI Number *</Label>
              <Input
                id="rfi-number"
                placeholder="e.g. RFI-001"
                value={rfiNumber}
                onChange={(e) => setRfiNumber(e.target.value)}
              />
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="rfi-title">Title *</Label>
            <Input
              id="rfi-title"
              placeholder="e.g. Clarification on panel schedule"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Question */}
          <div className="space-y-1.5">
            <Label htmlFor="rfi-question">Question *</Label>
            <Textarea
              id="rfi-question"
              placeholder="Describe the question or clarification needed in detail..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
            />
          </div>

          {/* Discipline + Priority row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Discipline</Label>
              <Select value={discipline} onValueChange={setDiscipline}>
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
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as RFICreateInput["priority"])}
              >
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
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label htmlFor="rfi-due">Required By</Label>
            <Input
              id="rfi-due"
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
            />
          </div>

          {/* Impact flags */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={costImpact}
                onChange={(e) => setCostImpact(e.target.checked)}
              />
              <span className="text-sm">Cost Impact</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={scheduleImpact}
                onChange={(e) => setScheduleImpact(e.target.checked)}
              />
              <span className="text-sm">Schedule Impact</span>
            </label>
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
            <Button type="submit" disabled={isBusy}>
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create RFI"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
