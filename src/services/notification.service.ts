/**
 * Notification service — Phase 13
 *
 * Handles CRUD for the `notifications` and `notification_preferences` tables.
 * Always uses cursor pagination for scalability.
 * Fan-out helpers (notifyUsers, notifyRole, notifyProjectTeam) create multiple
 * notification rows — actor_profile_id is excluded from the recipient list so
 * the action author is never notified of their own action.
 *
 * Mock fallback: when IS_SUPABASE_CONFIGURED is false, all reads return
 * dummyNotifications + dummyNotificationPreferences; writes are in-memory only.
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { dummyNotifications, dummyNotificationPreferences } from "@/lib/dummy-data";
import type {
  Notification,
  NotificationInsert,
  NotificationUpdate,
  NotificationPreference,
  NotificationPreferenceInsert,
  NotificationPreferenceUpdate,
  NotificationCategory,
  NotificationPriority,
  NotificationSeverity,
} from "@/types/database";
import type { CursorPage } from "@/types/notification-view";
import {
  encodeCursor,
  decodeCursor,
  getEventCategory,
  getEventSeverity,
} from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── In-memory mock stores (for demo mode writes) ─────────────────────────────

let MOCK_NOTIFS: Notification[] = [...dummyNotifications];
const MOCK_PREFS: NotificationPreference[] = [...dummyNotificationPreferences];

// ─── List notifications with cursor pagination ────────────────────────────────

export interface ListNotificationOptions {
  category?: NotificationCategory;
  priority?: NotificationPriority;
  severity?: NotificationSeverity;
  unread_only?: boolean;
  include_snoozed?: boolean;
  include_dismissed?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listNotifications(
  opts: ListNotificationOptions = {},
): Promise<ServiceResult<CursorPage<Notification>>> {
  const limit = opts.limit ?? PAGE_SIZE;

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const now = new Date().toISOString();
    let items = MOCK_NOTIFS.filter((n) => !n.deleted_at);
    if (opts.category) items = items.filter((n) => n.category === opts.category);
    if (opts.priority) items = items.filter((n) => n.priority === opts.priority);
    if (opts.severity) items = items.filter((n) => n.severity === opts.severity);
    if (opts.unread_only) items = items.filter((n) => !n.read_at);
    if (!opts.include_dismissed) items = items.filter((n) => !n.dismissed_at);
    if (!opts.include_snoozed)
      items = items.filter((n) => !n.snoozed_until || n.snoozed_until < now);

    // Sort: pinned first, then by created_at DESC
    items.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        const idx = items.findIndex((n) => n.id === decoded.id);
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

  const { userId } = getSessionContext();
  if (!userId) return fail<CursorPage<Notification>>("No active session.");

  const profileId = await _getProfileId();
  if (!profileId) return fail<CursorPage<Notification>>("Profile not found.");

  try {
    const now = new Date().toISOString();
    let q = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_profile_id", profileId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (opts.category) q = q.eq("category", opts.category);
    if (opts.priority) q = q.eq("priority", opts.priority);
    if (opts.severity) q = q.eq("severity", opts.severity);
    if (opts.unread_only) q = q.is("read_at", null);
    if (!opts.include_dismissed) q = q.is("dismissed_at", null);
    if (!opts.include_snoozed) {
      q = q.or(`snoozed_until.is.null,snoozed_until.lt.${now}`);
    }

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        q = q.or(
          `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as Notification[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor =
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1].created_at, items[items.length - 1].id)
        : null;

    return ok({ items, next_cursor });
  } catch (err) {
    return fail(err);
  }
}

// ─── Unread count (badge) ─────────────────────────────────────────────────────

export async function getUnreadCount(): Promise<ServiceResult<number>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const now = new Date().toISOString();
    const count = MOCK_NOTIFS.filter(
      (n) =>
        !n.deleted_at &&
        !n.read_at &&
        !n.dismissed_at &&
        (!n.snoozed_until || n.snoozed_until < now),
    ).length;
    return mockOk(count);
  }

  const profileId = await _getProfileId();
  if (!profileId) return mockOk(0);

  try {
    const now = new Date().toISOString();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_profile_id", profileId)
      .is("deleted_at", null)
      .is("read_at", null)
      .is("dismissed_at", null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`);

    if (error) return fail(error);
    return ok(count ?? 0);
  } catch (err) {
    return fail(err);
  }
}

// ─── Mark as read ─────────────────────────────────────────────────────────────

export async function markAsRead(id: string): Promise<ServiceResult<Notification>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_NOTIFS.findIndex((n) => n.id === id);
    if (idx === -1) return fail("Notification not found.");
    MOCK_NOTIFS[idx] = { ...MOCK_NOTIFS[idx], read_at: new Date().toISOString() };
    return mockOk(MOCK_NOTIFS[idx]);
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() } satisfies NotificationUpdate)
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return ok(data as Notification);
  } catch (err) {
    return fail(err);
  }
}

// ─── Mark all as read ─────────────────────────────────────────────────────────

export async function markAllAsRead(): Promise<ServiceResult<number>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const now = new Date().toISOString();
    let count = 0;
    MOCK_NOTIFS = MOCK_NOTIFS.map((n) => {
      if (!n.read_at && !n.deleted_at) {
        count++;
        return { ...n, read_at: now };
      }
      return n;
    });
    return mockOk(count);
  }

  const profileId = await _getProfileId();
  if (!profileId) return fail("No profile.");

  try {
    const { data: updated, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() } satisfies NotificationUpdate)
      .eq("recipient_profile_id", profileId)
      .is("read_at", null)
      .is("deleted_at", null)
      .select("id");

    if (error) return fail(error);
    return ok((updated ?? []).length);
  } catch (err) {
    return fail(err);
  }
}

// ─── Dismiss ──────────────────────────────────────────────────────────────────

export async function dismissNotification(id: string): Promise<ServiceResult<Notification>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_NOTIFS.findIndex((n) => n.id === id);
    if (idx === -1) return fail("Notification not found.");
    MOCK_NOTIFS[idx] = { ...MOCK_NOTIFS[idx], dismissed_at: new Date().toISOString() };
    return mockOk(MOCK_NOTIFS[idx]);
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ dismissed_at: new Date().toISOString() } satisfies NotificationUpdate)
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return ok(data as Notification);
  } catch (err) {
    return fail(err);
  }
}

// ─── Snooze ───────────────────────────────────────────────────────────────────

export async function snoozeNotification(
  id: string,
  until: string | null,
): Promise<ServiceResult<Notification>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_NOTIFS.findIndex((n) => n.id === id);
    if (idx === -1) return fail("Notification not found.");
    MOCK_NOTIFS[idx] = { ...MOCK_NOTIFS[idx], snoozed_until: until };
    return mockOk(MOCK_NOTIFS[idx]);
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ snoozed_until: until } satisfies NotificationUpdate)
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return ok(data as Notification);
  } catch (err) {
    return fail(err);
  }
}

// ─── Pin / Unpin ──────────────────────────────────────────────────────────────

export async function pinNotification(
  id: string,
  pinned: boolean,
): Promise<ServiceResult<Notification>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_NOTIFS.findIndex((n) => n.id === id);
    if (idx === -1) return fail("Notification not found.");
    MOCK_NOTIFS[idx] = { ...MOCK_NOTIFS[idx], is_pinned: pinned };
    return mockOk(MOCK_NOTIFS[idx]);
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_pinned: pinned } satisfies NotificationUpdate)
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error);
    return ok(data as Notification);
  } catch (err) {
    return fail(err);
  }
}

// ─── Create a single notification row ────────────────────────────────────────

export async function createNotification(
  payload: Omit<NotificationInsert, "organization_id">,
): Promise<ServiceResult<Notification>> {
  const { organizationId } = getSessionContext();

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const entry: Notification = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      deleted_at: null,
      created_at: new Date().toISOString(),
      ...payload,
    };
    MOCK_NOTIFS.unshift(entry);
    return mockOk(entry);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const row: NotificationInsert = { ...payload, organization_id: organizationId };
    const { data, error } = await supabase.from("notifications").insert(row).select().single();
    if (error) return fail(error);
    return ok(data as Notification);
  } catch (err) {
    return fail(err);
  }
}

// ─── Fan-out helpers ──────────────────────────────────────────────────────────

export interface FanOutPayload {
  event_type: string;
  title: string;
  message?: string;
  entity_type?: string;
  entity_id?: string;
  route?: string;
  priority?: NotificationPriority;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  actor_profile_id?: string | null;
}

/** Notify a list of profile IDs — skips the actor to avoid self-notification. */
export async function notifyUsers(
  recipientProfileIds: string[],
  payload: FanOutPayload,
): Promise<ServiceResult<number>> {
  const { organizationId } = getSessionContext();
  const orgId = organizationId ?? "mock-org";

  const category = payload.category ?? getEventCategory(payload.event_type);
  const severity = payload.severity ?? getEventSeverity(payload.event_type);

  const recipients = recipientProfileIds.filter((id) => id !== payload.actor_profile_id);

  if (recipients.length === 0) return ok(0);

  const rows: NotificationInsert[] = recipients.map((rid) => ({
    organization_id: orgId,
    recipient_profile_id: rid,
    actor_profile_id: payload.actor_profile_id ?? null,
    event_type: payload.event_type,
    title: payload.title,
    message: payload.message ?? null,
    entity_type: payload.entity_type ?? null,
    entity_id: payload.entity_id ?? null,
    route: payload.route ?? null,
    priority: payload.priority ?? "normal",
    category,
    severity,
    is_pinned: false,
    read_at: null,
    dismissed_at: null,
    snoozed_until: null,
  }));

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const entries = rows.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      deleted_at: null,
    })) as Notification[];
    MOCK_NOTIFS.unshift(...entries);
    return mockOk(entries.length);
  }

  try {
    const { data: inserted, error } = await supabase
      .from("notifications")
      .insert(rows)
      .select("id");
    if (error) return fail(error);
    return ok((inserted ?? []).length);
  } catch (err) {
    return fail(err);
  }
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export async function listPreferences(): Promise<ServiceResult<NotificationPreference[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk([...MOCK_PREFS]);
  }

  const profileId = await _getProfileId();
  if (!profileId) return fail("No profile.");

  try {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("profile_id", profileId)
      .order("event_type");
    if (error) return fail(error);
    return ok((data ?? []) as NotificationPreference[]);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertPreference(
  eventType: string,
  channel: "in_app" | "email" | "future_webhook",
  updates: NotificationPreferenceUpdate,
): Promise<ServiceResult<NotificationPreference>> {
  const { organizationId } = getSessionContext();

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const existing = MOCK_PREFS.find((p) => p.event_type === eventType && p.channel === channel);
    if (existing) {
      Object.assign(existing, updates, { updated_at: new Date().toISOString() });
      return mockOk({ ...existing });
    }
    const newPref: NotificationPreference = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      profile_id: "mock-profile",
      channel,
      event_type: eventType,
      enabled: updates.enabled ?? true,
      frequency: updates.frequency ?? "immediate",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    MOCK_PREFS.push(newPref);
    return mockOk(newPref);
  }

  const profileId = await _getProfileId();
  if (!profileId || !organizationId) return fail("No active session.");

  try {
    const row: NotificationPreferenceInsert = {
      organization_id: organizationId,
      profile_id: profileId,
      channel,
      event_type: eventType,
      enabled: updates.enabled ?? true,
      frequency: updates.frequency ?? "immediate",
    };
    const { data, error } = await supabase
      .from("notification_preferences")
      .upsert(row, { onConflict: "profile_id,channel,event_type" })
      .select()
      .single();
    if (error) return fail(error);
    return ok(data as NotificationPreference);
  } catch (err) {
    return fail(err);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getProfileId(): Promise<string | null> {
  if (!supabase) return null;
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
