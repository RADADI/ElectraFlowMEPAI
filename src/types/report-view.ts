/**
 * Phase 14: Report view types — UI-friendly shapes for reports and runs.
 */

import type {
  SavedReport,
  ReportRun,
  ReportType,
  ReportCategory,
  ReportFormat,
  ReportRunStatus,
  ReportVisibility,
  DashboardPreference,
} from "./database";

export interface SavedReportView extends SavedReport {
  owner_name: string;
  last_run_at: string | null;
  last_run_status: ReportRunStatus | null;
  is_future_type: boolean;
}

export interface ReportRunView extends ReportRun {
  report_name: string | null;
  requester_name: string;
  duration_ms: number | null;
}

export interface ReportPreviewResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total_count: number;
  truncated: boolean;
}

export interface CreateReportInput {
  name: string;
  description?: string;
  report_type: ReportType;
  report_category?: ReportCategory;
  entity_type?: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  sort?: Record<string, unknown>;
  visibility?: ReportVisibility;
}

export interface RunReportInput {
  saved_report_id?: string;
  report_type: ReportType;
  format: ReportFormat;
  filters?: Record<string, unknown>;
  columns?: string[];
}

export interface DashboardPreferenceView extends DashboardPreference {
  visible_widgets: string[];
}

export type { ReportType, ReportCategory, ReportFormat, ReportRunStatus, ReportVisibility };

/** Default columns per report type */
export const DEFAULT_REPORT_COLUMNS: Partial<Record<ReportType, string[]>> = {
  projects: ["name", "status", "progress", "due_date", "risk_level", "client"],
  documents: ["title", "status", "revision", "created_at", "project"],
  submittals: ["submittal_number", "title", "status", "due_date", "project"],
  rfi: ["rfi_number", "title", "status", "due_date", "assigned_to"],
  ncr: ["ncr_number", "title", "status", "severity", "due_date"],
  resources: ["name", "role", "department", "utilization_pct", "status"],
  timesheets: ["employee", "week_ending", "total_hours", "status"],
  leave: ["employee", "type", "start_date", "end_date", "status"],
  financials: ["project", "budget", "actual", "variance", "outstanding_ar"],
  notifications: ["title", "category", "severity", "priority", "created_at"],
  activity: ["message", "category", "entity_label", "created_at"],
  audit: ["action", "resource_type", "resource_id", "user_id", "created_at"],
};
