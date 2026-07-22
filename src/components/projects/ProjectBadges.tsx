/**
 * ProjectBadges — Status, Priority, and Risk badges for project pages.
 *
 * Reused in both the project list and the project detail header.
 * Maps database enum values to human-readable labels and Tailwind classes.
 * Replaces the old dummy-data statusColor / riskColor string-key pattern.
 */

import { Badge } from "@/components/ui/badge";
import type { ProjectView } from "@/types/project-view";

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectView["status"], string> = {
  planning: "Planning",
  active: "On Track",
  on_hold: "Delayed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<ProjectView["status"], string> = {
  planning: "bg-info/15 text-info border-info/30",
  active: "bg-success/15 text-success border-success/30",
  on_hold: "bg-warning/15 text-warning border-warning/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function ProjectStatusBadge({ status }: { status: ProjectView["status"] }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ─── Priority ─────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<ProjectView["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const PRIORITY_CLASS: Record<ProjectView["priority"], string> = {
  low: "bg-success/15 text-success border-success/30",
  medium: "bg-info/15 text-info border-info/30",
  high: "bg-warning/15 text-warning border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export function ProjectPriorityBadge({ priority }: { priority: ProjectView["priority"] }) {
  return (
    <Badge variant="outline" className={PRIORITY_CLASS[priority]}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

const RISK_LABEL: Record<ProjectView["risk_level"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const RISK_CLASS: Record<ProjectView["risk_level"], string> = {
  low: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export function ProjectRiskBadge({ risk }: { risk: ProjectView["risk_level"] }) {
  return (
    <Badge variant="outline" className={RISK_CLASS[risk]}>
      Risk: {RISK_LABEL[risk]}
    </Badge>
  );
}

// ─── Exports for convenience ──────────────────────────────────────────────────

export { STATUS_LABEL, PRIORITY_LABEL, RISK_LABEL };
