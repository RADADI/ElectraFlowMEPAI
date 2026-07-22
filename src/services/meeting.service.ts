/**
 * Meeting service — Phase 15A
 *
 * Full Supabase CRUD with status-transition workflow, attendees, action items,
 * audit logging, activity events, and notification fan-out (actor excluded).
 * Falls back to mock when Supabase is not configured or JWT is not ready.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext, getCurrentUserId } from "@/lib/auth-bridge";
import {
  dummyMeetings,
  dummyMeetingAttendees,
  dummyMeetingActionItems,
  MOCK_PROFILE_NAMES,
  projects,
} from "@/lib/dummy-data";
import { logAction, listAuditLogsForResource } from "@/services/audit.service";
import { createActivityEvent, listActivityEvents } from "@/services/activity.service";
import { notifyUsers } from "@/services/notification.service";
import { EVENT_TYPES } from "@/types/notification-view";
import { encodeCursor, decodeCursor, type CursorPage } from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  Meeting,
  MeetingStatus,
  ActionItemStatus,
  MeetingAttendee,
  MeetingActionItem,
} from "@/types/database";
import type {
  MeetingListItemView,
  MeetingView,
  MeetingAttendeeView,
  MeetingActionView,
  MeetingFilterInput,
  MeetingCreateInput,
  MeetingUpdateInput,
  AttendeeCreateInput,
  ActionItemCreateInput,
  ActionItemUpdateInput,
  CompleteMeetingInput,
  MeetingTimelineItem,
} from "@/types/meeting-view";
import { computeActionOverdue, getActionDisplayStatus } from "@/types/meeting-view";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const RESOURCE_TYPE = "meetings";

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT is not ready — using mock meetings.");
    return false;
  }
  return true;
}

function getDb() {
  if (!supabase) throw new Error("Supabase unavailable");
  return supabase;
}

// ─── Status transition validators ─────────────────────────────────────────────

const MEETING_TRANSITIONS: Partial<Record<MeetingStatus, MeetingStatus[]>> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["completed", "cancelled", "draft"],
  completed: ["archived"],
  cancelled: ["archived", "draft"],
  archived: [],
};

const ACTION_TRANSITIONS: Partial<Record<ActionItemStatus, ActionItemStatus[]>> = {
  open: ["in_progress", "completed", "cancelled"],
  in_progress: ["open", "completed", "cancelled"],
  completed: ["open", "in_progress"],
  cancelled: ["open"],
};

function validateMeetingTransition(from: MeetingStatus, to: MeetingStatus): string | null {
  if (from === to) return null;
  const allowed = MEETING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return `Cannot transition meeting from "${from}" to "${to}".`;
  }
  return null;
}

function validateActionTransition(from: ActionItemStatus, to: ActionItemStatus): string | null {
  if (from === to) return null;
  const allowed = ACTION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return `Cannot transition action item from "${from}" to "${to}".`;
  }
  return null;
}

// ─── Mock stores ──────────────────────────────────────────────────────────────

let MOCK_MEETINGS: Meeting[] = [...dummyMeetings];
let MOCK_ATTENDEES: MeetingAttendee[] = [...dummyMeetingAttendees];
let MOCK_ACTIONS: MeetingActionItem[] = [...dummyMeetingActionItems];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function projectName(projectId: string | null): string | null {
  if (!projectId) return null;
  return projects.find((p) => p.id === projectId)?.name ?? null;
}

function profileName(profileId: string | null): string | null {
  if (!profileId) return null;
  return MOCK_PROFILE_NAMES[profileId] ?? "Former User";
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function validateSchedule(start: string, end: string): string | null {
  if (new Date(end) <= new Date(start)) {
    return "Meeting end time must be after start time.";
  }
  return null;
}

function toAttendeeView(a: MeetingAttendee): MeetingAttendeeView {
  const isExternal = !a.profile_id;
  return {
    ...a,
    display_name: isExternal
      ? (a.external_name ?? "External")
      : (profileName(a.profile_id) ?? "Former User"),
    display_email: isExternal ? a.external_email : null,
    is_external: isExternal,
    is_deactivated: !isExternal && !!a.profile_id && !MOCK_PROFILE_NAMES[a.profile_id],
  };
}

function toActionView(a: MeetingActionItem): MeetingActionView {
  const isOverdue = computeActionOverdue(a.status, a.due_date);
  return {
    ...a,
    assignee_name: profileName(a.assigned_to),
    is_deactivated_assignee: !!a.assigned_to && !MOCK_PROFILE_NAMES[a.assigned_to],
    is_overdue: isOverdue,
    display_status: getActionDisplayStatus(a.status, a.due_date),
  };
}

function toListItem(m: Meeting): MeetingListItemView {
  const attendees = MOCK_ATTENDEES.filter((a) => a.meeting_id === m.id && !a.deleted_at);
  const actions = MOCK_ACTIONS.filter(
    (a) =>
      a.meeting_id === m.id &&
      !a.deleted_at &&
      a.status !== "completed" &&
      a.status !== "cancelled",
  );
  const overdue = actions.filter((a) => computeActionOverdue(a.status, a.due_date));

  return {
    id: m.id,
    organization_id: m.organization_id,
    project_id: m.project_id,
    project_name: projectName(m.project_id),
    title: m.title,
    meeting_type: m.meeting_type,
    status: m.status,
    visibility: m.visibility,
    scheduled_start: m.scheduled_start,
    scheduled_end: m.scheduled_end,
    location: m.location,
    attendee_count: attendees.length,
    open_actions_count: actions.length,
    overdue_actions_count: overdue.length,
    has_today_badge: isToday(m.scheduled_start),
    chair_name: profileName(m.chair_profile_id),
    created_by_name: profileName(m.created_by),
  };
}

async function getActorProfileId(): Promise<string | null> {
  return getCurrentUserId();
}

async function getAttendeeProfileIds(meetingId: string): Promise<string[]> {
  if (shouldUseSupabase() && supabase) {
    const { data } = await getDb()
      .from("meeting_attendees")
      .select("profile_id")
      .eq("meeting_id", meetingId)
      .is("deleted_at", null)
      .not("profile_id", "is", null);
    return (data ?? []).map((r) => r.profile_id as string);
  }
  return MOCK_ATTENDEES.filter(
    (a) => a.meeting_id === meetingId && !a.deleted_at && a.profile_id,
  ).map((a) => a.profile_id as string);
}

async function emitMeetingEvent(
  meeting: Meeting,
  eventType: string,
  title: string,
  message: string,
  recipientIds: string[],
  actorId: string | null,
): Promise<void> {
  const visibility = meeting.visibility === "client_visible" ? "client_visible" : "internal";
  await createActivityEvent({
    event_type: eventType,
    entity_type: RESOURCE_TYPE,
    entity_id: meeting.id,
    entity_label: meeting.title,
    message,
    category: "meeting",
    visibility,
    actor_profile_id: actorId,
  });
  await notifyUsers(recipientIds, {
    event_type: eventType,
    title,
    message,
    entity_type: RESOURCE_TYPE,
    entity_id: meeting.id,
    route: `/meetings/${meeting.id}`,
    category: "meeting",
    actor_profile_id: actorId,
  });
}

// ─── listMeetings ─────────────────────────────────────────────────────────────

export async function listMeetings(
  filters: MeetingFilterInput = {},
): Promise<ServiceResult<CursorPage<MeetingListItemView>>> {
  const limit = filters.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    let items = MOCK_MEETINGS.filter((m) => !m.deleted_at);

    if (!filters.include_archived) {
      items = items.filter((m) => m.status !== "archived");
    }
    if (filters.status && filters.status !== "all") {
      items = items.filter((m) => m.status === filters.status);
    }
    if (filters.project_id) {
      items = items.filter((m) => m.project_id === filters.project_id);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      items = items.filter((m) => m.title.toLowerCase().includes(term));
    }
    if (filters.date_from) {
      items = items.filter((m) => m.scheduled_start >= filters.date_from!);
    }
    if (filters.date_to) {
      items = items.filter((m) => m.scheduled_start <= filters.date_to! + "T23:59:59");
    }
    if (filters.mine_only) {
      const profileId = await getActorProfileId();
      items = items.filter(
        (m) =>
          m.created_by === profileId ||
          m.chair_profile_id === profileId ||
          MOCK_ATTENDEES.some(
            (a) => a.meeting_id === m.id && a.profile_id === profileId && !a.deleted_at,
          ),
      );
    }

    items.sort(
      (a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
    );

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((m) => m.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }

    const page = items.slice(0, limit);
    const views = page.map(toListItem);
    const next_cursor =
      items.length > limit
        ? encodeCursor(page[page.length - 1].scheduled_start, page[page.length - 1].id)
        : null;

    return mockOk({ items: views, next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("meetings")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("scheduled_start", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (!filters.include_archived) q = q.neq("status", "archived");
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.project_id) q = q.eq("project_id", filters.project_id);
    if (filters.search) q = q.ilike("title", `%${filters.search}%`);
    if (filters.date_from) q = q.gte("scheduled_start", filters.date_from);
    if (filters.date_to) q = q.lte("scheduled_start", filters.date_to + "T23:59:59");

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `scheduled_start.lt.${decoded.created_at},and(scheduled_start.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as Meeting[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const views: MeetingListItemView[] = await Promise.all(
      page.map(async (m) => {
        const [{ count: attendeeCount }, { data: actions }] = await Promise.all([
          getDb()
            .from("meeting_attendees")
            .select("*", { count: "exact", head: true })
            .eq("meeting_id", m.id)
            .is("deleted_at", null),
          getDb()
            .from("meeting_action_items")
            .select("status, due_date")
            .eq("meeting_id", m.id)
            .is("deleted_at", null)
            .in("status", ["open", "in_progress"]),
        ]);

        const openActions = actions ?? [];
        const overdueCount = openActions.filter((a) =>
          computeActionOverdue(a.status as ActionItemStatus, a.due_date),
        ).length;

        let chairName: string | null = null;
        let createdByName: string | null = null;
        if (m.chair_profile_id || m.created_by) {
          const ids = [m.chair_profile_id, m.created_by].filter(Boolean) as string[];
          const { data: profiles } = await getDb()
            .from("profiles")
            .select("id, full_name")
            .in("id", ids);
          const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
          chairName = m.chair_profile_id ? (map.get(m.chair_profile_id) ?? null) : null;
          createdByName = m.created_by ? (map.get(m.created_by) ?? null) : null;
        }

        let project_name: string | null = null;
        if (m.project_id) {
          const { data: proj } = await getDb()
            .from("projects")
            .select("name")
            .eq("id", m.project_id)
            .maybeSingle();
          project_name = proj?.name ?? null;
        }

        return {
          id: m.id,
          organization_id: m.organization_id,
          project_id: m.project_id,
          project_name,
          title: m.title,
          meeting_type: m.meeting_type,
          status: m.status,
          visibility: m.visibility,
          scheduled_start: m.scheduled_start,
          scheduled_end: m.scheduled_end,
          location: m.location,
          attendee_count: attendeeCount ?? 0,
          open_actions_count: openActions.length,
          overdue_actions_count: overdueCount,
          has_today_badge: isToday(m.scheduled_start),
          chair_name: chairName,
          created_by_name: createdByName,
        };
      }),
    );

    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].scheduled_start, page[page.length - 1].id)
        : null;

    return ok({ items: views, next_cursor });
  } catch (err) {
    return fail(err);
  }
}

// ─── getMeeting ───────────────────────────────────────────────────────────────

export async function getMeeting(id: string): Promise<ServiceResult<MeetingView>> {
  if (!shouldUseSupabase()) {
    const m = MOCK_MEETINGS.find((x) => x.id === id && !x.deleted_at);
    if (!m) return fail({ message: "Meeting not found.", code: "NOT_FOUND" });
    return mockOk({
      ...m,
      project_name: projectName(m.project_id),
      chair_name: profileName(m.chair_profile_id),
      created_by_name: profileName(m.created_by),
    });
  }

  try {
    const { data, error } = await getDb()
      .from("meetings")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail(error);
    if (!data) return fail({ message: "Meeting not found.", code: "NOT_FOUND" });

    const m = data as Meeting;
    let project_name: string | null = null;
    let chair_name: string | null = null;
    let created_by_name: string | null = null;

    if (m.project_id) {
      const { data: proj } = await getDb()
        .from("projects")
        .select("name")
        .eq("id", m.project_id)
        .maybeSingle();
      project_name = proj?.name ?? null;
    }

    const profileIds = [m.chair_profile_id, m.created_by].filter(Boolean) as string[];
    if (profileIds.length) {
      const { data: profiles } = await getDb()
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
      chair_name = m.chair_profile_id ? (map.get(m.chair_profile_id) ?? "Former User") : null;
      created_by_name = m.created_by ? (map.get(m.created_by) ?? "Former User") : null;
    }

    return ok({ ...m, project_name, chair_name, created_by_name });
  } catch (err) {
    return fail(err);
  }
}

// ─── listMeetingAttendees ─────────────────────────────────────────────────────

export async function listMeetingAttendees(
  meetingId: string,
): Promise<ServiceResult<MeetingAttendeeView[]>> {
  if (!shouldUseSupabase()) {
    const items = MOCK_ATTENDEES.filter((a) => a.meeting_id === meetingId && !a.deleted_at).map(
      toAttendeeView,
    );
    return mockOk(items);
  }

  try {
    const { data, error } = await getDb()
      .from("meeting_attendees")
      .select("*")
      .eq("meeting_id", meetingId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) return fail(error);

    const rows = (data ?? []) as MeetingAttendee[];
    const profileIds = rows.map((r) => r.profile_id).filter(Boolean) as string[];
    let nameMap = new Map<string, string>();

    if (profileIds.length) {
      const { data: profiles } = await getDb()
        .from("profiles")
        .select("id, full_name, is_active")
        .in("id", profileIds);
      nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
    }

    const views: MeetingAttendeeView[] = rows.map((a) => {
      const isExternal = !a.profile_id;
      return {
        ...a,
        display_name: isExternal
          ? (a.external_name ?? "External")
          : (nameMap.get(a.profile_id!) ?? "Former User"),
        display_email: isExternal ? a.external_email : null,
        is_external: isExternal,
        is_deactivated: !isExternal && !!a.profile_id && !nameMap.has(a.profile_id),
      };
    });

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

// ─── listMeetingActions ───────────────────────────────────────────────────────

export async function listMeetingActions(
  meetingId: string,
): Promise<ServiceResult<MeetingActionView[]>> {
  if (!shouldUseSupabase()) {
    const items = MOCK_ACTIONS.filter((a) => a.meeting_id === meetingId && !a.deleted_at).map(
      toActionView,
    );
    return mockOk(items);
  }

  try {
    const { data, error } = await getDb()
      .from("meeting_action_items")
      .select("*")
      .eq("meeting_id", meetingId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) return fail(error);

    const rows = (data ?? []) as MeetingActionItem[];
    const assigneeIds = rows.map((r) => r.assigned_to).filter(Boolean) as string[];
    let nameMap = new Map<string, string>();

    if (assigneeIds.length) {
      const { data: profiles } = await getDb()
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
    }

    const views = rows.map((a) => {
      const isOverdue = computeActionOverdue(a.status, a.due_date);
      return {
        ...a,
        assignee_name: a.assigned_to ? (nameMap.get(a.assigned_to) ?? "Former User") : null,
        is_deactivated_assignee: !!a.assigned_to && !nameMap.has(a.assigned_to),
        is_overdue: isOverdue,
        display_status: getActionDisplayStatus(a.status, a.due_date),
      };
    });

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

// ─── getMeetingTimeline ───────────────────────────────────────────────────────

export async function getMeetingTimeline(
  meetingId: string,
): Promise<ServiceResult<MeetingTimelineItem[]>> {
  const [auditRes, activityRes] = await Promise.all([
    listAuditLogsForResource(RESOURCE_TYPE, meetingId, 50),
    listActivityEvents({ entity_type: RESOURCE_TYPE, entity_id: meetingId, limit: 50 }),
  ]);

  const auditItems: MeetingTimelineItem[] = (auditRes.data ?? []).map((l) => ({
    id: `audit-${l.id}`,
    source: "audit" as const,
    created_at: l.created_at,
    actor_name: l.user_id ?? "System",
    title: l.action.replace(/\./g, " ").replace(/_/g, " "),
    message: l.resource_id ? `Resource: ${l.resource_id}` : null,
    event_type: l.action,
  }));

  const activityItems: MeetingTimelineItem[] = (activityRes.data?.items ?? []).map((e) => ({
    id: `activity-${e.id}`,
    source: "activity" as const,
    created_at: e.created_at,
    actor_name: e.actor_profile_id ?? "System",
    title: e.event_type.replace(/\./g, " ").replace(/_/g, " "),
    message: e.message,
    event_type: e.event_type,
  }));

  const merged = [...auditItems, ...activityItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return auditRes.isMockData || activityRes.isMockData ? mockOk(merged) : ok(merged);
}

// ─── createMeeting ────────────────────────────────────────────────────────────

export async function createMeeting(
  input: MeetingCreateInput,
): Promise<ServiceResult<MeetingView>> {
  const scheduleErr = validateSchedule(input.scheduled_start, input.scheduled_end);
  if (scheduleErr) return fail(scheduleErr);

  const actorId = await getActorProfileId();
  const { organizationId } = getSessionContext();
  const orgId = organizationId ?? "mock-org";

  const row: Meeting = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    project_id: input.project_id ?? null,
    title: input.title.trim(),
    meeting_type: input.meeting_type ?? "coordination",
    status: input.status ?? "draft",
    visibility: input.visibility ?? "internal",
    scheduled_start: input.scheduled_start,
    scheduled_end: input.scheduled_end,
    location: input.location ?? null,
    video_link: input.video_link ?? null,
    agenda: input.agenda ?? null,
    minutes: input.minutes ?? null,
    cancel_reason: null,
    created_by: actorId,
    chair_profile_id: input.chair_profile_id ?? actorId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  if (!shouldUseSupabase()) {
    MOCK_MEETINGS.unshift(row);
    await logAction({
      action: "meeting.created",
      resource_type: RESOURCE_TYPE,
      resource_id: row.id,
      new_data: { title: row.title, status: row.status },
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.MEETING_CREATED,
      entity_type: RESOURCE_TYPE,
      entity_id: row.id,
      entity_label: row.title,
      message: `"${row.title}" was created.`,
      category: "meeting",
      visibility: row.visibility === "client_visible" ? "client_visible" : "internal",
      actor_profile_id: actorId,
    });
    return mockOk({
      ...row,
      project_name: projectName(row.project_id),
      chair_name: profileName(row.chair_profile_id),
      created_by_name: profileName(row.created_by),
    });
  }

  if (!organizationId) return fail("No active session.");

  try {
    const insert = {
      organization_id: organizationId,
      project_id: input.project_id ?? null,
      title: input.title.trim(),
      meeting_type: input.meeting_type ?? "coordination",
      status: input.status ?? "draft",
      visibility: input.visibility ?? "internal",
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
      location: input.location ?? null,
      video_link: input.video_link ?? null,
      agenda: input.agenda ?? null,
      minutes: input.minutes ?? null,
      created_by: actorId,
      chair_profile_id: input.chair_profile_id ?? actorId,
    };

    const { data, error } = await getDb().from("meetings").insert(insert).select().single();
    if (error) return fail(error);

    const meeting = data as Meeting;
    await logAction({
      action: "meeting.created",
      resource_type: RESOURCE_TYPE,
      resource_id: meeting.id,
      new_data: { title: meeting.title, status: meeting.status },
    });

    const recipientIds = meeting.chair_profile_id ? [meeting.chair_profile_id] : [];
    await emitMeetingEvent(
      meeting,
      EVENT_TYPES.MEETING_CREATED,
      "Meeting created",
      `"${meeting.title}" was scheduled.`,
      recipientIds,
      actorId,
    );

    return getMeeting(meeting.id);
  } catch (err) {
    return fail(err);
  }
}

// ─── updateMeeting ────────────────────────────────────────────────────────────

export async function updateMeeting(
  id: string,
  input: MeetingUpdateInput,
): Promise<ServiceResult<MeetingView>> {
  const existingRes = await getMeeting(id);
  if (existingRes.error || !existingRes.data)
    return fail(existingRes.error ?? "Meeting not found.");
  const existing = existingRes.data;

  if (existing.status === "archived") {
    return fail("Archived meetings cannot be edited.");
  }

  if (input.status && input.status !== existing.status) {
    const tErr = validateMeetingTransition(existing.status, input.status);
    if (tErr) return fail(tErr);
  }

  const start = input.scheduled_start ?? existing.scheduled_start;
  const end = input.scheduled_end ?? existing.scheduled_end;
  const scheduleErr = validateSchedule(start, end);
  if (scheduleErr) return fail(scheduleErr);

  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const idx = MOCK_MEETINGS.findIndex((m) => m.id === id);
    if (idx === -1) return fail("Meeting not found.");
    MOCK_MEETINGS[idx] = {
      ...MOCK_MEETINGS[idx],
      ...input,
      scheduled_start: start,
      scheduled_end: end,
      updated_at: new Date().toISOString(),
    };
    const updated = MOCK_MEETINGS[idx];
    await logAction({
      action: "meeting.updated",
      resource_type: RESOURCE_TYPE,
      resource_id: id,
      old_data: { status: existing.status },
      new_data: input as Record<string, unknown>,
    });
    const attendeeIds = await getAttendeeProfileIds(id);
    await emitMeetingEvent(
      updated,
      EVENT_TYPES.MEETING_UPDATED,
      "Meeting updated",
      `"${updated.title}" was updated.`,
      attendeeIds,
      actorId,
    );
    return getMeeting(id);
  }

  try {
    const { error } = await getDb()
      .from("meetings")
      .update({ ...input, scheduled_start: start, scheduled_end: end })
      .eq("id", id);

    if (error) return fail(error);

    await logAction({
      action: "meeting.updated",
      resource_type: RESOURCE_TYPE,
      resource_id: id,
      old_data: { status: existing.status },
      new_data: input as Record<string, unknown>,
    });

    const attendeeIds = await getAttendeeProfileIds(id);
    const meetingRes = await getMeeting(id);
    if (meetingRes.data) {
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_UPDATED,
        "Meeting updated",
        `"${meetingRes.data.title}" was updated.`,
        attendeeIds,
        actorId,
      );
    }

    return getMeeting(id);
  } catch (err) {
    return fail(err);
  }
}

// ─── completeMeeting ──────────────────────────────────────────────────────────

export async function completeMeeting(
  id: string,
  opts: CompleteMeetingInput = {},
): Promise<ServiceResult<MeetingView>> {
  const existingRes = await getMeeting(id);
  if (existingRes.error || !existingRes.data)
    return fail(existingRes.error ?? "Meeting not found.");
  const existing = existingRes.data;

  const tErr = validateMeetingTransition(existing.status, "completed");
  if (tErr) return fail(tErr);

  const minutesEmpty = !existing.minutes?.trim();
  if (minutesEmpty && !opts.skip_minutes_warning) {
    return fail({
      message: "Meeting has no minutes recorded. Confirm to complete anyway.",
      code: "MINUTES_REQUIRED",
    });
  }

  return updateMeeting(id, { status: "completed" });
}

// ─── cancelMeeting ────────────────────────────────────────────────────────────

export async function cancelMeeting(
  id: string,
  reason?: string,
): Promise<ServiceResult<MeetingView>> {
  const existingRes = await getMeeting(id);
  if (existingRes.error || !existingRes.data)
    return fail(existingRes.error ?? "Meeting not found.");
  const existing = existingRes.data;

  const tErr = validateMeetingTransition(existing.status, "cancelled");
  if (tErr) return fail(tErr);

  const actorId = await getActorProfileId();

  if (!shouldUseSupabase()) {
    const idx = MOCK_MEETINGS.findIndex((m) => m.id === id);
    if (idx === -1) return fail("Meeting not found.");
    MOCK_MEETINGS[idx] = {
      ...MOCK_MEETINGS[idx],
      status: "cancelled",
      cancel_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    };
    await logAction({
      action: "meeting.cancelled",
      resource_type: RESOURCE_TYPE,
      resource_id: id,
      new_data: { reason },
    });
    const attendeeIds = await getAttendeeProfileIds(id);
    await emitMeetingEvent(
      MOCK_MEETINGS[idx],
      EVENT_TYPES.MEETING_CANCELLED,
      "Meeting cancelled",
      `"${existing.title}" was cancelled.`,
      attendeeIds,
      actorId,
    );
    return getMeeting(id);
  }

  try {
    const { error } = await getDb()
      .from("meetings")
      .update({ status: "cancelled", cancel_reason: reason ?? null })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "meeting.cancelled",
      resource_type: RESOURCE_TYPE,
      resource_id: id,
      new_data: { reason },
    });

    const attendeeIds = await getAttendeeProfileIds(id);
    const meetingRes = await getMeeting(id);
    if (meetingRes.data) {
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_CANCELLED,
        "Meeting cancelled",
        `"${meetingRes.data.title}" was cancelled.`,
        attendeeIds,
        actorId,
      );
    }

    return getMeeting(id);
  } catch (err) {
    return fail(err);
  }
}

// ─── archiveMeeting ───────────────────────────────────────────────────────────

export async function archiveMeeting(id: string): Promise<ServiceResult<MeetingView>> {
  const existingRes = await getMeeting(id);
  if (existingRes.error || !existingRes.data)
    return fail(existingRes.error ?? "Meeting not found.");
  const existing = existingRes.data;

  const tErr = validateMeetingTransition(existing.status, "archived");
  if (tErr && existing.status !== "archived") {
    // Allow archive from completed or cancelled only
    if (!["completed", "cancelled"].includes(existing.status)) {
      return fail(tErr);
    }
  }

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const idx = MOCK_MEETINGS.findIndex((m) => m.id === id);
    if (idx === -1) return fail("Meeting not found.");
    MOCK_MEETINGS[idx] = { ...MOCK_MEETINGS[idx], status: "archived", updated_at: now };
    MOCK_ACTIONS = MOCK_ACTIONS.map((a) => (a.meeting_id === id ? { ...a, deleted_at: now } : a));
    await logAction({
      action: "meeting.archived",
      resource_type: RESOURCE_TYPE,
      resource_id: id,
    });
    return getMeeting(id);
  }

  try {
    const { error } = await getDb().from("meetings").update({ status: "archived" }).eq("id", id);
    if (error) return fail(error);

    await getDb()
      .from("meeting_action_items")
      .update({ deleted_at: now })
      .eq("meeting_id", id)
      .is("deleted_at", null);

    await logAction({
      action: "meeting.archived",
      resource_type: RESOURCE_TYPE,
      resource_id: id,
    });

    void actorId;
    return getMeeting(id);
  } catch (err) {
    return fail(err);
  }
}

// ─── addAttendee ──────────────────────────────────────────────────────────────

export async function addAttendee(
  meetingId: string,
  input: AttendeeCreateInput,
): Promise<ServiceResult<MeetingAttendeeView>> {
  const meetingRes = await getMeeting(meetingId);
  if (meetingRes.error || !meetingRes.data) return fail("Meeting not found.");
  if (meetingRes.data.status === "archived") return fail("Cannot modify archived meeting.");

  const isInternal = !!input.profile_id;
  if (!isInternal && (!input.external_name || !input.external_email)) {
    return fail("External attendees require name and email.");
  }

  const { organizationId } = getSessionContext();
  const orgId = organizationId ?? "mock-org";

  if (!shouldUseSupabase()) {
    if (isInternal) {
      const dup = MOCK_ATTENDEES.find(
        (a) => a.meeting_id === meetingId && a.profile_id === input.profile_id && !a.deleted_at,
      );
      if (dup) return fail("Attendee already added.");
    }
    const row: MeetingAttendee = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      meeting_id: meetingId,
      profile_id: input.profile_id ?? null,
      external_name: input.external_name ?? null,
      external_email: input.external_email ?? null,
      role: input.role ?? "attendee",
      response_status: input.response_status ?? "pending",
      attended: false,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    MOCK_ATTENDEES.push(row);
    await logAction({
      action: "meeting.attendee_added",
      resource_type: RESOURCE_TYPE,
      resource_id: meetingId,
      new_data: { attendee_id: row.id },
    });
    return mockOk(toAttendeeView(row));
  }

  try {
    const insert = {
      organization_id: organizationId,
      meeting_id: meetingId,
      profile_id: input.profile_id ?? null,
      external_name: input.external_name ?? null,
      external_email: input.external_email ?? null,
      role: input.role ?? "attendee",
      response_status: input.response_status ?? "pending",
    };

    const { data, error } = await getDb()
      .from("meeting_attendees")
      .insert(insert)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return fail("Attendee already added.");
      return fail(error);
    }

    await logAction({
      action: "meeting.attendee_added",
      resource_type: RESOURCE_TYPE,
      resource_id: meetingId,
      new_data: { attendee_id: (data as MeetingAttendee).id },
    });

    const views = await listMeetingAttendees(meetingId);
    const found = views.data?.find((a) => a.id === (data as MeetingAttendee).id);
    return found ? ok(found) : fail("Attendee created but not found.");
  } catch (err) {
    return fail(err);
  }
}

// ─── removeAttendee ───────────────────────────────────────────────────────────

export async function removeAttendee(attendeeId: string): Promise<ServiceResult<boolean>> {
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const idx = MOCK_ATTENDEES.findIndex((a) => a.id === attendeeId && !a.deleted_at);
    if (idx === -1) return fail("Attendee not found.");
    const meetingId = MOCK_ATTENDEES[idx].meeting_id;
    MOCK_ATTENDEES[idx] = { ...MOCK_ATTENDEES[idx], deleted_at: now };
    await logAction({
      action: "meeting.attendee_removed",
      resource_type: RESOURCE_TYPE,
      resource_id: meetingId,
    });
    return mockOk(true);
  }

  try {
    const { data: existing } = await getDb()
      .from("meeting_attendees")
      .select("meeting_id")
      .eq("id", attendeeId)
      .maybeSingle();

    const { error } = await getDb()
      .from("meeting_attendees")
      .update({ deleted_at: now })
      .eq("id", attendeeId);

    if (error) return fail(error);

    if (existing?.meeting_id) {
      await logAction({
        action: "meeting.attendee_removed",
        resource_type: RESOURCE_TYPE,
        resource_id: existing.meeting_id as string,
      });
    }

    return ok(true);
  } catch (err) {
    return fail(err);
  }
}

// ─── addActionItem ────────────────────────────────────────────────────────────

export async function addActionItem(
  meetingId: string,
  input: ActionItemCreateInput,
): Promise<ServiceResult<MeetingActionView>> {
  const meetingRes = await getMeeting(meetingId);
  if (meetingRes.error || !meetingRes.data) return fail("Meeting not found.");
  if (meetingRes.data.status === "archived") return fail("Cannot modify archived meeting.");

  const actorId = await getActorProfileId();
  const { organizationId } = getSessionContext();
  const orgId = organizationId ?? "mock-org";

  const row: MeetingActionItem = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    meeting_id: meetingId,
    project_id: input.project_id ?? meetingRes.data.project_id,
    title: input.title.trim(),
    description: input.description ?? null,
    assigned_to: input.assigned_to ?? null,
    due_date: input.due_date ?? null,
    status: "open",
    priority: input.priority ?? "normal",
    completed_at: null,
    completed_by: null,
    created_by: actorId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  if (!shouldUseSupabase()) {
    MOCK_ACTIONS.push(row);
    await logAction({
      action: "meeting.action_created",
      resource_type: RESOURCE_TYPE,
      resource_id: meetingId,
      new_data: { action_id: row.id, title: row.title },
    });
    if (row.assigned_to) {
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_ACTION_ASSIGNED,
        "Action item assigned",
        `You were assigned: "${row.title}"`,
        [row.assigned_to],
        actorId,
      );
    }
    return mockOk(toActionView(row));
  }

  try {
    const { data, error } = await getDb()
      .from("meeting_action_items")
      .insert({
        organization_id: organizationId,
        meeting_id: meetingId,
        project_id: input.project_id ?? meetingRes.data.project_id,
        title: input.title.trim(),
        description: input.description ?? null,
        assigned_to: input.assigned_to ?? null,
        due_date: input.due_date ?? null,
        priority: input.priority ?? "normal",
        created_by: actorId,
      })
      .select()
      .single();

    if (error) return fail(error);

    const action = data as MeetingActionItem;
    await logAction({
      action: "meeting.action_created",
      resource_type: RESOURCE_TYPE,
      resource_id: meetingId,
      new_data: { action_id: action.id, title: action.title },
    });

    if (action.assigned_to) {
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_ACTION_ASSIGNED,
        "Action item assigned",
        `You were assigned: "${action.title}"`,
        [action.assigned_to],
        actorId,
      );
    }

    const views = await listMeetingActions(meetingId);
    const found = views.data?.find((a) => a.id === action.id);
    return found ? ok(found) : fail("Action created but not found.");
  } catch (err) {
    return fail(err);
  }
}

// ─── updateActionItem ─────────────────────────────────────────────────────────

export async function updateActionItem(
  id: string,
  input: ActionItemUpdateInput,
): Promise<ServiceResult<MeetingActionView>> {
  if (!shouldUseSupabase()) {
    const idx = MOCK_ACTIONS.findIndex((a) => a.id === id && !a.deleted_at);
    if (idx === -1) return fail("Action item not found.");

    if (input.status && input.status !== MOCK_ACTIONS[idx].status) {
      const tErr = validateActionTransition(MOCK_ACTIONS[idx].status, input.status);
      if (tErr) return fail(tErr);
    }

    const prevAssignee = MOCK_ACTIONS[idx].assigned_to;
    MOCK_ACTIONS[idx] = {
      ...MOCK_ACTIONS[idx],
      ...input,
      updated_at: new Date().toISOString(),
    };

    const actorId = await getActorProfileId();
    const meetingRes = await getMeeting(MOCK_ACTIONS[idx].meeting_id);

    if (input.assigned_to && input.assigned_to !== prevAssignee && meetingRes.data) {
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_ACTION_ASSIGNED,
        "Action item assigned",
        `You were assigned: "${MOCK_ACTIONS[idx].title}"`,
        [input.assigned_to],
        actorId,
      );
    }

    return mockOk(toActionView(MOCK_ACTIONS[idx]));
  }

  try {
    const { data: existing } = await getDb()
      .from("meeting_action_items")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return fail("Action item not found.");
    const ex = existing as MeetingActionItem;

    if (input.status && input.status !== ex.status) {
      const tErr = validateActionTransition(ex.status, input.status);
      if (tErr) return fail(tErr);
    }

    const { error } = await getDb().from("meeting_action_items").update(input).eq("id", id);
    if (error) return fail(error);

    const actorId = await getActorProfileId();
    if (input.assigned_to && input.assigned_to !== ex.assigned_to) {
      const meetingRes = await getMeeting(ex.meeting_id);
      if (meetingRes.data) {
        await emitMeetingEvent(
          meetingRes.data,
          EVENT_TYPES.MEETING_ACTION_ASSIGNED,
          "Action item assigned",
          `You were assigned: "${ex.title}"`,
          [input.assigned_to],
          actorId,
        );
      }
    }

    const { data: updated } = await getDb()
      .from("meeting_action_items")
      .select("*")
      .eq("id", id)
      .single();

    const views = await listMeetingActions(ex.meeting_id);
    const found = views.data?.find((a) => a.id === id);
    return found ? ok(found) : ok(toActionView(updated as MeetingActionItem));
  } catch (err) {
    return fail(err);
  }
}

// ─── completeActionItem ───────────────────────────────────────────────────────

export async function completeActionItem(id: string): Promise<ServiceResult<MeetingActionView>> {
  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const idx = MOCK_ACTIONS.findIndex((a) => a.id === id && !a.deleted_at);
    if (idx === -1) return fail("Action item not found.");

    const tErr = validateActionTransition(MOCK_ACTIONS[idx].status, "completed");
    if (tErr) return fail(tErr);

    MOCK_ACTIONS[idx] = {
      ...MOCK_ACTIONS[idx],
      status: "completed",
      completed_at: now,
      completed_by: actorId,
      updated_at: now,
    };

    const meetingRes = await getMeeting(MOCK_ACTIONS[idx].meeting_id);
    if (meetingRes.data) {
      const recipients: string[] = [];
      if (meetingRes.data.chair_profile_id) recipients.push(meetingRes.data.chair_profile_id);
      if (meetingRes.data.created_by) recipients.push(meetingRes.data.created_by);
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_ACTION_COMPLETED,
        "Action item completed",
        `"${MOCK_ACTIONS[idx].title}" was marked complete.`,
        recipients,
        actorId,
      );
    }

    await logAction({
      action: "meeting.action_completed",
      resource_type: RESOURCE_TYPE,
      resource_id: MOCK_ACTIONS[idx].meeting_id,
      new_data: { action_id: id },
    });

    return mockOk(toActionView(MOCK_ACTIONS[idx]));
  }

  try {
    const { data: existing } = await getDb()
      .from("meeting_action_items")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return fail("Action item not found.");
    const ex = existing as MeetingActionItem;

    const tErr = validateActionTransition(ex.status, "completed");
    if (tErr) return fail(tErr);

    const { error } = await getDb()
      .from("meeting_action_items")
      .update({
        status: "completed",
        completed_at: now,
        completed_by: actorId,
      })
      .eq("id", id);

    if (error) return fail(error);

    await logAction({
      action: "meeting.action_completed",
      resource_type: RESOURCE_TYPE,
      resource_id: ex.meeting_id,
      new_data: { action_id: id },
    });

    const meetingRes = await getMeeting(ex.meeting_id);
    if (meetingRes.data) {
      const recipients: string[] = [];
      if (meetingRes.data.chair_profile_id) recipients.push(meetingRes.data.chair_profile_id);
      if (meetingRes.data.created_by) recipients.push(meetingRes.data.created_by);
      await emitMeetingEvent(
        meetingRes.data,
        EVENT_TYPES.MEETING_ACTION_COMPLETED,
        "Action item completed",
        `"${ex.title}" was marked complete.`,
        recipients,
        actorId,
      );
    }

    const views = await listMeetingActions(ex.meeting_id);
    const found = views.data?.find((a) => a.id === id);
    return found ? ok(found) : fail("Action completed but not found.");
  } catch (err) {
    return fail(err);
  }
}

/** Exposed for testing / widget registry */
export function resetMockMeetings(): void {
  MOCK_MEETINGS = [...dummyMeetings];
  MOCK_ATTENDEES = [...dummyMeetingAttendees];
  MOCK_ACTIONS = [...dummyMeetingActionItems];
}
