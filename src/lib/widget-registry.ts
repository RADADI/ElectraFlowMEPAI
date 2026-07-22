/**
 * Dashboard Widget Registry — Phase 14
 *
 * Central registry of all dashboard widgets. Components look up widgets by id.
 * Role gating is enforced here AND in the UI layer.
 *
 * Future modules (meetings, electrical, ai) register placeholder widgets now
 * so dashboard layout/preferences can reference them without schema changes.
 */

import type { AppRole } from "@/lib/permissions";

export type WidgetCategory =
  | "projects"
  | "documents"
  | "submittals"
  | "rfi"
  | "ncr"
  | "resources"
  | "timesheets"
  | "leave"
  | "financials"
  | "notifications"
  | "system"
  | "meetings"
  | "electrical"
  | "ai"
  | "client_portal"
  | "saas";

export interface WidgetDefinition {
  id: string;
  label: string;
  description: string;
  category: WidgetCategory;
  /** Roles that can see this widget. Admin always bypasses. */
  roles: AppRole[];
  /** If true, widget shows "Not configured yet" instead of fake data. */
  future?: boolean;
  /** Analytics hook key used by ExecutiveDashboardGrid */
  analyticsKey?: string;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // Projects
  {
    id: "projects.total",
    label: "Total Projects",
    description: "All active and archived projects",
    category: "projects",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "projects.total",
  },
  {
    id: "projects.active",
    label: "Active Projects",
    description: "Projects currently in progress",
    category: "projects",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "projects.active",
  },
  {
    id: "projects.delayed",
    label: "Delayed Projects",
    description: "Projects past due date",
    category: "projects",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "projects.delayed",
  },
  {
    id: "projects.high_risk",
    label: "High-Risk Projects",
    description: "Projects flagged high or critical risk",
    category: "projects",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "projects.high_risk",
  },
  // Documents
  {
    id: "documents.pending_review",
    label: "Pending Review",
    description: "Documents awaiting review",
    category: "documents",
    roles: ["Admin", "Executive", "Project Manager", "QA/QC Engineer"],
    analyticsKey: "documents.pending_review",
  },
  {
    id: "documents.approved_month",
    label: "Approved This Month",
    description: "Documents approved in current month",
    category: "documents",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "documents.approved_month",
  },
  // Submittals
  {
    id: "submittals.open",
    label: "Open Submittals",
    description: "Submittals not yet closed",
    category: "submittals",
    roles: ["Admin", "Executive", "Project Manager", "QA/QC Engineer"],
    analyticsKey: "submittals.open",
  },
  {
    id: "submittals.overdue",
    label: "Overdue Submittals",
    description: "Submittals past due date",
    category: "submittals",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "submittals.overdue",
  },
  // RFI
  {
    id: "rfi.open",
    label: "Open RFIs",
    description: "RFIs not yet closed",
    category: "rfi",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "rfi.open",
  },
  {
    id: "rfi.overdue",
    label: "Overdue RFIs",
    description: "RFIs past response due date",
    category: "rfi",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "rfi.overdue",
  },
  {
    id: "rfi.avg_response_days",
    label: "Avg Response Time",
    description: "Average days to first RFI response",
    category: "rfi",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "rfi.avg_response_days",
  },
  // NCR
  {
    id: "ncr.open",
    label: "Open NCRs",
    description: "Non-conformance reports open",
    category: "ncr",
    roles: ["Admin", "Executive", "Project Manager", "QA/QC Engineer"],
    analyticsKey: "ncr.open",
  },
  {
    id: "ncr.overdue_actions",
    label: "Overdue NCR Actions",
    description: "CAPA actions past due",
    category: "ncr",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "ncr.overdue_actions",
  },
  // Resources
  {
    id: "resources.utilization",
    label: "Utilization",
    description: "Average resource utilization %",
    category: "resources",
    roles: ["Admin", "Executive", "Project Manager", "HR"],
    analyticsKey: "resources.utilization",
  },
  {
    id: "resources.overbooked",
    label: "Overbooked",
    description: "Employees allocated over capacity",
    category: "resources",
    roles: ["Admin", "Executive", "Project Manager", "HR"],
    analyticsKey: "resources.overbooked",
  },
  // Timesheets
  {
    id: "timesheets.pending",
    label: "Pending Approval",
    description: "Timesheets awaiting approval",
    category: "timesheets",
    roles: ["Admin", "Executive", "Project Manager", "HR"],
    analyticsKey: "timesheets.pending",
  },
  {
    id: "timesheets.overtime",
    label: "Overtime Hours",
    description: "Overtime hours this week",
    category: "timesheets",
    roles: ["Admin", "Executive", "HR"],
    analyticsKey: "timesheets.overtime",
  },
  // Leave
  {
    id: "leave.pending",
    label: "Pending Leave",
    description: "Leave requests awaiting approval",
    category: "leave",
    roles: ["Admin", "Executive", "HR"],
    analyticsKey: "leave.pending",
  },
  // Financials
  {
    id: "financials.total_budget",
    label: "Total Budget",
    description: "Combined project budgets",
    category: "financials",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "financials.total_budget",
  },
  {
    id: "financials.actual_cost",
    label: "Actual Cost",
    description: "Combined actual spend",
    category: "financials",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "financials.actual_cost",
  },
  {
    id: "financials.outstanding_ar",
    label: "Outstanding AR",
    description: "Unpaid invoice balance",
    category: "financials",
    roles: ["Admin", "Executive"],
    analyticsKey: "financials.outstanding_ar",
  },
  {
    id: "financials.margin",
    label: "Margin %",
    description: "Average project margin",
    category: "financials",
    roles: ["Admin", "Executive"],
    analyticsKey: "financials.margin",
  },
  // Notifications
  {
    id: "notifications.critical",
    label: "Critical Alerts",
    description: "Unread critical notifications",
    category: "notifications",
    roles: ["Admin", "Executive"],
    analyticsKey: "notifications.critical",
  },
  // System
  {
    id: "system.health",
    label: "System Health",
    description: "Module counts and recent failures",
    category: "system",
    roles: ["Admin"],
    analyticsKey: "system.health",
  },
  // Future placeholders
  {
    id: "meetings.upcoming",
    label: "Upcoming Meetings",
    description: "Meetings scheduled this week",
    category: "meetings",
    roles: ["Admin", "Executive", "Project Manager", "Senior Electrical Engineer"],
    analyticsKey: "meetings.upcoming",
  },
  {
    id: "electrical.panel_schedules",
    label: "Panel Schedules",
    description: "Electrical panel schedule count",
    category: "electrical",
    roles: ["Admin", "Senior Electrical Engineer", "Project Manager", "Electrical Engineer"],
    analyticsKey: "electrical.panel_schedules",
  },
  {
    id: "ai.sessions",
    label: "AI Sessions",
    description: "Active AI copilot sessions",
    category: "ai",
    roles: ["Admin", "Executive", "Project Manager"],
    analyticsKey: "ai.sessions",
  },
  {
    id: "client_portal.views",
    label: "Client Portal Views",
    description: "Client document views this month",
    category: "client_portal",
    roles: ["Admin", "Executive"],
    future: false,
  },
  {
    id: "saas.seats",
    label: "Seat Usage",
    description: "Active seats vs plan limit",
    category: "saas",
    roles: ["Admin"],
    future: true,
  },
];

