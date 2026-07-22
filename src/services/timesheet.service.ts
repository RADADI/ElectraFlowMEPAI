/**
 * Timesheet service — Phase 11
 *
 * Behaviour:
 *   No Supabase / JWT not ready  → mock sessionStorage fallback
 *   Supabase + JWT               → real DB + RLS
 *
 * Business rules:
 *   - One timesheet per employee per week (unique constraint)
 *   - week_start = Monday, week_end = Sunday (ISO)
 *   - Total hours 0 → cannot submit
 *   - Daily hours > 24 → warn UI; block submit
 *   - Overtime = total > 40h / week
 *   - Cannot log to archived project
 *   - Cannot edit approved timesheet unless Admin/HR unlocks first
 *   - Self-approval blocked at service layer
 *   - revision_number used as optimistic lock on approve/reject/unlock
 *   - unlock_reason required
 *   - "Former User" shown when approver/rejector profile no longer exists
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { dummyTimesheets, dummyTimesheetEntries } from "@/lib/dummy-data";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import { getWeekStart, getWeekEnd, toISODate, isWeekend } from "@/types/timesheet-view";
import type {
  TimesheetView,
  TimesheetEntryView,
  TimesheetSummary,
  TimesheetCreateInput,
  TimesheetEntryInput,
  ApproveTimesheetInput,
  RejectTimesheetInput,
  UnlockTimesheetInput,
  DailyTotals,
} from "@/types/timesheet-view";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT not ready — using mock timesheets.");
    return false;
  }
  return true;
}

function normRole(r: string | null | undefined) {
  return (r ?? "").toLowerCase().replace(/ /g, "_");
}

function isAdminOrHR(role: string | null | undefined) {
  const r = normRole(role);
  return r === "admin" || r === "hr";
}

function canApprove(role: string | null | undefined) {
  const r = normRole(role);
  return ["admin", "hr", "project_manager"].includes(r);
}

// ─── Mock storage keys ────────────────────────────────────────────────────────

const TS_KEY = "mep-timesheets-mock";
const ENTRY_KEY = "mep-ts-entries-mock";

function getMockTimesheets(): TimesheetView[] {
  try {
    const raw = sessionStorage.getItem(TS_KEY);
    const overrides: TimesheetView[] = raw ? JSON.parse(raw) : [];
    const base = dummyTimesheets as unknown as TimesheetView[];
    const ids = new Set(overrides.map((t) => t.id));
    return [...overrides, ...base.filter((t) => !ids.has(t.id))].filter((t) => !t.deleted_at);
  } catch {
    return dummyTimesheets as unknown as TimesheetView[];
  }
}

function saveMockTimesheets(items: TimesheetView[]): void {
  try {
    sessionStorage.setItem(TS_KEY, JSON.stringify(items));
  } catch (_e) {
    /* storage unavailable */
  }
}

function updateMockTimesheet(id: string, patch: Partial<TimesheetView>): void {
  const all = getMockTimesheets();
  saveMockTimesheets(
    all.map((t) => (t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t)),
  );
}

function getMockEntries(timesheetId?: string): TimesheetEntryView[] {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    const overrides: TimesheetEntryView[] = raw ? JSON.parse(raw) : [];
    const base = dummyTimesheetEntries as unknown as TimesheetEntryView[];
    const ids = new Set(overrides.map((e) => e.id));
    const all = [...overrides, ...base.filter((e) => !ids.has(e.id))].filter((e) => !e.deleted_at);
    return timesheetId ? all.filter((e) => e.timesheet_id === timesheetId) : all;
  } catch {
    return (dummyTimesheetEntries as unknown as TimesheetEntryView[]).filter(
      (e) => !timesheetId || e.timesheet_id === timesheetId,
    );
  }
}

function saveMockEntry(entry: TimesheetEntryView): void {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    const all: TimesheetEntryView[] = raw ? JSON.parse(raw) : [];
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify([...all, entry]));
  } catch (_e) {
    /* storage unavailable */
  }
}

