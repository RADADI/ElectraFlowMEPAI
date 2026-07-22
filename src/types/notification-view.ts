/**
 * Phase 13: Notification & Activity UI view types.
 * These are UI-friendly shapes used in components — not 1:1 database rows.
 */

import type {
  Notification,
  ActivityEvent,
  NotificationPreference,
  NotificationPriority,
  NotificationCategory,
  NotificationSeverity,
  NotificationChannel,
  NotificationFrequency,
  ActivityVisibility,
} from "./database";

// ─── Re-export DB enums so consumers import from one place ───────────────────
export type {
  NotificationPriority,
  NotificationCategory,
  NotificationSeverity,
  NotificationChannel,
  NotificationFrequency,
  ActivityVisibility,
};

// ─── Cursor pagination ────────────────────────────────────────────────────────

/** Opaque base64-encoded cursor encoding `{ created_at, id }`. */
export type Cursor = string;

export interface CursorPage<T> {
  items: T[];
  /** Null when there are no more pages. */
  next_cursor: Cursor | null;
}

export function encodeCursor(created_at: string, id: string): Cursor {
  return btoa(JSON.stringify({ created_at, id }));
}

export function decodeCursor(cursor: Cursor): { created_at: string; id: string } | null {
  try {
    return JSON.parse(atob(cursor)) as { created_at: string; id: string };
  } catch {
    return null;
  }
}

// ─── NotificationView ─────────────────────────────────────────────────────────

export interface NotificationView extends Notification {
  /** Display name of the actor, e.g. "Sara Khan" or "System". */
  actor_name: string;
  /** Avatar URL for the actor (null for system events). */
  actor_avatar: string | null;
  /** Human-friendly relative time, e.g. "2 hours ago". */
  relative_time: string;
  /** True if read_at is non-null. */
  is_read: boolean;
  /** True if currently snoozed (snoozed_until > now). */
  is_snoozed: boolean;
  /** True if dismissed (dismissed_at non-null). */
  is_dismissed: boolean;
}

// ─── ActivityEventView ────────────────────────────────────────────────────────

export interface ActivityEventView extends ActivityEvent {
  /** Display name of the actor, e.g. "Sara Khan" or "System". */
  actor_name: string;
  /** Avatar URL for the actor. */
  actor_avatar: string | null;
  /** Human-friendly relative time. */
  relative_time: string;
  /** Category icon name from Lucide. */
  category_icon: string;
}

// ─── PreferenceView ───────────────────────────────────────────────────────────

export interface PreferenceView extends NotificationPreference {
  /** Human-readable event label, e.g. "Submittal approved". */
  event_label: string;
  /** Module/category group, e.g. "Submittals". */
  group: string;
}

/** Preferences grouped by module for the UI. */
export interface PreferenceGroup {
  group: string;
  icon: string;
  preferences: PreferenceView[];
}

// ─── Notification filter options ──────────────────────────────────────────────

export interface NotificationFilters {
  category?: NotificationCategory;
  priority?: NotificationPriority;
  severity?: NotificationSeverity;
  unread_only?: boolean;
  include_snoozed?: boolean;
  include_dismissed?: boolean;
  cursor?: Cursor;
  limit?: number;
}

// ─── Activity filter options ──────────────────────────────────────────────────

export interface ActivityFilters {
  category?: NotificationCategory;
  entity_type?: string;
  entity_id?: string;
  visibility?: ActivityVisibility;
  cursor?: Cursor;
  limit?: number;
}

// ─── Event type constants ─────────────────────────────────────────────────────