export function getWidget(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}

export function getWidgetsForRole(role: AppRole | null): WidgetDefinition[] {
  if (!role) return [];
  if (role === "Admin") return WIDGET_REGISTRY;
  return WIDGET_REGISTRY.filter((w) => w.roles.includes(role));
}

export function getDefaultLayout(role: AppRole | null): string[] {
  const widgets = getWidgetsForRole(role).filter((w) => !w.future);
  return widgets.map((w) => w.id);
}

export const REPORT_TYPES = [
  "projects",
  "documents",
  "submittals",
  "rfi",
  "ncr",
  "resources",
  "timesheets",
  "leave",
  "financials",
  "notifications",
  "activity",
  "audit",
  "meetings",
  "electrical",
  "ai",
  "client_portal",
  "saas_billing",
  "super_admin",
  "system_health",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_CATEGORIES = [
  "operational",
  "financial",
  "workforce",
  "compliance",
  "executive",
  "system",
  "future",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Map report_type → report_category for UI grouping */
export const REPORT_TYPE_CATEGORY: Record<ReportType, ReportCategory> = {
  projects: "operational",
  documents: "operational",
  submittals: "compliance",
  rfi: "compliance",
  ncr: "compliance",
  resources: "workforce",
  timesheets: "workforce",
  leave: "workforce",
  financials: "financial",
  notifications: "system",
  activity: "system",
  audit: "compliance",
  meetings: "operational",
  electrical: "operational",
  ai: "future",
  client_portal: "operational",
  saas_billing: "future",
  super_admin: "future",
  system_health: "system",
};

export function isFutureReportType(type: ReportType): boolean {
  return REPORT_TYPE_CATEGORY[type] === "future";
}
