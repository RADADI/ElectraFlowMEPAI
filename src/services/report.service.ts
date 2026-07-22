/**
 * Report service — Phase 14
 *
 * Saved reports CRUD, report runs, CSV export (client-side data fetch).
 * XLSX/PDF honestly fail with status=failed.
 * Integrates Phase 13 notifications + activity for report events only.
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
  dummyNotifications,
  dummyActivityEvents,
  dummyAuditLogs,
  dummySavedReports,
  dummyReportRuns,
} from "@/lib/dummy-data";
import { createNotification } from "@/services/notification.service";
import { createActivityEvent } from "@/services/activity.service";
import { REPORT_TYPE_CATEGORY, isFutureReportType } from "@/lib/widget-registry";
import type {
  SavedReport,
  SavedReportInsert,
  SavedReportUpdate,
  ReportRun,
  ReportRunInsert,
  ReportRunUpdate,
  ReportType,
  ReportFormat,
} from "@/types/database";
import type {
  SavedReportView,
  ReportRunView,
  ReportPreviewResult,
  CreateReportInput,
  RunReportInput,
} from "@/types/report-view";
import { DEFAULT_REPORT_COLUMNS } from "@/types/report-view";
import { encodeCursor, decodeCursor, type CursorPage } from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

const PAGE_SIZE = 20;
const PREVIEW_LIMIT = 20;

const MOCK_REPORTS: SavedReport[] = [...dummySavedReports];
const MOCK_RUNS: ReportRun[] = [...dummyReportRuns];
/** In-memory CSV data keyed by report_run id (mock mode only) */
const MOCK_CSV_DATA = new Map<string, Record<string, unknown>[]>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getProfileId(): Promise<string | null> {
  if (!supabase) return "mock-profile";
  const { userId } = getSessionContext();
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

function toReportView(r: SavedReport): SavedReportView {
  const runs = MOCK_RUNS.filter((run) => run.saved_report_id === r.id);
  const last = runs.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  return {
    ...r,
    owner_name: "Current User",
    last_run_at: last?.created_at ?? null,
    last_run_status: last?.status ?? null,
    is_future_type: isFutureReportType(r.report_type),
  };
}

function toRunView(r: ReportRun): ReportRunView {
  const report = MOCK_REPORTS.find((rep) => rep.id === r.saved_report_id);
  const duration =
    r.started_at && r.completed_at
      ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
      : null;
  return {
    ...r,
    report_name: report?.name ?? null,
    requester_name: "Current User",
    duration_ms: duration,
  };
}

function fetchReportRows(type: ReportType, columns: string[]): Record<string, unknown>[] {
  switch (type) {
    case "projects":
      return projects.map((p) => ({
        name: p.name,
        status: p.status,
        progress: p.progress,
        due_date: p.due,
        risk_level: p.risk,
        client: p.client,
      }));
    case "documents":
      return documents.map((d) => ({
        title: d.name,
        status: d.status,
        revision: d.version,
        created_at: d.date,
        project: d.project,
      }));
    case "submittals":
      return submittals.map((s) => ({
        submittal_number: s.section,
        title: s.product,
        status: s.status,
        due_date: s.due,
        project: s.mark,
      }));
    case "rfi":
      return rfis.map((r) => ({
        rfi_number: r.number,
        title: r.subject,
        status: r.status,
        due_date: r.due,
        assigned_to: r.assignedTo,
      }));
    case "ncr":
      return ncrs.map((n) => ({
        ncr_number: n.number,
        title: n.root,
        status: n.status,
        severity: n.type,
        due_date: n.due,
      }));
    case "resources":
      return employees.map((e) => ({
        name: e.name,
        role: e.role,
        department: e.current,
        utilization_pct: e.util,
        status: e.status,
      }));
    case "financials":
      return dummyInvoices.map((i) => ({
        project: i.project_name,
        budget: i.total_amount,
        actual: i.paid_amount,
        variance: i.total_amount - i.paid_amount,
        outstanding_ar: i.total_amount - i.paid_amount,
      }));
    case "notifications":
      return dummyNotifications.map((n) => ({
        title: n.title,
        category: n.category,
        severity: n.severity,
        priority: n.priority,
        created_at: n.created_at,
      }));
    case "activity":
      return dummyActivityEvents.map((a) => ({
        message: a.message,
        category: a.category,
        entity_label: a.entity_label,
        created_at: a.created_at,
      }));
    case "audit":
      return dummyAuditLogs.map((a) => ({
        action: a.action,
        resource_type: a.resource_type,
        resource_id: a.resource_id,
        user_id: a.user_id,
        created_at: a.created_at,
      }));
    default:
      return columns.length > 0 ? [{ note: "Report type not yet configured" }] : [];
  }
}

async function notifyReportEvent(
  eventType: string,
  title: string,
  message: string,
  runId: string,
  severity: "info" | "success" | "warning" | "error" = "info",
): Promise<void> {
  const profileId = await getProfileId();
  if (!profileId) return;

  await createNotification({
    recipient_profile_id: profileId,
    actor_profile_id: null,
    event_type: eventType,
    title,
    message,
    entity_type: "report_run",
    entity_id: runId,
    route: "/reports",
    priority: severity === "error" ? "high" : "normal",
    category: "report",
    severity,
    is_pinned: false,
    read_at: null,
    dismissed_at: null,
    snoozed_until: null,
  });

  await createActivityEvent({
    event_type: eventType,
    entity_type: "report_run",
    entity_id: runId,
    entity_label: title,
    message,
    category: "report",
    visibility: "internal",
    actor_profile_id: profileId,
  });
}

// ─── Saved Reports CRUD ───────────────────────────────────────────────────────

export async function listSavedReports(opts?: {
  cursor?: string;
  limit?: number;
}): Promise<ServiceResult<CursorPage<SavedReportView>>> {
  const limit = opts?.limit ?? PAGE_SIZE;

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = MOCK_REPORTS.filter((r) => !r.deleted_at).map(toReportView);
    if (opts?.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        const idx = items.findIndex((r) => r.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }
    const page = items.slice(0, limit);
    const next_cursor =
      page.length === limit && items.length > limit
        ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
        : null;
    return mockOk({ items: page, next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = supabase
      .from("saved_reports")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (opts?.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        q = q.or(
          `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);
    const rows = (data ?? []) as SavedReport[];
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
      ...toReportView(r),
      is_future_type: isFutureReportType(r.report_type),
    }));
    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
        : null;
    return ok({ items: page, next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function getSavedReport(id: string): Promise<ServiceResult<SavedReportView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const r = MOCK_REPORTS.find((rep) => rep.id === id && !rep.deleted_at);
    if (!r) return fail("Report not found.");
    return mockOk(toReportView(r));
  }

  try {
    const { data, error } = await supabase
      .from("saved_reports")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return fail("Report not found or access denied.");
    return ok({
      ...toReportView(data as SavedReport),
      is_future_type: isFutureReportType((data as SavedReport).report_type),
    });
  } catch (err) {
    return fail(err);
  }
}

export async function createSavedReport(
  input: CreateReportInput,
): Promise<ServiceResult<SavedReport>> {
  const { organizationId } = getSessionContext();
  const profileId = await getProfileId();
  if (!profileId) return fail("No active session.");

  const category = input.report_category ?? REPORT_TYPE_CATEGORY[input.report_type];

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const entry: SavedReport = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      profile_id: profileId,
      name: input.name,
      description: input.description ?? null,
      report_type: input.report_type,
      report_category: category,
      entity_type: input.entity_type ?? null,
      filters: input.filters ?? {},
      columns: input.columns ?? DEFAULT_REPORT_COLUMNS[input.report_type] ?? [],
      sort: input.sort ?? {},
      schedule: null,
      visibility: input.visibility ?? "private",
      version_number: 1,
      parent_report_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    MOCK_REPORTS.unshift(entry);
    return mockOk(entry);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const row: SavedReportInsert = {
      organization_id: organizationId,
      profile_id: profileId,
      name: input.name,
      description: input.description ?? null,
      report_type: input.report_type,
      report_category: category,
      entity_type: input.entity_type ?? null,
      filters: input.filters ?? {},
      columns: input.columns ?? DEFAULT_REPORT_COLUMNS[input.report_type] ?? [],
      sort: input.sort ?? {},
      schedule: null,
      visibility: input.visibility ?? "private",
      parent_report_id: null,
    };
    const { data, error } = await supabase.from("saved_reports").insert(row).select().single();
    if (error) return fail(error);
    return ok(data as SavedReport);
  } catch (err) {
    return fail(err);
  }
}

export async function updateSavedReport(
  id: string,
  updates: SavedReportUpdate,
): Promise<ServiceResult<SavedReport>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_REPORTS.findIndex((r) => r.id === id && !r.deleted_at);
    if (idx === -1) return fail("Report not found.");
    MOCK_REPORTS[idx] = {
      ...MOCK_REPORTS[idx],
      ...updates,
      version_number: MOCK_REPORTS[idx].version_number + 1,
      updated_at: new Date().toISOString(),
    };
    return mockOk(MOCK_REPORTS[idx]);
  }

  try {
    const { data, error } = await supabase
      .from("saved_reports")
      .update({ ...updates, version_number: undefined })
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return ok(data as SavedReport);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSavedReport(id: string): Promise<ServiceResult<void>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_REPORTS.findIndex((r) => r.id === id);
    if (idx === -1) return fail("Report not found.");
    MOCK_REPORTS[idx] = { ...MOCK_REPORTS[idx], deleted_at: new Date().toISOString() };
    return mockOk(undefined);
  }

  try {
    const { error } = await supabase
      .from("saved_reports")
      .update({ deleted_at: new Date().toISOString() } satisfies SavedReportUpdate)
      .eq("id", id);
    if (error) return fail(error);
    return ok(undefined);
  } catch (err) {
    return fail(err);
  }
}

// ─── Report Runs ────────────────────────────────────────────────────────────────

export async function runReport(input: RunReportInput): Promise<ServiceResult<ReportRun>> {
  const { organizationId } = getSessionContext();
  const profileId = await getProfileId();
  if (!profileId) return fail("No active session.");

  const now = new Date().toISOString();

  if (isFutureReportType(input.report_type)) {
    const failedRun: ReportRun = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      saved_report_id: input.saved_report_id ?? null,
      requested_by: profileId,
      report_type: input.report_type,
      format: input.format,
      status: "failed",
      file_path: null,
      row_count: 0,
      started_at: now,
      completed_at: now,
      error_message: "This report type is not yet configured.",
      created_at: now,
    };
    if (!IS_SUPABASE_CONFIGURED) MOCK_RUNS.unshift(failedRun);
    await notifyReportEvent(
      "export.failed",
      "Report failed",
      failedRun.error_message!,
      failedRun.id,
      "error",
    );
    return IS_SUPABASE_CONFIGURED ? ok(failedRun) : mockOk(failedRun);
  }

  const baseRun: ReportRunInsert = {
    organization_id: organizationId ?? "mock-org",
    saved_report_id: input.saved_report_id ?? null,
    requested_by: profileId,
    report_type: input.report_type,
    format: input.format,
    status: "queued",
    file_path: null,
    row_count: 0,
    started_at: now,
    completed_at: null,
    error_message: null,
  };

  // XLSX / PDF — honest failure
  if (input.format === "xlsx" || input.format === "pdf") {
    const msg = `${input.format.toUpperCase()} export not yet configured — contact your administrator.`;
    const failedRun: ReportRun = {
      ...baseRun,
      id: crypto.randomUUID(),
      status: "failed",
      completed_at: now,
      error_message: msg,
      created_at: now,
    };
    if (!IS_SUPABASE_CONFIGURED) MOCK_RUNS.unshift(failedRun);
    await notifyReportEvent("export.failed", "Export failed", msg, failedRun.id, "error");
    return IS_SUPABASE_CONFIGURED ? ok(failedRun) : mockOk(failedRun);
  }

  // CSV — fetch data client-side
  const columns = input.columns ?? DEFAULT_REPORT_COLUMNS[input.report_type] ?? [];
  const rows = fetchReportRows(input.report_type, columns);
  const completedRun: ReportRun = {
    ...baseRun,
    id: crypto.randomUUID(),
    status: "completed",
    row_count: rows.length,
    completed_at: new Date().toISOString(),
    created_at: now,
  };

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    MOCK_RUNS.unshift(completedRun);
    MOCK_CSV_DATA.set(completedRun.id, rows);
  } else {
    try {
      const { data, error } = await supabase
        .from("report_runs")
        .insert(completedRun)
        .select()
        .single();
      if (error) return fail(error);
      MOCK_CSV_DATA.set((data as ReportRun).id, rows);
      await notifyReportEvent(
        "export.completed",
        "Report ready",
        `CSV export completed (${rows.length} rows).`,
        (data as ReportRun).id,
        "success",
      );
      await notifyReportEvent(
        "report.generated",
        "Report generated",
        `Report ${input.report_type} generated successfully.`,
        (data as ReportRun).id,
        "info",
      );
      return ok(data as ReportRun);
    } catch (err) {
      return fail(err);
    }
  }

  await notifyReportEvent(
    "export.completed",
    "Report ready",
    `CSV export completed (${rows.length} rows).`,
    completedRun.id,
    "success",
  );
  await notifyReportEvent(
    "report.generated",
    "Report generated",
    `Report ${input.report_type} generated successfully.`,
    completedRun.id,
    "info",
  );
  return mockOk(completedRun);
}

export async function getReportRunCsvData(
  runId: string,
): Promise<ServiceResult<Record<string, unknown>[]>> {
  const data = MOCK_CSV_DATA.get(runId);
  if (data) return IS_SUPABASE_CONFIGURED ? ok(data) : mockOk(data);
  return fail("No CSV data available for this run.");
}

export async function listReportRuns(opts?: {
  saved_report_id?: string;
  cursor?: string;
  limit?: number;
}): Promise<ServiceResult<CursorPage<ReportRunView>>> {
  const limit = opts?.limit ?? PAGE_SIZE;

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = MOCK_RUNS.map(toRunView);
    if (opts?.saved_report_id) {
      items = items.filter((r) => r.saved_report_id === opts.saved_report_id);
    }
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const page = items.slice(0, limit);
    return mockOk({
      items: page,
      next_cursor:
        items.length > limit
          ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
          : null,
    });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = supabase
      .from("report_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (opts?.saved_report_id) q = q.eq("saved_report_id", opts.saved_report_id);
    const { data, error } = await q;
    if (error) return fail(error);
    const rows = (data ?? []) as ReportRun[];
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).map(toRunView);
    return ok({
      items: page,
      next_cursor:
        hasMore && page.length
          ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
          : null,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function getReportRun(id: string): Promise<ServiceResult<ReportRunView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const r = MOCK_RUNS.find((run) => run.id === id);
    if (!r) return fail("Report run not found.");
    return mockOk(toRunView(r));
  }

  try {
    const { data, error } = await supabase.from("report_runs").select("*").eq("id", id).single();
    if (error || !data) return fail("Report run not found.");
    return ok(toRunView(data as ReportRun));
  } catch (err) {
    return fail(err);
  }
}

export async function getReportPreview(
  reportType: ReportType,
  columns?: string[],
  limit = PREVIEW_LIMIT,
): Promise<ServiceResult<ReportPreviewResult>> {
  if (isFutureReportType(reportType)) {
    return ok({ columns: [], rows: [], total_count: 0, truncated: false });
  }
  const cols = columns ?? DEFAULT_REPORT_COLUMNS[reportType] ?? [];
  const allRows = fetchReportRows(reportType, cols);
  const rows = allRows.slice(0, limit);
  return IS_SUPABASE_CONFIGURED
    ? ok({ columns: cols, rows, total_count: allRows.length, truncated: allRows.length > limit })
    : mockOk({
        columns: cols,
        rows,
        total_count: allRows.length,
        truncated: allRows.length > limit,
      });
}

export async function exportReportCsv(
  runId: string,
): Promise<ServiceResult<{ rows: Record<string, unknown>[]; columns: string[] }>> {
  const runResult = await getReportRun(runId);
  if (runResult.error || !runResult.data) return fail(runResult.error ?? "Run not found.");
  if (runResult.data.status !== "completed") return fail("Report run is not completed.");
  if (runResult.data.format !== "csv") return fail("Only CSV exports can be downloaded.");

  const dataResult = await getReportRunCsvData(runId);
  if (dataResult.error || !dataResult.data) return fail(dataResult.error ?? "No data.");
  const columns =
    DEFAULT_REPORT_COLUMNS[runResult.data.report_type] ?? Object.keys(dataResult.data[0] ?? {});
  return ok({ rows: dataResult.data, columns });
}
