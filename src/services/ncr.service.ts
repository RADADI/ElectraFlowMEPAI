/**
 * NCR service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { ncrs as MOCK_NCRS } from "@/lib/dummy-data";
import type { NCR, NCRInsert, NCRUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

type MockNCR = (typeof MOCK_NCRS)[number];

function mapNCRStatus(s: string): NCR["status"] {
  const m: Record<string, NCR["status"]> = {
    open: "open",
    "in progress": "under_review",
    resolved: "resolved",
    closed: "closed",
  };
  return m[s.toLowerCase()] ?? "open";
}

function toNCR(raw: MockNCR): NCR {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    project_id: "p1",
    ncr_number: raw.number, // dummy-data: "NCR-001"
    title: raw.type, // dummy-data: "Installation", "Documentation"
    description: raw.root, // dummy-data: "root" is the deficiency description
    discipline: null, // not in dummy-data
    status: mapNCRStatus(raw.status),
    severity: "medium" as NCR["severity"],
    raised_by: null,
    assigned_to: null,
    raised_date: null,
    due_date: raw.due ?? null,
    closed_date: null,
    root_cause: raw.root ?? null,
    corrective_action: raw.action ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

export async function listNCRs(projectId?: string): Promise<ServiceResult<NCR[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_NCRS.map(toNCR));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_NCRS.map(toNCR));

  try {
    let query = supabase
      .from("ncr")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return fail<NCR[]>(error);
    return ok(data as NCR[]);
  } catch (err) {
    return fail<NCR[]>(err);
  }
}

export async function getNCR(id: string): Promise<ServiceResult<NCR>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_NCRS.find((n) => String(n.id) === id);
    if (!raw) return fail<NCR>(`NCR ${id} not found.`);
    return mockOk(toNCR(raw));
  }

  try {
    const { data, error } = await supabase
      .from("ncr")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<NCR>(error);
    return ok(data as NCR);
  } catch (err) {
    return fail<NCR>(err);
  }
}

export async function createNCR(payload: NCRInsert): Promise<ServiceResult<NCR>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<NCR>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase.from("ncr").insert(payload).select().single();

    if (error) return fail<NCR>(error);
    return ok(data as NCR);
  } catch (err) {
    return fail<NCR>(err);
  }
}

export async function updateNCR(id: string, payload: NCRUpdate): Promise<ServiceResult<NCR>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<NCR>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("ncr")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<NCR>(error);
    return ok(data as NCR);
  } catch (err) {
    return fail<NCR>(err);
  }
}
