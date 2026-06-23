/**
 * Activity event service — Phase 13
 *
 * Handles read/write for the `activity_events` table — the immutable org-wide
 * activity log. Every workflow action (approve, assign, create, etc.) that
 * should appear in the Activity Center calls `createActivityEvent()`.
 *
 * Visibility rules:
 *   internal       — visible to all internal roles (default)
 *   client_visible — visible to clients and internal roles
 *   private        — visible only to the actor
 *
 * Mock fallback: returns dummyActivityEvents when Supabase is not configured.
 * Writes are in-memory only in mock mode.
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { dummyActivityEvents } from "@/lib/dummy-data";
import type {
  ActivityEvent,
  ActivityEventInsert,
  ActivityVisibility,
  NotificationCategory,
} from "@/types/database";
import type { CursorPage } from "@/types/notification-view";
import { encodeCursor, decodeCursor, getEventCategory } from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ─── In-memory mock store ─────────────────────────────────────────────────────

const MOCK_EVENTS: ActivityEvent[] = [...dummyActivityEvents];

// ─── List activity events ─────────────────────────────────────────────────────

export interface ListActivityOptions {
  category?: NotificationCategory;
  entity_type?: string;
  entity_id?: string;
  visibility?: ActivityVisibility;
  cursor?: string;
  limit?: number;
}

export async function listActivityEvents(
  opts: ListActivityOptions = {},
): Promise<ServiceResult<CursorPage<ActivityEvent>>> {
  const limit = opts.limit ?? PAGE_SIZE;

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = MOCK_EVENTS.filter((e) => !e.deleted_at);

    if (opts.category) items = items.filter((e) => e.category === opts.category);
    if (opts.entity_type) items = items.filter((e) => e.entity_type === opts.entity_type);
    if (opts.entity_id) items = items.filter((e) => e.entity_id === opts.entity_id);
    if (opts.visibility) items = items.filter((e) => e.visibility === opts.visibility);

    // Sort by created_at DESC
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        const idx = items.findIndex((e) => e.id === decoded.id);
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
  if (!organizationId) return fail<CursorPage<ActivityEvent>>("No active session.");

  try {
    let q = supabase
      .from("activity_events")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (opts.category) q = q.eq("category", opts.category);
    if (opts.entity_type) q = q.eq("entity_type", opts.entity_type);
    if (opts.entity_id) q = q.eq("entity_id", opts.entity_id);
    if (opts.visibility) q = q.eq("visibility", opts.visibility);

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

    const rows = (data ?? []) as ActivityEvent[];
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

// ─── Create an activity event ─────────────────────────────────────────────────

export type CreateActivityEventPayload = {
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  message: string;
  metadata?: Record<string, unknown>;
  category?: NotificationCategory;
  visibility?: ActivityVisibility;
  actor_profile_id?: string | null;
};

export async function createActivityEvent(
  payload: CreateActivityEventPayload,
): Promise<ServiceResult<ActivityEvent>> {
  const { organizationId } = getSessionContext();

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const event: ActivityEvent = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      actor_profile_id: payload.actor_profile_id ?? null,
      event_type: payload.event_type,
      entity_type: payload.entity_type ?? null,
      entity_id: payload.entity_id ?? null,
      entity_label: payload.entity_label ?? null,
      message: payload.message,
      metadata: payload.metadata ?? {},
      category: payload.category ?? getEventCategory(payload.event_type),
      visibility: payload.visibility ?? "internal",
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    MOCK_EVENTS.unshift(event);
    return mockOk(event);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const row: ActivityEventInsert = {
      organization_id: organizationId,
      actor_profile_id: payload.actor_profile_id ?? null,
      event_type: payload.event_type,
      entity_type: payload.entity_type ?? null,
      entity_id: payload.entity_id ?? null,
      entity_label: payload.entity_label ?? null,
      message: payload.message,
      metadata: payload.metadata ?? {},
      category: payload.category ?? getEventCategory(payload.event_type),
      visibility: payload.visibility ?? "internal",
    };

    const { data, error } = await supabase.from("activity_events").insert(row).select().single();

    if (error) return fail(error);
    return ok(data as ActivityEvent);
  } catch (err) {
    return fail(err);
  }
}
