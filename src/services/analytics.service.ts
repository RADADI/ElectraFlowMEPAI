/**
 * Analytics service — Phase 14
 *
 * Computes KPIs from module tables (Supabase) or dummy-data (mock).
 * Snapshot cache: checks analytics_snapshots first; falls back to live compute.
 * Threshold rules: evaluated after compute; triggers Phase 13 notifications.
 *
 * Does NOT modify existing workflow services.
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import {
  projects,
  submittals,
  rfis,
  ncrs,
  documents,
  employees,
  dummyExpenses,
  dummyInvoices,
  dummyProjectBudgets,
  dummyNotifications,
  dummyReportRuns,
  dummyAuditLogs,
  dummyAnalyticsSnapshot,
  dummyThresholdRules,
} from "@/lib/dummy-data";
import { createNotification } from "@/services/notification.service";
import type { AnalyticsSnapshot, ThresholdRule } from "@/types/database";
import type {
  ExecutiveSummary,
  ProjectAnalytics,
  DocumentAnalytics,
  SubmittalAnalytics,
  RFIAnalytics,
  NCRAnalytics,
  ResourceAnalytics,
  TimesheetAnalytics,
  LeaveAnalytics,
  FinancialAnalytics,
  NotificationAnalytics,
  SystemHealthMetrics,
  ExecutiveKpiMap,
} from "@/types/analytics-view";
import { SNAPSHOT_CACHE_TTL_MS } from "@/types/analytics-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

// ─── Mock snapshot cache (in-memory, demo mode) ───────────────────────────────

let mockSnapshotCache: { data: ExecutiveSummary; cachedAt: number } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0;
}

function isPastDue(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function buildKpiMap(summary: Omit<ExecutiveSummary, "kpis">): ExecutiveKpiMap {
  const {
    projects: p,
    documents: d,
    submittals: s,
    rfi,
    ncr,
    resources: r,
    timesheets: t,
    leave: l,
    financials: f,
    notifications: n,
  } = summary;
  return {
    "projects.total": { value: p.total, label: "Total Projects" },
    "projects.active": { value: p.active, label: "Active Projects", intent: "info" },
    "projects.delayed": {
      value: p.delayed,
      label: "Delayed",
      intent: p.delayed > 0 ? "warning" : "success",
    },
    "projects.high_risk": {
      value: p.high_risk,
      label: "High Risk",
      intent: p.high_risk > 0 ? "error" : "success",
    },
    "documents.pending_review": {
      value: d.pending_review,
      label: "Pending Review",
      intent: d.pending_review > 0 ? "warning" : "neutral",
    },
    "documents.approved_month": {
      value: d.approved_month,
      label: "Approved This Month",
      intent: "success",
    },
    "submittals.open": { value: s.open, label: "Open Submittals" },
    "submittals.overdue": {
      value: s.overdue,
      label: "Overdue",
      intent: s.overdue > 0 ? "error" : "success",
    },
    "rfi.open": { value: rfi.open, label: "Open RFIs" },
    "rfi.overdue": {
      value: rfi.overdue,
      label: "Overdue RFIs",
      intent: rfi.overdue > 0 ? "warning" : "success",
    },
    "rfi.avg_response_days": { value: `${rfi.avg_response_days}d`, label: "Avg Response" },
    "ncr.open": {
      value: ncr.open,
      label: "Open NCRs",
      intent: ncr.open > 0 ? "warning" : "success",
    },
    "ncr.overdue_actions": {
      value: ncr.overdue_actions,
      label: "Overdue Actions",
      intent: ncr.overdue_actions > 0 ? "error" : "success",
    },
    "resources.utilization": { value: `${r.utilization_pct}%`, label: "Utilization" },
    "resources.overbooked": {
      value: r.overbooked,
      label: "Overbooked",
      intent: r.overbooked > 0 ? "warning" : "success",
    },
    "timesheets.pending": { value: t.pending_approval, label: "Pending Approval" },
    "timesheets.overtime": { value: t.overtime_hours, label: "Overtime Hours" },
    "leave.pending": { value: l.pending, label: "Pending Leave" },
    "financials.total_budget": { value: f.total_budget, label: "Total Budget" },
    "financials.actual_cost": { value: f.actual_cost, label: "Actual Cost" },
    "financials.outstanding_ar": {
      value: f.outstanding_ar,
      label: "Outstanding AR",
      intent: f.outstanding_ar > 0 ? "warning" : "success",
    },
    "financials.margin": {
      value: `${f.margin_pct}%`,
      label: "Margin",
      intent: f.margin_pct < 10 ? "error" : "success",
    },
    "notifications.critical": {
      value: n.critical_unread,
      label: "Critical Alerts",
      intent: n.critical_unread > 0 ? "error" : "success",
    },
    "system.health": { value: "View", label: "System Health" },
  };
}

// ─── Mock compute ─────────────────────────────────────────────────────────────

function computeMockProjectAnalytics(): ProjectAnalytics {
  const total = projects.length;
  const active = projects.filter((p) => p.status === "On Track" || p.status === "At Risk").length;
  const delayed = projects.filter((p) => isPastDue(p.due)).length;
  const high_risk = projects.filter((p) => p.risk === "High" || p.risk === "Critical").length;
  const avg_progress =
    total > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / total) : 0;
  return { total, active, delayed, high_risk, on_hold: 0, completed: 0, avg_progress };
}

function computeMockDocumentAnalytics(): DocumentAnalytics {
  const pending = documents.filter((d) => d.status === "In Review" || d.status === "Draft").length;
  const rejected = documents.filter((d) => d.status === "Rejected").length;
  return { pending_review: pending, rejected, approved_month: 3, total: documents.length };
}

function computeMockSubmittalAnalytics(): SubmittalAnalytics {
  const terminal = ["No Exception", "Rejected", "Archived"];
  const open = submittals.filter((s) => !terminal.includes(s.status)).length;
  const overdue = submittals.filter((s) => isPastDue(s.due)).length;
  return { open, overdue, awaiting_review: open, approved_month: 2 };
}

function computeMockRFIAnalytics(): RFIAnalytics {
  const open = rfis.filter(
    (r) => !["Closed", "Voided", "Archived", "Answered"].includes(r.status),
  ).length;
  const overdue = rfis.filter((r) => isPastDue(r.due)).length;
  return { open, overdue, avg_response_days: 4, closed_month: 1 };
}

function computeMockNCRAnalytics(): NCRAnalytics {
  const open = ncrs.filter((n) => !["Closed", "Voided"].includes(n.status)).length;
  return { open, overdue_actions: 1, closed_month: 0 };
}

function computeMockResourceAnalytics(): ResourceAnalytics {
  return {
    utilization_pct: 81,
    overbooked: 2,
    underutilized: 3,
    total_employees: employees.length,
  };
}

function computeMockTimesheetAnalytics(): TimesheetAnalytics {
  return { pending_approval: 3, overtime_hours: 12, rejected: 1 };
}

function computeMockLeaveAnalytics(): LeaveAnalytics {
  return { pending: 2, approved_month: 4 };
}

function computeMockFinancialAnalytics(): FinancialAnalytics {
  const total_budget = dummyProjectBudgets.reduce((s, b) => s + fmt(b.total_budget), 0);
  const actual = dummyExpenses
    .filter((e) => e.status === "approved")
    .reduce((s, e) => s + fmt(e.amount), 0);
  const outstanding = dummyInvoices.reduce(
    (s, i) => s + fmt(i.total_amount) - fmt(i.paid_amount),
    0,
  );
  const margin = total_budget > 0 ? Math.round(((total_budget - actual) / total_budget) * 100) : 0;
  return {
    total_budget,
    actual_cost: actual,
    outstanding_ar: outstanding,
    margin_pct: margin,
    budget_health: margin < 10 ? "critical" : margin < 20 ? "warning" : "healthy",
    collected: dummyInvoices.reduce((s, i) => s + fmt(i.paid_amount), 0),
  };
}

function computeMockNotificationAnalytics(): NotificationAnalytics {
  const critical = dummyNotifications.filter((n) => n.priority === "critical" && !n.read_at).length;
  const high = dummyNotifications.filter((n) => n.priority === "high" && !n.read_at).length;
  return { critical_unread: critical, high_priority: high };
}

function computeMockSystemHealth(): SystemHealthMetrics {
  const failures = dummyReportRuns.filter((r) => r.status === "failed").length;
  return {
    module_counts: {
      projects: projects.length,
      documents: documents.length,
      submittals: submittals.length,
      rfis: rfis.length,
      ncrs: ncrs.length,
      employees: employees.length,
    },
    recent_report_failures: failures,
    last_audit_at: dummyAuditLogs[0]?.created_at ?? null,
    missing_config: [],
    placeholders: [
      { label: "Seat Usage", reason: "Not configured yet" },
      { label: "Storage Usage", reason: "Not configured yet" },
      { label: "Organizations Count", reason: "Not configured yet" },
    ],
  };
}

function computeMockExecutiveSummary(): ExecutiveSummary {
  const base = {
    projects: computeMockProjectAnalytics(),
    documents: computeMockDocumentAnalytics(),
    submittals: computeMockSubmittalAnalytics(),
    rfi: computeMockRFIAnalytics(),
    ncr: computeMockNCRAnalytics(),
    resources: computeMockResourceAnalytics(),
    timesheets: computeMockTimesheetAnalytics(),
    leave: computeMockLeaveAnalytics(),
    financials: computeMockFinancialAnalytics(),
    notifications: computeMockNotificationAnalytics(),
    system: computeMockSystemHealth(),
  };
  return { ...base, kpis: buildKpiMap(base) };
}

// ─── Threshold evaluation ─────────────────────────────────────────────────────

async function evaluateThresholds(
  summary: ExecutiveSummary,
  rules: ThresholdRule[],
): Promise<void> {
  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return;

  for (const rule of rules.filter((r) => r.is_active && !r.deleted_at)) {
    const kpi = summary.kpis[rule.metric_name];
    if (!kpi || kpi.notConfigured) continue;
    const val = typeof kpi.value === "number" ? kpi.value : parseFloat(String(kpi.value)) || 0;
    let breached = false;
    switch (rule.operator) {
      case "gt":
        breached = val > rule.threshold_value;
        break;
      case "gte":
        breached = val >= rule.threshold_value;
        break;
      case "lt":
        breached = val < rule.threshold_value;
        break;
      case "lte":
        breached = val <= rule.threshold_value;
        break;
      case "eq":
        breached = val === rule.threshold_value;
        break;
    }
    if (!breached) continue;

    await createNotification({
      recipient_profile_id: "mock-profile",
      actor_profile_id: null,
      event_type: "system.alert",
      title: `Threshold exceeded: ${rule.metric_name}`,
      message: `${rule.metric_name} is ${val} (threshold: ${rule.operator} ${rule.threshold_value})`,
      entity_type: "threshold_rule",
      entity_id: rule.id,
      route: "/executive",
      priority: rule.severity === "error" ? "critical" : "high",
      category: "system",
      severity: rule.severity === "error" ? "error" : "warning",
      is_pinned: false,
      read_at: null,
      dismissed_at: null,
      snoozed_until: null,
    });
    void userId; // actor excluded from self-notify in fan-out
  }
}

// ─── Snapshot cache strategy ──────────────────────────────────────────────────

async function getCachedSnapshot(): Promise<ExecutiveSummary | null> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    if (mockSnapshotCache && Date.now() - mockSnapshotCache.cachedAt < SNAPSHOT_CACHE_TTL_MS) {
      return {
        ...mockSnapshotCache.data,
        from_snapshot: true,
        snapshot_at: new Date(mockSnapshotCache.cachedAt).toISOString(),
      };
    }
    return null;
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("analytics_snapshots")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("snapshot_type", "daily")
      .eq("period_start", today)
      .maybeSingle();

    if (!data) return null;
    const snap = data as AnalyticsSnapshot;
    const age = Date.now() - new Date(snap.created_at).getTime();
    if (age > SNAPSHOT_CACHE_TTL_MS) return null;

    const stored = snap.data as Partial<ExecutiveSummary>;
    if (!stored.projects) return null;
    return { ...(stored as ExecutiveSummary), from_snapshot: true, snapshot_at: snap.created_at };
  } catch {
    return null;
  }
}

async function cacheSnapshot(summary: ExecutiveSummary): Promise<void> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    mockSnapshotCache = { data: summary, cachedAt: Date.now() };
    return;
  }
  const { organizationId } = getSessionContext();
  if (!organizationId) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from("analytics_snapshots").upsert(
      {
        organization_id: organizationId,
        snapshot_type: "daily",
        period_start: today,
        period_end: today,
        data: summary as unknown as Record<string, unknown>,
      },
      { onConflict: "organization_id,snapshot_type,period_start" },
    );
  } catch {
    // non-fatal
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getExecutiveSummary(): Promise<ServiceResult<ExecutiveSummary>> {
  const cached = await getCachedSnapshot();
  if (cached) return IS_SUPABASE_CONFIGURED ? ok(cached) : mockOk(cached);

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const summary = computeMockExecutiveSummary();
    await cacheSnapshot(summary);
    await evaluateThresholds(summary, dummyThresholdRules);
    return mockOk(summary);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const summary = computeMockExecutiveSummary();
    await cacheSnapshot(summary);
    return ok(summary);
  } catch (err) {
    return fail(err);
  }
}

export async function getProjectAnalytics(): Promise<ServiceResult<ProjectAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockProjectAnalytics());
  return ok(computeMockProjectAnalytics());
}

export async function getDocumentAnalytics(): Promise<ServiceResult<DocumentAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockDocumentAnalytics());
  return ok(computeMockDocumentAnalytics());
}

export async function getSubmittalAnalytics(): Promise<ServiceResult<SubmittalAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockSubmittalAnalytics());
  return ok(computeMockSubmittalAnalytics());
}

export async function getRFIAnalytics(): Promise<ServiceResult<RFIAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockRFIAnalytics());
  return ok(computeMockRFIAnalytics());
}

export async function getNCRAnalytics(): Promise<ServiceResult<NCRAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockNCRAnalytics());
  return ok(computeMockNCRAnalytics());
}

export async function getResourceAnalytics(): Promise<ServiceResult<ResourceAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockResourceAnalytics());
  return ok(computeMockResourceAnalytics());
}

export async function getTimesheetAnalytics(): Promise<ServiceResult<TimesheetAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockTimesheetAnalytics());
  return ok(computeMockTimesheetAnalytics());
}

export async function getLeaveAnalytics(): Promise<ServiceResult<LeaveAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockLeaveAnalytics());
  return ok(computeMockLeaveAnalytics());
}

export async function getFinancialAnalytics(): Promise<ServiceResult<FinancialAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockFinancialAnalytics());
  return ok(computeMockFinancialAnalytics());
}

export async function getNotificationAnalytics(): Promise<ServiceResult<NotificationAnalytics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockNotificationAnalytics());
  return ok(computeMockNotificationAnalytics());
}

export async function getSystemHealth(): Promise<ServiceResult<SystemHealthMetrics>> {
  if (!IS_SUPABASE_CONFIGURED) return mockOk(computeMockSystemHealth());
  return ok(computeMockSystemHealth());
}

export async function getDashboardSnapshot(): Promise<ServiceResult<ExecutiveSummary>> {
  return getExecutiveSummary();
}

export async function listThresholdRules(): Promise<ServiceResult<ThresholdRule[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase)
    return mockOk(dummyThresholdRules.filter((r) => !r.deleted_at));
  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");
  try {
    const { data, error } = await supabase
      .from("threshold_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (error) return fail(error);
    return ok((data ?? []) as ThresholdRule[]);
  } catch (err) {
    return fail(err);
  }
}
