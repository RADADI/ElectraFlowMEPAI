/**
 * Timesheet & Leave view types — Phase 11
 *
 * All UI pages import from here. Never access database.ts rows directly
 * in page components.
 */

import type { TimesheetStatus, TimesheetWorkType, LeaveType, LeaveStatus } from "./database";
export type { TimesheetStatus, TimesheetWorkType, LeaveType, LeaveStatus };

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Returns the Monday of the ISO week containing `date`. */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday = 0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns true if the date falls on a Saturday or Sunday. */
export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

/** Returns true if the date string matches a public holiday. */
export function isHoliday(dateStr: string, holidayDates: string[]): boolean {
  return holidayDates.includes(dateStr);
}

/**
 * Counts working days (Mon–Fri, excluding holidays) between two dates inclusive.
 */
export function countWorkingDays(
  startStr: string,
  endStr: string,
  holidayDates: string[] = [],
): number {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const iso = toISODate(cur);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !holidayDates.includes(iso)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** All seven days of the ISO week starting on Monday. */
export function getWeekDays(weekStartStr: string): string[] {
  const days: string[] = [];
  const start = new Date(weekStartStr + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(toISODate(d));
  }
  return days;
}

// ─── Timesheet view ───────────────────────────────────────────────────────────

export interface TimesheetView {
  id: string;
  organization_id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string | null;
  week_start_date: string;
  week_end_date: string;
  status: TimesheetStatus;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  submitted_at: string | null;
  approved_by: string | null;
  /** "Former User" if approver profile has been deleted. */
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  unlock_reason: string | null;
  revision_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface TimesheetEntryView {
  id: string;
  organization_id: string;
  timesheet_id: string;
  project_id: string;
  project_name: string;
  entry_date: string;
  hours: number;
  work_type: TimesheetWorkType;
  description: string | null;
  billable: boolean;
  /** True if entry_date is Saturday or Sunday. */
  is_weekend: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Daily total per day in the week (keyed by ISO date string). */
export type DailyTotals = Record<string, number>;

/** Per-project breakdown: project_id → day → hours. */
export type ProjectDayMap = Record<string, Record<string, number>>;

// ─── Leave view ───────────────────────────────────────────────────────────────

export type LeaveConflictSeverity =
  | "no_conflict"
  | "overlapping_leave"
  | "allocation_conflict"
  | "critical_path_conflict";

export interface LeaveConflict {
  severity: LeaveConflictSeverity;
  message: string;
}

export interface LeaveRequestView {
  id: string;
  organization_id: string;
  employee_id: string;
  employee_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
  /** Conflict details computed at service layer. */
  conflicts: LeaveConflict[];
}

// ─── Holiday view ─────────────────────────────────────────────────────────────

export interface HolidayView {
  id: string;
  organization_id: string;
  name: string;
  holiday_date: string;
  recurring: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

// ─── Summary cards ────────────────────────────────────────────────────────────

export interface TimesheetSummary {
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  overtime_weeks: number; // timesheets with overtime_hours > 0
}

// ─── Leave balance (placeholder — no accrual engine) ─────────────────────────

export interface LeaveBalance {
  employee_id: string;
  pto_used: number;
  sick_used: number;
  unpaid_used: number;
  total_approved_days: number;
  /** Always null in Phase 11 — accrual engine deferred. */
  pto_balance: null;
  /** Always null in Phase 11 — accrual engine deferred. */
  sick_balance: null;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface TimesheetCreateInput {
  week_start_date: string;
  employee_id?: string; // Admin/HR can create on behalf
}

export interface TimesheetEntryInput {
  project_id: string;
  entry_date: string;
  hours: number;
  work_type?: TimesheetWorkType;
  description?: string;
  billable?: boolean;
}

export interface RejectTimesheetInput {
  rejection_reason: string;
  revision_number: number; // optimistic lock
}

export interface ApproveTimesheetInput {
  revision_number: number; // optimistic lock
}

export interface UnlockTimesheetInput {
  unlock_reason: string;
  revision_number: number; // optimistic lock
}

export interface LeaveCreateInput {
  employee_id?: string; // Admin/HR can create on behalf
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason?: string;
}

export interface RejectLeaveInput {
  rejection_reason: string;
}

export interface HolidayCreateInput {
  name: string;
  holiday_date: string;
  recurring?: boolean;
}

export type HolidayUpdateInput = Partial<HolidayCreateInput>;
