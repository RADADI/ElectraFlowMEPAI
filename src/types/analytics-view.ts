/**
 * Phase 14: Analytics view types — UI-friendly shapes for dashboards and KPIs.
 */

export interface MetricValue {
  value: number | string;
  label: string;
  /** Optional trend hint, e.g. "+12% vs last month" */
  trend?: string;
  /** "success" | "warning" | "error" | "info" */
  intent?: "success" | "warning" | "error" | "info" | "neutral";
  /** If true, show "Not configured yet" instead of value */
  notConfigured?: boolean;
}

export interface ProjectAnalytics {
  total: number;
  active: number;
  delayed: number;
  high_risk: number;
  on_hold: number;
  completed: number;
  avg_progress: number;
}

export interface DocumentAnalytics {
  pending_review: number;
  rejected: number;
  approved_month: number;
  total: number;
}

export interface SubmittalAnalytics {
  open: number;
  overdue: number;
  awaiting_review: number;
  approved_month: number;
}

export interface RFIAnalytics {
  open: number;
  overdue: number;
  avg_response_days: number;
  closed_month: number;
}

export interface NCRAnalytics {
  open: number;
  overdue_actions: number;
  closed_month: number;
}

export interface ResourceAnalytics {
  utilization_pct: number;
  overbooked: number;
  underutilized: number;
  total_employees: number;
}

export interface TimesheetAnalytics {
  pending_approval: number;
  overtime_hours: number;
  rejected: number;
}

export interface LeaveAnalytics {
  pending: number;
  approved_month: number;
}

export interface FinancialAnalytics {
  total_budget: number;
  actual_cost: number;
  outstanding_ar: number;
  margin_pct: number;
  budget_health: "healthy" | "warning" | "critical" | "unknown";
  collected: number;
}

export interface NotificationAnalytics {
  critical_unread: number;
  high_priority: number;
}

export interface SystemHealthMetrics {
  module_counts: Record<string, number>;
  recent_report_failures: number;
  last_audit_at: string | null;
  missing_config: string[];
  /** Placeholder metrics labelled "Not configured yet" */
  placeholders: { label: string; reason: string }[];
}

/** Flat KPI map keyed by widget analyticsKey */
export type ExecutiveKpiMap = Record<string, MetricValue>;

export interface ExecutiveSummary {
  projects: ProjectAnalytics;
  documents: DocumentAnalytics;
  submittals: SubmittalAnalytics;
  rfi: RFIAnalytics;
  ncr: NCRAnalytics;
  resources: ResourceAnalytics;
  timesheets: TimesheetAnalytics;
  leave: LeaveAnalytics;
  financials: FinancialAnalytics;
  notifications: NotificationAnalytics;
  system: SystemHealthMetrics;
  /** Flat map for widget registry lookup */
  kpis: ExecutiveKpiMap;
  /** True when served from analytics_snapshots cache */
  from_snapshot?: boolean;
  snapshot_at?: string;
}

/** Snapshot cache TTL in milliseconds (15 minutes) */
export const SNAPSHOT_CACHE_TTL_MS = 15 * 60 * 1000;
