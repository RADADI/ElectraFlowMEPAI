/**
 * ReportBuilder — create saved report form.
 */

import { useState } from "react";
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
import { REPORT_TYPES, REPORT_TYPE_CATEGORY, isFutureReportType } from "@/lib/widget-registry";
import { DEFAULT_REPORT_COLUMNS } from "@/types/report-view";
import type { CreateReportInput } from "@/types/report-view";
import type { ReportVisibility } from "@/types/database";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ReportBuilderProps {
  onSubmit: (input: CreateReportInput) => Promise<void>;
  isPending?: boolean;
}

export function ReportBuilder({ onSubmit, isPending }: ReportBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reportType, setReportType] = useState<string>("projects");
  const [visibility, setVisibility] = useState<ReportVisibility>("private");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Report name is required.");
      return;
    }
    if (isFutureReportType(reportType as import("@/types/database").ReportType)) {
      toast.error("This report type is not yet configured.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      report_type: reportType as import("@/types/database").ReportType,
      report_category: REPORT_TYPE_CATEGORY[reportType as import("@/types/database").ReportType],
      columns: DEFAULT_REPORT_COLUMNS[reportType as import("@/types/database").ReportType],
      visibility,
    });
    setName("");
    setDescription("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <Label htmlFor="report-name">Report name *</Label>
        <Input
          id="report-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Monthly Project Status"
          required
        />
      </div>
      <div>
        <Label htmlFor="report-desc">Description</Label>
        <Textarea
          id="report-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div>
        <Label>Report type</Label>
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace("_", " ")}
                {isFutureReportType(t) ? " (future)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Visibility</Label>
        <Select value={visibility} onValueChange={(v) => setVisibility(v as ReportVisibility)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="org_shared">Org shared</SelectItem>
            <SelectItem value="executive_shared">Executive shared</SelectItem>
            <SelectItem value="admin_only">Admin only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
        Save report
      </Button>
    </form>
  );
}