function patchMockEntry(id: string, patch: Partial<TimesheetEntryView>): void {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    const all: TimesheetEntryView[] = raw ? JSON.parse(raw) : [];
    sessionStorage.setItem(
      ENTRY_KEY,
      JSON.stringify(
        all.map((e) =>
          e.id === id ? { ...e, ...patch, updated_at: new Date().toISOString() } : e,
        ),
      ),
    );
  } catch (_e) {
    /* storage unavailable */
  }
}

function deleteMockEntry(id: string): void {
  patchMockEntry(id, { deleted_at: new Date().toISOString() } as Partial<TimesheetEntryView>);
}

/** Recompute totals for a mock timesheet from its entries. */
function recalcMockTotals(timesheetId: string): void {
  const entries = getMockEntries(timesheetId);
  const total = entries.reduce((s, e) => s + e.hours, 0);
  const regular = Math.min(total, 40);
  const overtime = Math.max(0, total - 40);
  updateMockTimesheet(timesheetId, {
    total_hours: total,
    regular_hours: regular,
    overtime_hours: overtime,
  });
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const TS_SELECT = `
  *,
  employee:employees!employee_id(full_name, employee_number),
  approver:profiles!approved_by(full_name),
  rejector:profiles!rejected_by(full_name)
`;

const ENTRY_SELECT = `
  *,
  project:projects!project_id(name)
`;

function rowToTimesheetView(row: Record<string, unknown>): TimesheetView {
  const emp = row.employee as { full_name?: string; employee_number?: string } | null;
  const approver = row.approver as { full_name?: string } | null;
  const rejector = row.rejector as { full_name?: string } | null;
  return {
    ...(row as unknown as TimesheetView),
    employee_name: emp?.full_name ?? "Unknown",
    employee_number: emp?.employee_number ?? null,
    approved_by_name: approver?.full_name ?? (row.approved_by ? "Former User" : null),
    rejected_by_name: rejector?.full_name ?? (row.rejected_by ? "Former User" : null),
  };
}

function rowToEntryView(row: Record<string, unknown>): TimesheetEntryView {
  const proj = row.project as { name?: string } | null;
  return {
    ...(row as unknown as TimesheetEntryView),
    project_name: proj?.name ?? "Unknown",
    is_weekend: isWeekend((row.entry_date as string) ?? ""),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TimesheetFilter {
  employee_id?: string;
  status?: string;
  week_start_date?: string;
  my_only?: boolean;
}

export async function listTimesheets(
  filters?: TimesheetFilter,
): Promise<ServiceResult<TimesheetView[]>> {
  if (!shouldUseSupabase()) {
    let items = getMockTimesheets();
    if (filters?.employee_id) items = items.filter((t) => t.employee_id === filters.employee_id);
    if (filters?.status) items = items.filter((t) => t.status === filters.status);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(getMockTimesheets());

  try {
    let q = supabase!
      .from("timesheets")
      .select(TS_SELECT)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("week_start_date", { ascending: false });

    if (filters?.employee_id) q = q.eq("employee_id", filters.employee_id);
    if (filters?.status) q = q.eq("status", filters.status);

    const { data, error } = await q;
    if (error) return fail<TimesheetView[]>(error);
    return ok((data ?? []).map((r: unknown) => rowToTimesheetView(r as Record<string, unknown>)));
  } catch (err) {
    return fail<TimesheetView[]>(err);
  }
}

export async function getTimesheet(id: string): Promise<ServiceResult<TimesheetView>> {
  if (!shouldUseSupabase()) {
    const found = getMockTimesheets().find((t) => t.id === id);
    if (!found) return fail<TimesheetView>("Timesheet not found.");
    return mockOk(found);
  }

  try {
    const { data, error } = await supabase!
      .from("timesheets")
      .select(TS_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail<TimesheetView>(error);
    if (!data) return fail<TimesheetView>("Timesheet not found.");
    return ok(rowToTimesheetView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetView>(err);
  }
}

export async function createTimesheet(
  input: TimesheetCreateInput,
): Promise<ServiceResult<TimesheetView>> {
  const { userId, organizationId } = getSessionContext();

  const weekStart = getWeekStart(
    input.week_start_date ? new Date(input.week_start_date + "T00:00:00") : new Date(),
  );
  const weekEnd = getWeekEnd(weekStart);
  const weekStartStr = toISODate(weekStart);
  const weekEndStr = toISODate(weekEnd);

  if (!shouldUseSupabase()) {
    const existing = getMockTimesheets().find((t) => t.week_start_date === weekStartStr);
    if (existing) {
      return fail<TimesheetView>(
        "A timesheet already exists for this week. Open it to continue logging time.",
      );
    }
    const newTS: TimesheetView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      employee_id: input.employee_id ?? "e1",
      employee_name: "Demo Employee",
      employee_number: null,
      week_start_date: weekStartStr,
      week_end_date: weekEndStr,
      status: "draft",
      total_hours: 0,
      regular_hours: 0,
      overtime_hours: 0,
      submitted_at: null,
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      rejected_by: null,
      rejected_by_name: null,
      rejected_at: null,
      rejection_reason: null,
      unlock_reason: null,
      revision_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      deleted_at: null,
    };
    const all = getMockTimesheets();
    saveMockTimesheets([newTS, ...all]);
    return mockOk(newTS);
  }

  if (!organizationId) {
    return fail<TimesheetView>("Organisation is not configured for this user.");
  }

  // Resolve employee_id from profile
  let employeeId = input.employee_id;
  if (!employeeId) {
    const { data: emp } = await supabase!
      .from("employees")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("profile_id", userId ?? "")
      .maybeSingle();
    if (!emp) {
      return fail<TimesheetView>(
        "Your HR profile is not configured — contact HR to set up your employee record.",
      );
    }
    employeeId = (emp as { id: string }).id;
  }

  try {
    const { data, error } = await supabase!
      .from("timesheets")
      .insert({
        organization_id: organizationId,
        employee_id: employeeId,
        week_start_date: weekStartStr,
        week_end_date: weekEndStr,
        status: "draft",
        created_by: userId,
        updated_by: userId,
      })
      .select(TS_SELECT)
      .single();

    if (error) {
      if (error.code === "23505")
        return fail<TimesheetView>(
          "A timesheet already exists for this week. Open it to continue logging time.",
        );
      return fail<TimesheetView>(error);
    }
    void logAction({
      action: "timesheet.created",
      resource_type: "timesheet",
      resource_id: (data as { id: string }).id,
      new_data: { week_start_date: weekStartStr },
    });
    return ok(rowToTimesheetView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetView>(err);
  }
}

export async function submitTimesheet(id: string): Promise<ServiceResult<TimesheetView>> {
  const { userId } = getSessionContext();

  // Validate entries
  const entriesResult = await listEntries(id);
  const entries = entriesResult.data ?? [];

  if (entries.length === 0 || entries.reduce((s, e) => s + e.hours, 0) === 0) {
    return fail<TimesheetView>("Cannot submit an empty timesheet. Please log your hours first.");
  }

  // Check daily totals
  const dailyTotals: DailyTotals = {};
  for (const e of entries) {
    dailyTotals[e.entry_date] = (dailyTotals[e.entry_date] ?? 0) + e.hours;
  }
  const overDay = Object.entries(dailyTotals).find(([, h]) => h > 24);
  if (overDay) {
    return fail<TimesheetView>(
      `Daily hours cannot exceed 24. You have ${overDay[1]}h logged on ${overDay[0]}.`,
    );
  }

  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const ts = getMockTimesheets().find((t) => t.id === id);
    if (!ts) return fail<TimesheetView>("Timesheet not found.");
    if (!["draft", "rejected"].includes(ts.status)) {
      return fail<TimesheetView>(`Cannot submit a timesheet with status '${ts.status}'.`);
    }
    updateMockTimesheet(id, {
      status: "submitted",
      submitted_at: now,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      revision_number: ts.revision_number + 1,
    });
    return mockOk({ ...ts, status: "submitted" as const });
  }

  try {
    const { data: current } = await supabase!
      .from("timesheets")
      .select("status, revision_number")
      .eq("id", id)
      .single();

    if (!current) return fail<TimesheetView>("Timesheet not found.");
    const cur = current as { status: string; revision_number: number };

    if (!["draft", "rejected"].includes(cur.status)) {
      return fail<TimesheetView>(`Cannot submit a timesheet with status '${cur.status}'.`);
    }

    const { data, error } = await supabase!
      .from("timesheets")
      .update({
        status: "submitted",
        submitted_at: now,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
        revision_number: cur.revision_number + 1,
        updated_by: userId,
      })
      .eq("id", id)
      .select(TS_SELECT)
      .single();

    if (error) return fail<TimesheetView>(error);
    void logAction({
      action: "timesheet.submitted",
      resource_type: "timesheet",
      resource_id: id,
    });
    return ok(rowToTimesheetView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetView>(err);
  }
}

export async function approveTimesheet(
  id: string,
  input: ApproveTimesheetInput,
): Promise<ServiceResult<TimesheetView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!canApprove(role)) {
    return fail<TimesheetView>("Only Admin, HR, or Project Manager can approve timesheets.");
  }

  if (!shouldUseSupabase()) {
    const ts = getMockTimesheets().find((t) => t.id === id);
    if (!ts) return fail<TimesheetView>("Timesheet not found.");
    if (ts.revision_number !== input.revision_number) {
      return fail<TimesheetView>(
        "This timesheet was updated by another user. Please refresh and try again.",
      );
    }
    if (ts.status !== "submitted") {
      return fail<TimesheetView>(`Timesheet must be Submitted to approve.`);
    }
    updateMockTimesheet(id, {
      status: "approved",
      approved_by: userId ?? null,
      approved_by_name: "Demo Approver",
      approved_at: new Date().toISOString(),
      revision_number: ts.revision_number + 1,
    });
    return mockOk({ ...ts, status: "approved" as const });
  }

  if (!organizationId) return fail<TimesheetView>("Organisation not configured.");

  try {
    const { data: current } = await supabase!
      .from("timesheets")
      .select("status, revision_number, employee_id, created_by")
      .eq("id", id)
      .single();

    if (!current) return fail<TimesheetView>("Timesheet not found.");
    const cur = current as {
      status: string;
      revision_number: number;
      employee_id: string;
      created_by: string | null;
    };

    // Optimistic lock
    if (cur.revision_number !== input.revision_number) {
      return fail<TimesheetView>(
        "This timesheet was updated by another user. Please refresh and try again.",
      );
    }
    if (cur.status !== "submitted") {
      return fail<TimesheetView>(`Timesheet must be Submitted to approve.`);
    }

    // Self-approval prevention
    if (cur.created_by === userId && normRole(role) === "project_manager") {
      return fail<TimesheetView>("You cannot approve your own timesheet.");
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("timesheets")
      .update({
        status: "approved",
        approved_by: userId,
        approved_at: now,
        revision_number: cur.revision_number + 1,
        updated_by: userId,
      })
      .eq("id", id)
      .select(TS_SELECT)
      .single();

    if (error) return fail<TimesheetView>(error);
    void logAction({
      action: "timesheet.approved",
      resource_type: "timesheet",
      resource_id: id,
    });
    return ok(rowToTimesheetView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetView>(err);
  }
}

export async function rejectTimesheet(
  id: string,
  input: RejectTimesheetInput,
): Promise<ServiceResult<TimesheetView>> {
  const { userId, role } = getSessionContext();

  if (!canApprove(role)) {
    return fail<TimesheetView>("Only Admin, HR, or Project Manager can reject timesheets.");
  }
  if (!input.rejection_reason?.trim()) {
    return fail<TimesheetView>("A rejection reason is required.");
  }

  if (!shouldUseSupabase()) {
    const ts = getMockTimesheets().find((t) => t.id === id);
    if (!ts) return fail<TimesheetView>("Timesheet not found.");
    if (ts.revision_number !== input.revision_number) {
      return fail<TimesheetView>(
        "This timesheet was updated by another user. Please refresh and try again.",
      );
    }
    if (ts.status !== "submitted") {
      return fail<TimesheetView>(`Timesheet must be Submitted to reject.`);
    }
    updateMockTimesheet(id, {
      status: "rejected",
      rejected_by: userId ?? null,
      rejected_by_name: "Demo Rejector",
      rejected_at: new Date().toISOString(),
      rejection_reason: input.rejection_reason,
      revision_number: ts.revision_number + 1,
    });
    return mockOk({ ...ts, status: "rejected" as const });
  }

  try {
    const { data: current } = await supabase!
      .from("timesheets")
      .select("status, revision_number")
      .eq("id", id)
      .single();

    if (!current) return fail<TimesheetView>("Timesheet not found.");
    const cur = current as { status: string; revision_number: number };

    if (cur.revision_number !== input.revision_number) {
      return fail<TimesheetView>(
        "This timesheet was updated by another user. Please refresh and try again.",
      );
    }
    if (cur.status !== "submitted") {
      return fail<TimesheetView>(`Timesheet must be Submitted to reject.`);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("timesheets")
      .update({
        status: "rejected",
        rejected_by: userId,
        rejected_at: now,
        rejection_reason: input.rejection_reason,
        revision_number: cur.revision_number + 1,
        updated_by: userId,
      })
      .eq("id", id)
      .select(TS_SELECT)
      .single();

    if (error) return fail<TimesheetView>(error);
    void logAction({
      action: "timesheet.rejected",
      resource_type: "timesheet",
      resource_id: id,
      new_data: { rejection_reason: input.rejection_reason },
    });
    return ok(rowToTimesheetView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetView>(err);
  }
}

export async function unlockTimesheet(
  id: string,
  input: UnlockTimesheetInput,
): Promise<ServiceResult<TimesheetView>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<TimesheetView>("Only Admin and HR can unlock approved timesheets.");
  }
  if (!input.unlock_reason?.trim()) {
    return fail<TimesheetView>("An unlock reason is required.");
  }

  if (!shouldUseSupabase()) {
    const ts = getMockTimesheets().find((t) => t.id === id);
    if (!ts) return fail<TimesheetView>("Timesheet not found.");
    if (ts.revision_number !== input.revision_number) {
      return fail<TimesheetView>(
        "This timesheet was updated by another user. Please refresh and try again.",
      );
    }
    if (ts.status !== "approved") {
      return fail<TimesheetView>(`Only approved timesheets can be unlocked.`);
    }
    updateMockTimesheet(id, {
      status: "draft",
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      unlock_reason: input.unlock_reason,
      revision_number: ts.revision_number + 1,
    });
    return mockOk({ ...ts, status: "draft" as const });
  }

  try {
    const { data: current } = await supabase!
      .from("timesheets")
      .select("status, revision_number")
      .eq("id", id)
      .single();

    if (!current) return fail<TimesheetView>("Timesheet not found.");
    const cur = current as { status: string; revision_number: number };

    if (cur.revision_number !== input.revision_number) {
      return fail<TimesheetView>(
        "This timesheet was updated by another user. Please refresh and try again.",
      );
    }
    if (cur.status !== "approved") {
      return fail<TimesheetView>(`Only approved timesheets can be unlocked.`);
    }

    const { data, error } = await supabase!
      .from("timesheets")
      .update({
        status: "draft",
        approved_by: null,
        approved_at: null,
        unlock_reason: input.unlock_reason,
        revision_number: cur.revision_number + 1,
        updated_by: userId,
      })
      .eq("id", id)
      .select(TS_SELECT)
      .single();

    if (error) return fail<TimesheetView>(error);
    void logAction({
      action: "timesheet.unlocked",
      resource_type: "timesheet",
      resource_id: id,
      new_data: { unlock_reason: input.unlock_reason },
    });
    return ok(rowToTimesheetView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetView>(err);
  }
}

export async function archiveTimesheet(id: string): Promise<ServiceResult<boolean>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<boolean>("Only Admin and HR can archive timesheets.");
  }

  if (!shouldUseSupabase()) {
    updateMockTimesheet(id, {
      status: "archived",
      deleted_at: new Date().toISOString(),
    });
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("timesheets")
      .update({
        status: "archived",
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id);

    if (error) return fail<boolean>(error);
    void logAction({
      action: "timesheet.archived",
      resource_type: "timesheet",
      resource_id: id,
    });
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

// ─── Timesheet Entries ────────────────────────────────────────────────────────

export async function listEntries(
  timesheetId: string,
): Promise<ServiceResult<TimesheetEntryView[]>> {
  if (!shouldUseSupabase()) {
    return mockOk(getMockEntries(timesheetId));
  }

  try {
    const { data, error } = await supabase!
      .from("timesheet_entries")
      .select(ENTRY_SELECT)
      .eq("timesheet_id", timesheetId)
      .is("deleted_at", null)
      .order("entry_date");

    if (error) return fail<TimesheetEntryView[]>(error);
    return ok((data ?? []).map((r: unknown) => rowToEntryView(r as Record<string, unknown>)));
  } catch (err) {
    return fail<TimesheetEntryView[]>(err);
  }
}

export async function addEntry(
  timesheetId: string,
  input: TimesheetEntryInput,
): Promise<ServiceResult<TimesheetEntryView>> {
  const { userId, organizationId } = getSessionContext();

  // Basic validations
  if (input.hours <= 0 || input.hours > 24) {
    return fail<TimesheetEntryView>("Hours must be between 0.1 and 24.");
  }

  if (!shouldUseSupabase()) {
    const ts = getMockTimesheets().find((t) => t.id === timesheetId);
    if (!ts) return fail<TimesheetEntryView>("Timesheet not found.");
    if (!["draft", "rejected"].includes(ts.status)) {
      return fail<TimesheetEntryView>(
        "Cannot add entries to a timesheet that is not in draft or rejected status.",
      );
    }

    // Daily total check
    const existing = getMockEntries(timesheetId).filter((e) => e.entry_date === input.entry_date);
    const existingHours = existing.reduce((s, e) => s + e.hours, 0);
    if (existingHours + input.hours > 24) {
      return fail<TimesheetEntryView>(
        `Adding ${input.hours}h would exceed 24h on ${input.entry_date} (current: ${existingHours}h).`,
      );
    }

    const newEntry: TimesheetEntryView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      timesheet_id: timesheetId,
      project_id: input.project_id,
      project_name: "Demo Project",
      entry_date: input.entry_date,
      hours: input.hours,
      work_type: input.work_type ?? "regular",
      description: input.description ?? null,
      billable: input.billable ?? true,
      is_weekend: isWeekend(input.entry_date),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    saveMockEntry(newEntry);
    recalcMockTotals(timesheetId);
    return mockOk(newEntry);
  }

  if (!organizationId) return fail<TimesheetEntryView>("Organisation not configured.");

  // Check timesheet status and project not archived
  const [tsResult, projResult] = await Promise.all([
    supabase!.from("timesheets").select("status").eq("id", timesheetId).single(),
    supabase!.from("projects").select("deleted_at").eq("id", input.project_id).single(),
  ]);

  if (tsResult.error || !tsResult.data) {
    return fail<TimesheetEntryView>("Timesheet not found.");
  }
  const tsStatus = (tsResult.data as { status: string }).status;
  if (!["draft", "rejected"].includes(tsStatus)) {
    return fail<TimesheetEntryView>("Cannot add entries to a submitted or approved timesheet.");
  }

  if (!projResult.error && projResult.data) {
    const proj = projResult.data as { deleted_at: string | null };
    if (proj.deleted_at) {
      return fail<TimesheetEntryView>("Cannot log time to an archived project.");
    }
  }

  // Daily total check in DB
  const { data: dayEntries } = await supabase!
    .from("timesheet_entries")
    .select("hours")
    .eq("timesheet_id", timesheetId)
    .eq("entry_date", input.entry_date)
    .is("deleted_at", null);

  const existingHrs = ((dayEntries ?? []) as { hours: number }[]).reduce((s, e) => s + e.hours, 0);
  if (existingHrs + input.hours > 24) {
    return fail<TimesheetEntryView>(
      `Adding ${input.hours}h would exceed 24h on ${input.entry_date} (current: ${existingHrs}h).`,
    );
  }

  try {
    const { data, error } = await supabase!
      .from("timesheet_entries")
      .insert({
        organization_id: organizationId,
        timesheet_id: timesheetId,
        project_id: input.project_id,
        entry_date: input.entry_date,
        hours: input.hours,
        work_type: input.work_type ?? "regular",
        description: input.description ?? null,
        billable: input.billable ?? true,
      })
      .select(ENTRY_SELECT)
      .single();

    if (error) return fail<TimesheetEntryView>(error);

    // Recalc totals
    await recalcDBTotals(timesheetId, organizationId);

    void logAction({
      action: "entry.created",
      resource_type: "timesheet_entry",
      resource_id: (data as { id: string }).id,
      new_data: {
        timesheet_id: timesheetId,
        entry_date: input.entry_date,
        hours: input.hours,
      },
    });
    return ok(rowToEntryView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<TimesheetEntryView>(err);
  }
}

export async function updateEntry(
  entryId: string,
  input: Partial<TimesheetEntryInput>,
): Promise<ServiceResult<TimesheetEntryView>> {
  const { userId } = getSessionContext();

  if (!shouldUseSupabase()) {
    patchMockEntry(entryId, {
      ...(input.hours !== undefined && { hours: input.hours }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.work_type !== undefined && { work_type: input.work_type }),
      ...(input.billable !== undefined && { billable: input.billable }),
    });
    const entries = getMockEntries();
    const updated = entries.find((e) => e.id === entryId);
    if (updated) recalcMockTotals(updated.timesheet_id);
    return mockOk(updated!);
  }

  try {
    const { data, error } = await supabase!
      .from("timesheet_entries")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .select(ENTRY_SELECT)
      .single();

    if (error) return fail<TimesheetEntryView>(error);
    const entry = rowToEntryView(data as unknown as Record<string, unknown>);
    await recalcDBTotals(entry.timesheet_id, entry.organization_id);
    return ok(entry);
  } catch (err) {
    return fail<TimesheetEntryView>(err);
  }
}

export async function deleteEntry(entryId: string): Promise<ServiceResult<boolean>> {
  if (!shouldUseSupabase()) {
    const all = getMockEntries();
    const entry = all.find((e) => e.id === entryId);
    deleteMockEntry(entryId);
    if (entry) recalcMockTotals(entry.timesheet_id);
    return mockOk(true);
  }

  try {
    // Get timesheet_id before deleting
    const { data: entry } = await supabase!
      .from("timesheet_entries")
      .select("timesheet_id, organization_id")
      .eq("id", entryId)
      .single();

    const { error } = await supabase!
      .from("timesheet_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", entryId);

    if (error) return fail<boolean>(error);

    if (entry) {
      const e = entry as { timesheet_id: string; organization_id: string };
      await recalcDBTotals(e.timesheet_id, e.organization_id);
    }
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

/** Recalculate weekly totals from actual entries in the DB. */
async function recalcDBTotals(timesheetId: string, organizationId: string): Promise<void> {
  try {
    const { data } = await supabase!
      .from("timesheet_entries")
      .select("hours")
      .eq("timesheet_id", timesheetId)
      .is("deleted_at", null);

    const total = ((data ?? []) as { hours: number }[]).reduce((s, e) => s + e.hours, 0);
    const regular = Math.min(total, 40);
    const overtime = Math.max(0, total - 40);

    await supabase!
      .from("timesheets")
      .update({
        total_hours: total,
        regular_hours: regular,
        overtime_hours: overtime,
        updated_at: new Date().toISOString(),
      })
      .eq("id", timesheetId)
      .eq("organization_id", organizationId);
  } catch {
    // Non-critical: UI can still refetch
  }
}

/** Summary card counts across all visible timesheets. */
export async function getTimesheetSummary(): Promise<ServiceResult<TimesheetSummary>> {
  if (!shouldUseSupabase()) {
    const all = getMockTimesheets();
    return mockOk({
      draft: all.filter((t) => t.status === "draft").length,
      submitted: all.filter((t) => t.status === "submitted").length,
      approved: all.filter((t) => t.status === "approved").length,
      rejected: all.filter((t) => t.status === "rejected").length,
      overtime_weeks: all.filter((t) => t.overtime_hours > 0).length,
    });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail<TimesheetSummary>("Organisation not configured.");

  try {
    const { data } = await supabase!
      .from("timesheets")
      .select("status, overtime_hours")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    const rows = (data ?? []) as { status: string; overtime_hours: number }[];
    return ok({
      draft: rows.filter((r) => r.status === "draft").length,
      submitted: rows.filter((r) => r.status === "submitted").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      overtime_weeks: rows.filter((r) => r.overtime_hours > 0).length,
    });
  } catch (err) {
    return fail<TimesheetSummary>(err);
  }
}
