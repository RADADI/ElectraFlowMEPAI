/**
 * Phase 15A: Meeting UI view types.
 */

import type {
  Meeting,
  MeetingStatus,
  MeetingType,
  MeetingVisibility,
  MeetingAttendee,
  AttendeeRole,
  AttendeeResponseStatus,
  MeetingActionItem,
  ActionItemStatus,
  ActionItemPriority,
} from "./database";

export type {
  MeetingStatus,
  MeetingType,
  MeetingVisibility,
  AttendeeRole,
  AttendeeResponseStatus,
  ActionItemStatus,
  ActionItemPriority,
};

// ─── List / detail views ──────────────────────────────────────────────────────

export interface MeetingListItemView {
  id: string;
  organization_id: string;
  project_id: string | null;
  project_name: string | null;
  title: string;
  meeting_type: MeetingType;
  status: MeetingStatus;
  visibility: MeetingVisibility;
  scheduled_start: string;
  scheduled_end: string;
  location: string | null;
  attendee_count: number;
  open_actions_count: number;
  overdue_actions_count: number;
  has_today_badge: boolean;
  chair_name: string | null;
  created_by_name: string | null;
}

export interface MeetingView extends Meeting {
  project_name: string | null;
  chair_name: string | null;
  created_by_name: string | null;
}

export interface MeetingAttendeeView extends MeetingAttendee {
  display_name: string;
  display_email: string | null;
  is_external: boolean;
  is_deactivated: boolean;
}

export interface MeetingActionView extends MeetingActionItem {
  assignee_name: string | null;
  is_deactivated_assignee: boolean;
  /** Computed at read time — not persisted. */
  is_overdue: boolean;
  display_status: ActionItemStatus | "overdue";
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface MeetingFilterInput {
  status?: MeetingStatus | "all";
  project_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  mine_only?: boolean;
  include_archived?: boolean;
  cursor?: string;
  limit?: number;
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface MeetingCreateInput {
  title: string;
  meeting_type?: MeetingType;
  status?: MeetingStatus;
  visibility?: MeetingVisibility;
  project_id?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  location?: string | null;
  video_link?: string | null;
  agenda?: string | null;
  minutes?: string | null;
  chair_profile_id?: string | null;
}

export interface MeetingUpdateInput {
  title?: string;
  meeting_type?: MeetingType;
  status?: MeetingStatus;
  visibility?: MeetingVisibility;
  project_id?: string | null;
  scheduled_start?: string;
  scheduled_end?: string;
  location?: string | null;
  video_link?: string | null;
  agenda?: string | null;
  minutes?: string | null;
  chair_profile_id?: string | null;
}

export interface AttendeeCreateInput {
  profile_id?: string | null;
  external_name?: string | null;
  external_email?: string | null;
  role?: AttendeeRole;
  response_status?: AttendeeResponseStatus;
}

export interface ActionItemCreateInput {
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  priority?: ActionItemPriority;
  project_id?: string | null;
}

export interface ActionItemUpdateInput {
  title?: string;
  description?: string | null;
  assigned_to?: string | null;
  due_date?: string | null;
  status?: ActionItemStatus;
  priority?: ActionItemPriority;
}

export interface CompleteMeetingInput {
  /** Set true after user confirms completing without minutes. */
  skip_minutes_warning?: boolean;
}

// ─── Timeline (audit + activity merged) ───────────────────────────────────────

export type MeetingTimelineSource = "audit" | "activity";

export interface MeetingTimelineItem {
  id: string;
  source: MeetingTimelineSource;
  created_at: string;
  actor_name: string;
  title: string;
  message: string | null;
  event_type: string;
}

// ─── Status display ───────────────────────────────────────────────────────────

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

export const MEETING_STATUS_CLASS: Record<MeetingStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-600",
};

export const ACTION_STATUS_LABEL: Record<ActionItemStatus | "overdue", string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

export function computeActionOverdue(status: ActionItemStatus, due_date: string | null): boolean {
  if (!due_date) return false;
  if (status !== "open" && status !== "in_progress") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(due_date + "T00:00:00");
  return due < today;
}

export function getActionDisplayStatus(
  status: ActionItemStatus,
  due_date: string | null,
): ActionItemStatus | "overdue" {
  return computeActionOverdue(status, due_date) ? "overdue" : status;
}
