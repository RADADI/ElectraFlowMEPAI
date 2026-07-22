/**
 * Leave request service — Phase 11
 *
 * Conflict severity:
 *   no_conflict           — no issues found
 *   overlapping_leave     — another approved/pending leave exists for the same period
 *   allocation_conflict   — employee has an active project allocation in this period
 *   critical_path_conflict — allocation overlap on a milestone-heavy project (heuristic)
 *
 * Phase 11 scope:
 *   - No accrual engine (balances are counted from approved records)
 *   - No recurring leave policies
 *   - Holiday-aware working-day calculations
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { dummyLeaveRequests } from "@/lib/dummy-data";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import { listHolidays } from "@/services/holiday.service";
import { countWorkingDays, isWeekend, toISODate } from "@/types/timesheet-view";
import type {
  LeaveRequestView,
  LeaveBalance,
  LeaveConflict,
  LeaveCreateInput,
  RejectLeaveInput,
} from "@/types/timesheet-view";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) return false;
  return true;
}

function normRole(r: string | null | undefined) {
  return (r ?? "").toLowerCase().replace(/ /g, "_");
}

function canApprove(role: string | null | undefined) {
  const r = normRole(role);
  return ["admin", "hr", "project_manager"].includes(r);
}

// ─── Mock storage ─────────────────────────────────────────────────────────────

const LEAVE_KEY = "mep-leave-mock";

function getMockLeave(): LeaveRequestView[] {
  try {
    const raw = sessionStorage.getItem(LEAVE_KEY);
    const overrides: LeaveRequestView[] = raw ? JSON.parse(raw) : [];
    const base = dummyLeaveRequests as unknown as LeaveRequestView[];
    const ids = new Set(overrides.map((l) => l.id));
    return [...overrides, ...base.filter((l) => !ids.has(l.id))].filter((l) => !l.deleted_at);
  } catch {
    return dummyLeaveRequests as unknown as LeaveRequestView[];
  }
}

function saveMockLeave(items: LeaveRequestView[]): void {
  try {
    sessionStorage.setItem(LEAVE_KEY, JSON.stringify(items));
  } catch (_e) {
    /* storage unavailable */
  }
}

