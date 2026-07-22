/**
 * Audit Explorer service — Phase 14
 *
 * Read-only audit log queries for Admin /audit route.
 * Does NOT modify audit.service.ts (logAction remains unchanged).
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { dummyAuditLogs } from "@/lib/dummy-data";
import type { AuditLog } from "@/types/database";
import { encodeCursor, decodeCursor, type CursorPage } from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

const PAGE_SIZE = 30;

export interface AuditEventFilters {
  action?: string;
  resource_type?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

/** Map resource_type → app route for deep linking */
export function getAuditEntityRoute(
  resourceType: string,
  resourceId: string | null,
): string | null {
  if (!resourceId) return null;
  const map: Record<string, string> = {
    project: `/projects/${resourceId}`,
    document: `/documents/${resourceId}`,
    submittal: `/submittals/${resourceId}`,
    rfi: `/rfi/${resourceId}`,
    profile: `/users`,
    invoice: `/financials`,
    expense: `/financials`,
    report_run: `/reports`,
  };
  return map[resourceType] ?? null;
}

export async function listAuditEvents(
  filters: AuditEventFilters = {},
): Promise<ServiceResult<CursorPage<AuditLog>>> {
  const limit = filters.limit ?? PAGE_SIZE;

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = [...dummyAuditLogs];
    if (filters.action) items = items.filter((e) => e.action.includes(filters.action!));
    if (filters.resource_type)
      items = items.filter((e) => e.resource_type === filters.resource_type);
    if (filters.user_id) items = items.filter((e) => e.user_id.includes(filters.user_id!));
    if (filters.date_from) items = items.filter((e) => e.created_at >= filters.date_from!);
    if (filters.date_to) items = items.filter((e) => e.created_at <= filters.date_to!);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      items = items.filter(
        (e) =>
          e.action.toLowerCase().includes(term) ||
          e.resource_type.toLowerCase().includes(term) ||
          (e.resource_id ?? "").toLowerCase().includes(term),
      );
    }
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((e) => e.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }
    const page = items.slice(0, limit);
    return mockOk({
      items: page,
      next_cursor:
        page.length === limit && items.length > limit
          ? encodeCursor(page[page.length - 1].created_at, page[page.length - 1].id)
          : null,
    });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = supabase
      .from("audit_logs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (filters.action) q = q.ilike("action", `%${filters.action}%`);
    if (filters.resource_type) q = q.eq("resource_type", filters.resource_type);
    if (filters.user_id) q = q.ilike("user_id", `%${filters.user_id}%`);
    if (filters.date_from) q = q.gte("created_at", filters.date_from);
    if (filters.date_to) q = q.lte("created_at", filters.date_to);

    const { data, error } = await q;
    if (error) return fail(error);

    let rows = (data ?? []) as AuditLog[];
    if (filters.search) {
      const term = filters.search.toLowerCase();
      rows = rows.filter(
        (e) =>
          e.action.toLowerCase().includes(term) ||
          e.resource_type.toLowerCase().includes(term) ||
          (e.resource_id ?? "").toLowerCase().includes(term),
      );
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return ok({
      items,
      next_cursor:
        hasMore && items.length
          ? encodeCursor(items[items.length - 1].created_at, items[items.length - 1].id)
          : null,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function getAuditEvent(id: string): Promise<ServiceResult<AuditLog>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const e = dummyAuditLogs.find((log) => log.id === id);
    if (!e) return fail("Audit event not found.");
    return mockOk(e);
  }

  try {
    const { data, error } = await supabase.from("audit_logs").select("*").eq("id", id).single();
    if (error || !data) return fail("Audit event not found.");
    return ok(data as AuditLog);
  } catch (err) {
    return fail(err);
  }
}

export async function searchAuditEvents(term: string): Promise<ServiceResult<AuditLog[]>> {
  const result = await listAuditEvents({ search: term, limit: 50 });
  if (result.error) return fail(result.error);
  return ok(result.data?.items ?? []);
}