export const EVENT_TYPES = {
  // Projects
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_ARCHIVED: "project.archived",
  PROJECT_MEMBER_ADDED: "project.member_added",
  PROJECT_STATUS_CHANGED: "project.status_changed",
  // Documents
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_VERSION_UPLOADED: "document.version_uploaded",
  DOCUMENT_SUBMITTED_FOR_REVIEW: "document.submitted_for_review",
  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_REJECTED: "document.rejected",
  DOCUMENT_SHARED_WITH_CLIENT: "document.shared_with_client",
  // Submittals
  SUBMITTAL_CREATED: "submittal.created",
  SUBMITTAL_SUBMITTED: "submittal.submitted",
  SUBMITTAL_APPROVED: "submittal.approved",
  SUBMITTAL_REJECTED: "submittal.rejected",
  SUBMITTAL_REVISION_REQUESTED: "submittal.revision_requested",
  SUBMITTAL_ASSIGNED: "submittal.assigned",
  // RFI
  RFI_CREATED: "rfi.created",
  RFI_ASSIGNED: "rfi.assigned",
  RFI_RESPONDED: "rfi.responded",
  RFI_REQUEST_MORE_INFO: "rfi.request_more_info",
  RFI_CLOSED: "rfi.closed",
  RFI_REOPENED: "rfi.reopened",
  // NCR
  NCR_CREATED: "ncr.created",
  NCR_ASSIGNED: "ncr.assigned",
  NCR_ROOT_CAUSE_ADDED: "ncr.root_cause_added",
  NCR_ACTION_ASSIGNED: "ncr.action_assigned",
  NCR_ACTION_VERIFIED: "ncr.action_verified",
  NCR_CLOSED: "ncr.closed",
  NCR_REOPENED: "ncr.reopened",
  // Resources
  RESOURCE_ALLOCATED: "resource.allocated",
  RESOURCE_OVERBOOKED: "resource.overbooked",
  CERTIFICATION_EXPIRING: "certification.expiring",
  EMPLOYEE_DEACTIVATED: "employee.deactivated",
  // Timesheets & Leave
  TIMESHEET_SUBMITTED: "timesheet.submitted",
  TIMESHEET_APPROVED: "timesheet.approved",
  TIMESHEET_REJECTED: "timesheet.rejected",
  LEAVE_REQUESTED: "leave.requested",
  LEAVE_APPROVED: "leave.approved",
  LEAVE_REJECTED: "leave.rejected",
  HOLIDAY_CREATED: "holiday.created",
  // Financials
  EXPENSE_SUBMITTED: "expense.submitted",
  EXPENSE_APPROVED: "expense.approved",
  EXPENSE_REJECTED: "expense.rejected",
  INVOICE_SENT: "invoice.sent",
  INVOICE_OVERDUE: "invoice.overdue",
  INVOICE_PAID: "invoice.paid",
  CHANGE_ORDER_SUBMITTED: "change_order.submitted",
  CHANGE_ORDER_APPROVED: "change_order.approved",
  BUDGET_OVER_BUDGET: "budget.over_budget",
  // Users
  USER_INVITED: "user.invited",
  USER_JOINED: "user.joined",
  USER_DEACTIVATED: "user.deactivated",
  ROLE_CHANGED: "role.changed",
  // Future — Reports
  REPORT_GENERATED: "report.generated",
  EXPORT_COMPLETED: "export.completed",
  EXPORT_FAILED: "export.failed",
  // Meetings — Phase 15A
  MEETING_CREATED: "meeting.created",
  MEETING_UPDATED: "meeting.updated",
  MEETING_CANCELLED: "meeting.cancelled",
  MEETING_ACTION_ASSIGNED: "meeting.action_assigned",
  MEETING_ACTION_COMPLETED: "meeting.action_completed",
  // Electrical — Phase 15B
  PANEL_SCHEDULE_CREATED: "panel_schedule.created",
  PANEL_SCHEDULE_REVISED: "panel_schedule.revised",
  PANEL_SCHEDULE_APPROVED: "panel_schedule.approved",
  PANEL_SCHEDULE_REJECTED: "panel_schedule.rejected",
  LOAD_CALCULATION_CREATED: "load_calculation.created",
  LOAD_CALCULATION_UPDATED: "load_calculation.updated",
  LOAD_CALCULATION_APPROVED: "load_calculation.approved",
  LOAD_CALCULATION_REJECTED: "load_calculation.rejected",
  EQUIPMENT_CREATED: "equipment.created",
  EQUIPMENT_UPDATED: "equipment.updated",
  EQUIPMENT_ARCHIVED: "equipment.archived",
  DRAWING_REVISION_UPLOADED: "drawing.revision_uploaded",
  // Future — AI Copilot
  AI_SUMMARY_READY: "ai.summary_ready",
  AI_SUGGESTION_READY: "ai.suggestion_ready",
  AI_SUGGESTION_ACCEPTED: "ai.suggestion_accepted",
  AI_SUGGESTION_REJECTED: "ai.suggestion_rejected",
  AI_DOCUMENT_INDEXED: "ai.document_indexed",
  AI_CHAT_CREATED: "ai.chat_created",
  AI_EMBEDDING_COMPLETED: "ai.embedding_completed",
  AI_EMBEDDING_FAILED: "ai.embedding_failed",
  // Future — Client Portal
  CLIENT_COMMENT_ADDED: "client.comment_added",
  CLIENT_INVOICE_VIEWED: "client.invoice_viewed",
  // Future — SaaS/Billing
  SUBSCRIPTION_EXPIRING: "subscription.expiring",
  SEAT_LIMIT_WARNING: "seat_limit.warning",
  STORAGE_LIMIT_WARNING: "storage_limit.warning",
  PAYMENT_FAILED: "payment_failed",
  // Future — System
  SYSTEM_ALERT: "system.alert",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ─── Helpers: derive category and severity from event type ───────────────────

export function getEventCategory(eventType: string): NotificationCategory {
  if (eventType.startsWith("project.")) return "project";
  if (eventType.startsWith("document.")) return "document";
  if (eventType.startsWith("submittal.")) return "submittal";
  if (eventType.startsWith("rfi.")) return "rfi";
  if (eventType.startsWith("ncr.")) return "ncr";
  if (
    eventType.startsWith("resource.") ||
    eventType.startsWith("certification.") ||
    eventType.startsWith("employee.")
  )
    return "resource";
  if (
    eventType.startsWith("timesheet.") ||
    eventType.startsWith("leave.") ||
    eventType.startsWith("holiday.")
  )
    return "timesheet";
  if (
    eventType.startsWith("expense.") ||
    eventType.startsWith("invoice.") ||
    eventType.startsWith("change_order.") ||
    eventType.startsWith("budget.")
  )
    return "financial";
  if (eventType.startsWith("user.") || eventType.startsWith("role.")) return "user";
  if (eventType.startsWith("report.") || eventType.startsWith("export.")) return "report";
  if (eventType.startsWith("meeting.")) return "meeting";
  if (
    eventType.startsWith("panel_schedule.") ||
    eventType.startsWith("load_calculation.") ||
    eventType.startsWith("equipment_list.") ||
    eventType.startsWith("equipment.") ||
    eventType.startsWith("drawing.")
  )
    return "electrical";
  if (eventType.startsWith("ai.")) return "ai";
  if (eventType.startsWith("client.")) return "client";
  if (
    eventType.startsWith("subscription.") ||
    eventType.startsWith("seat_limit.") ||
    eventType.startsWith("storage_limit.") ||
    eventType === "payment_failed"
  )
    return "billing";
  return "system";
}

const ERROR_EVENTS = new Set([
  "budget.over_budget",
  "resource.overbooked",
  "invoice.overdue",
  "export.failed",
  "ai.embedding_failed",
  "payment_failed",
  "organization.suspended",
  "system.alert",
  "storage_limit.warning",
  "seat_limit.warning",
]);

const WARNING_EVENTS = new Set(["certification.expiring", "subscription.expiring"]);

const SUCCESS_EVENTS = new Set([
  "submittal.approved",
  "rfi.closed",
  "ncr.closed",
  "timesheet.approved",
  "leave.approved",
  "invoice.paid",
  "change_order.approved",
  "expense.approved",
  "user.joined",
  "export.completed",
]);

export function getEventSeverity(eventType: string): NotificationSeverity {
  if (ERROR_EVENTS.has(eventType)) return "error";
  if (WARNING_EVENTS.has(eventType)) return "warning";
  if (SUCCESS_EVENTS.has(eventType)) return "success";
  return "info";
}

/** Map category to Lucide icon name used in the ActivityFeed. */
export function getCategoryIcon(category: NotificationCategory): string {
  const map: Record<NotificationCategory, string> = {
    project: "FolderKanban",
    document: "FileText",
    submittal: "ClipboardCheck",
    rfi: "MessageSquare",
    ncr: "AlertTriangle",
    resource: "Users",
    timesheet: "Clock",
    financial: "DollarSign",
    user: "UserCheck",
    system: "Settings",
    client: "Building2",
    ai: "Sparkles",
    report: "BarChart3",
    meeting: "Calendar",
    electrical: "Zap",
    billing: "CreditCard",
  };
  return map[category] ?? "Bell";
}

/** Returns a tailwind text-color class for a severity. */
export function getSeverityColor(severity: NotificationSeverity): string {
  switch (severity) {
    case "success":
      return "text-green-600";
    case "warning":
      return "text-amber-600";
    case "error":
      return "text-red-600";
    default:
      return "text-blue-600";
  }
}

/** Returns a tailwind bg-color class for a priority badge. */
export function getPriorityColor(priority: NotificationPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "low":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

// ─── Human-friendly relative time ─────────────────────────────────────────────

export function toRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Snooze presets ────────────────────────────────────────────────────────────

export const SNOOZE_PRESETS = [
  { label: "1 hour", getDate: () => new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  { label: "4 hours", getDate: () => new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() },
  {
    label: "Tomorrow 9 am",
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    },
  },
  {
    label: "Next week",
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    },
  },
] as const;
