/**
 * Audit log service — Phase 3
 *
 * In mock mode, audit logs are written to the in-memory array only (not
 * persisted to localStorage). Real audit logs require Supabase.
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import type { AuditLog, AuditLogInsert } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

const MOCK_LOG: AuditLog[] = [] as AuditLog[];

export async function logAction(
  payload: Omit<AuditLogInsert, "organization_id" | "user_id">,
): Promise<ServiceResult<AuditLog>> {
  const { organizationId, userId } = getSessionContext();

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      user_id: userId ?? "mock-user",
      created_at: new Date().toISOString(),
      action: payload.action,
      resource_type: payload.resource_type,
      resource_id: payload.resource_id ?? null,
      old_data: payload.old_data ?? null,
      new_data: payload.new_data ?? null,
      ip_address: payload.ip_address ?? null,
    };
    MOCK_LOG.unshift(entry);
    return mockOk(entry);
  }

  if (!organizationId || !userId) {
    return fail<AuditLog>("No active session.");
  }

  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .insert({ ...payload, organization_id: organizationId, user_id: userId })
      .select()
      .single();

    if (error) return fail<AuditLog>(error);
    return ok(data as AuditLog);
  } catch (err) {
    return fail<AuditLog>(err);
  }
}

export async function listAuditLogs(limit = 50): Promise<ServiceResult<AuditLog[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_LOG.slice(0, limit));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return fail<AuditLog[]>(error);
    return ok(data as AuditLog[]);
  } catch (err) {
    return fail<AuditLog[]>(err);
  }
}