function updateMockLeave(id: string, patch: Partial<LeaveRequestView>): void {
  const all = getMockLeave();
  saveMockLeave(
    all.map((l) => (l.id === id ? { ...l, ...patch, updated_at: new Date().toISOString() } : l)),
  );
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const LEAVE_SELECT = `
  *,
  employee:employees!employee_id(full_name),
  approver:profiles!approved_by(full_name),
  rejector:profiles!rejected_by(full_name)
`;

function rowToLeaveView(
  row: Record<string, unknown>,
  conflicts: LeaveConflict[] = [],
): LeaveRequestView {
  const emp = row.employee as { full_name?: string } | null;
  const approver = row.approver as { full_name?: string } | null;
  const rejector = row.rejector as { full_name?: string } | null;
  return {
    ...(row as unknown as LeaveRequestView),
    employee_name: emp?.full_name ?? "Unknown",
    approved_by_name: approver?.full_name ?? (row.approved_by ? "Former User" : null),
    rejected_by_name: rejector?.full_name ?? (row.rejected_by ? "Former User" : null),
    conflicts,
  };
}

// ─── Conflict checker ─────────────────────────────────────────────────────────

export async function checkLeaveConflicts(
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeLeaveId?: string,
): Promise<LeaveConflict[]> {
  const conflicts: LeaveConflict[] = [];

  if (!shouldUseSupabase()) {
    // Mock: check overlapping leave in sessionStorage
    const all = getMockLeave().filter(
      (l) =>
        l.employee_id === employeeId &&
        ["pending", "approved"].includes(l.status) &&
        l.id !== excludeLeaveId &&
        l.start_date <= endDate &&
        l.end_date >= startDate,
    );
    if (all.length > 0) {
      conflicts.push({
        severity: "overlapping_leave",
        message: `Overlaps with ${all.length} existing leave request(s).`,
      });
    }
    return conflicts;
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return conflicts;

  try {
    // 1. Overlapping leaves
    let lq = supabase!
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date")
      .eq("employee_id", employeeId)
      .eq("organization_id", organizationId)
      .in("status", ["pending", "approved"])
      .is("deleted_at", null)
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    if (excludeLeaveId) lq = lq.neq("id", excludeLeaveId);
    const { data: overlapping } = await lq;

    if (overlapping && overlapping.length > 0) {
      conflicts.push({
        severity: "overlapping_leave",
        message: `Overlaps with ${overlapping.length} existing leave request(s).`,
      });
    }

    // 2. Allocation conflicts
    const { data: allocs } = await supabase!
      .from("resource_allocations")
      .select("project_id, allocation_percent, projects:projects!project_id(name, deleted_at)")
      .eq("employee_id", employeeId)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .lte("start_date", endDate)
      .or(`end_date.is.null,end_date.gte.${startDate}`);

    if (allocs && allocs.length > 0) {
      const activeAllocs = (allocs as unknown[]).filter((a: unknown) => {
        const row = a as { projects?: { deleted_at?: string | null } };
        return !row.projects?.deleted_at;
      });

      if (activeAllocs.length > 0) {
        // Heuristic: treat 100% allocation as "critical path" (higher severity)
        const criticalAlloc = (activeAllocs as { allocation_percent: number }[]).some(
          (a) => a.allocation_percent >= 100,
        );

        conflicts.push({
          severity: criticalAlloc ? "critical_path_conflict" : "allocation_conflict",
          message: criticalAlloc
            ? `Employee is 100% allocated during this period — notify Project Manager.`
            : `Employee has ${activeAllocs.length} active project allocation(s) during this period.`,
        });
      }
    }
  } catch {
    // Non-critical — surface best-effort
  }

  return conflicts;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface LeaveFilter {
  employee_id?: string;
  status?: string;
}

export async function listLeaveRequests(
  filters?: LeaveFilter,
): Promise<ServiceResult<LeaveRequestView[]>> {
  if (!shouldUseSupabase()) {
    let items = getMockLeave();
    if (filters?.employee_id) items = items.filter((l) => l.employee_id === filters.employee_id);
    if (filters?.status) items = items.filter((l) => l.status === filters.status);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(getMockLeave());

  try {
    let q = supabase!
      .from("leave_requests")
      .select(LEAVE_SELECT)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("start_date", { ascending: false });

    if (filters?.employee_id) q = q.eq("employee_id", filters.employee_id);
    if (filters?.status) q = q.eq("status", filters.status);

    const { data, error } = await q;
    if (error) return fail<LeaveRequestView[]>(error);
    return ok((data ?? []).map((r: unknown) => rowToLeaveView(r as Record<string, unknown>)));
  } catch (err) {
    return fail<LeaveRequestView[]>(err);
  }
}

export async function getLeaveRequest(id: string): Promise<ServiceResult<LeaveRequestView>> {
  if (!shouldUseSupabase()) {
    const found = getMockLeave().find((l) => l.id === id);
    if (!found) return fail<LeaveRequestView>("Leave request not found.");
    return mockOk(found);
  }

  try {
    const { data, error } = await supabase!
      .from("leave_requests")
      .select(LEAVE_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail<LeaveRequestView>(error);
    if (!data) return fail<LeaveRequestView>("Leave request not found.");

    const leave = rowToLeaveView(data as unknown as Record<string, unknown>);
    const conflicts = await checkLeaveConflicts(
      leave.employee_id,
      leave.start_date,
      leave.end_date,
      id,
    );
    leave.conflicts = conflicts;
    return ok(leave);
  } catch (err) {
    return fail<LeaveRequestView>(err);
  }
}

export async function createLeaveRequest(
  input: LeaveCreateInput,
): Promise<ServiceResult<LeaveRequestView>> {
  const { userId, organizationId } = getSessionContext();

  // Validation
  if (input.end_date < input.start_date) {
    return fail<LeaveRequestView>("End date must be on or after start date.");
  }

  // Compute holiday-aware working days
  const holidaysResult = await listHolidays();
  const holidayDates = (holidaysResult.data ?? []).map((h) => h.holiday_date);
  const totalDays = countWorkingDays(input.start_date, input.end_date, holidayDates);

  if (totalDays === 0) {
    return fail<LeaveRequestView>(
      "The selected date range contains no working days (weekends/holidays only).",
    );
  }

  // Conflict check (pre-flight — informational; we block overlapping_leave)
  if (!shouldUseSupabase()) {
    const conflicts = await checkLeaveConflicts(
      input.employee_id ?? "e1",
      input.start_date,
      input.end_date,
    );

    const hasOverlap = conflicts.some((c) => c.severity === "overlapping_leave");
    if (hasOverlap) {
      return fail<LeaveRequestView>(
        "You already have a pending or approved leave that overlaps these dates.",
      );
    }

    const newLeave: LeaveRequestView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      employee_id: input.employee_id ?? "e1",
      employee_name: "Demo Employee",
      leave_type: input.leave_type,
      start_date: input.start_date,
      end_date: input.end_date,
      total_days: totalDays,
      reason: input.reason ?? null,
      status: "pending",
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      rejected_by: null,
      rejected_by_name: null,
      rejected_at: null,
      rejection_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      deleted_at: null,
      conflicts,
    };
    const all = getMockLeave();
    saveMockLeave([newLeave, ...all]);
    return mockOk(newLeave);
  }

  if (!organizationId) {
    return fail<LeaveRequestView>("Organisation is not configured for this user.");
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
      return fail<LeaveRequestView>(
        "Your HR profile is not configured — contact HR to set up your employee record.",
      );
    }
    employeeId = (emp as { id: string }).id;
  }

  const conflicts = await checkLeaveConflicts(employeeId, input.start_date, input.end_date);
  const hasOverlap = conflicts.some((c) => c.severity === "overlapping_leave");
  if (hasOverlap) {
    return fail<LeaveRequestView>(
      "You already have a pending or approved leave that overlaps these dates.",
    );
  }

  try {
    const { data, error } = await supabase!
      .from("leave_requests")
      .insert({
        organization_id: organizationId,
        employee_id: employeeId,
        leave_type: input.leave_type,
        start_date: input.start_date,
        end_date: input.end_date,
        total_days: totalDays,
        reason: input.reason ?? null,
        status: "pending",
        created_by: userId,
      })
      .select(LEAVE_SELECT)
      .single();

    if (error) return fail<LeaveRequestView>(error);
    void logAction({
      action: "leave.requested",
      resource_type: "leave_request",
      resource_id: (data as { id: string }).id,
      new_data: {
        leave_type: input.leave_type,
        start_date: input.start_date,
        end_date: input.end_date,
        total_days: totalDays,
      },
    });
    return ok(rowToLeaveView(data as unknown as Record<string, unknown>, conflicts));
  } catch (err) {
    return fail<LeaveRequestView>(err);
  }
}

export async function approveLeaveRequest(id: string): Promise<ServiceResult<LeaveRequestView>> {
  const { userId, role } = getSessionContext();

  if (!canApprove(role)) {
    return fail<LeaveRequestView>("Only Admin, HR, or Project Manager can approve leave.");
  }

  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const leave = getMockLeave().find((l) => l.id === id);
    if (!leave) return fail<LeaveRequestView>("Leave request not found.");
    if (leave.status !== "pending") {
      return fail<LeaveRequestView>(`Leave is already ${leave.status}.`);
    }
    updateMockLeave(id, {
      status: "approved",
      approved_by: userId ?? null,
      approved_by_name: "Demo Approver",
      approved_at: now,
    });
    return mockOk({ ...leave, status: "approved" as const });
  }

  try {
    const { data: current } = await supabase!
      .from("leave_requests")
      .select("status")
      .eq("id", id)
      .single();

    if (!current) return fail<LeaveRequestView>("Leave request not found.");
    const status = (current as { status: string }).status;
    if (status !== "pending") {
      return fail<LeaveRequestView>(`Leave is already ${status}.`);
    }

    const { data, error } = await supabase!
      .from("leave_requests")
      .update({
        status: "approved",
        approved_by: userId,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select(LEAVE_SELECT)
      .single();

    if (error) return fail<LeaveRequestView>(error);
    void logAction({
      action: "leave.approved",
      resource_type: "leave_request",
      resource_id: id,
    });
    return ok(rowToLeaveView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<LeaveRequestView>(err);
  }
}

export async function rejectLeaveRequest(
  id: string,
  input: RejectLeaveInput,
): Promise<ServiceResult<LeaveRequestView>> {
  const { userId, role } = getSessionContext();

  if (!canApprove(role)) {
    return fail<LeaveRequestView>("Only Admin, HR, or Project Manager can reject leave.");
  }
  if (!input.rejection_reason?.trim()) {
    return fail<LeaveRequestView>("A rejection reason is required.");
  }

  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const leave = getMockLeave().find((l) => l.id === id);
    if (!leave) return fail<LeaveRequestView>("Leave request not found.");
    updateMockLeave(id, {
      status: "rejected",
      rejected_by: userId ?? null,
      rejected_by_name: "Demo Rejector",
      rejected_at: now,
      rejection_reason: input.rejection_reason,
    });
    return mockOk({ ...leave, status: "rejected" as const });
  }

  try {
    const { data, error } = await supabase!
      .from("leave_requests")
      .update({
        status: "rejected",
        rejected_by: userId,
        rejected_at: now,
        rejection_reason: input.rejection_reason,
        updated_at: now,
      })
      .eq("id", id)
      .select(LEAVE_SELECT)
      .single();

    if (error) return fail<LeaveRequestView>(error);
    void logAction({
      action: "leave.rejected",
      resource_type: "leave_request",
      resource_id: id,
      new_data: { rejection_reason: input.rejection_reason },
    });
    return ok(rowToLeaveView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<LeaveRequestView>(err);
  }
}

export async function cancelLeaveRequest(id: string): Promise<ServiceResult<LeaveRequestView>> {
  const { userId } = getSessionContext();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const leave = getMockLeave().find((l) => l.id === id);
    if (!leave) return fail<LeaveRequestView>("Leave request not found.");
    if (leave.status !== "pending") {
      return fail<LeaveRequestView>("Only pending leave requests can be cancelled.");
    }
    updateMockLeave(id, { status: "cancelled" as const });
    return mockOk({ ...leave, status: "cancelled" as const });
  }

  try {
    const { data: current } = await supabase!
      .from("leave_requests")
      .select("status")
      .eq("id", id)
      .single();

    if (!current) return fail<LeaveRequestView>("Leave request not found.");
    const status = (current as { status: string }).status;
    if (status !== "pending") {
      return fail<LeaveRequestView>("Only pending leave requests can be cancelled.");
    }

    const { data, error } = await supabase!
      .from("leave_requests")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", id)
      .select(LEAVE_SELECT)
      .single();

    if (error) return fail<LeaveRequestView>(error);
    void logAction({
      action: "leave.cancelled",
      resource_type: "leave_request",
      resource_id: id,
    });
    return ok(rowToLeaveView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<LeaveRequestView>(err);
  }
}

/** Leave balance placeholder — counts from approved records (no accrual engine). */
export async function getLeaveBalance(employeeId: string): Promise<ServiceResult<LeaveBalance>> {
  const baseBalance: LeaveBalance = {
    employee_id: employeeId,
    pto_used: 0,
    sick_used: 0,
    unpaid_used: 0,
    total_approved_days: 0,
    pto_balance: null,
    sick_balance: null,
  };

  if (!shouldUseSupabase()) {
    const all = getMockLeave().filter(
      (l) => l.employee_id === employeeId && l.status === "approved",
    );
    const balance: LeaveBalance = {
      ...baseBalance,
      pto_used: all.filter((l) => l.leave_type === "pto").reduce((s, l) => s + l.total_days, 0),
      sick_used: all.filter((l) => l.leave_type === "sick").reduce((s, l) => s + l.total_days, 0),
      unpaid_used: all
        .filter((l) => l.leave_type === "unpaid")
        .reduce((s, l) => s + l.total_days, 0),
      total_approved_days: all.reduce((s, l) => s + l.total_days, 0),
    };
    return mockOk(balance);
  }

  try {
    const { organizationId } = getSessionContext();
    const { data } = await supabase!
      .from("leave_requests")
      .select("leave_type, total_days")
      .eq("employee_id", employeeId)
      .eq("organization_id", organizationId!)
      .eq("status", "approved")
      .is("deleted_at", null);

    const rows = (data ?? []) as { leave_type: string; total_days: number }[];
    const balance: LeaveBalance = {
      ...baseBalance,
      pto_used: rows.filter((r) => r.leave_type === "pto").reduce((s, r) => s + r.total_days, 0),
      sick_used: rows.filter((r) => r.leave_type === "sick").reduce((s, r) => s + r.total_days, 0),
      unpaid_used: rows
        .filter((r) => r.leave_type === "unpaid")
        .reduce((s, r) => s + r.total_days, 0),
      total_approved_days: rows.reduce((s, r) => s + r.total_days, 0),
    };
    return ok(balance);
  } catch (err) {
    return fail<LeaveBalance>(err);
  }
}
