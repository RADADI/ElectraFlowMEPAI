/**
 * RFI service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { rfis as MOCK_RFIS } from "@/lib/dummy-data";
import type { RFI, RFIInsert, RFIUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

type MockRFI = (typeof MOCK_RFIS)[number];

function mapRFIStatus(s: string): RFI["status"] {
  const m: Record<string, RFI["status"]> = {
    open: "open",
    answered: "answered",
    closed: "closed",
    cancelled: "cancelled",
  };
  return m[s.toLowerCase()] ?? "open";
}

function toRFI(raw: MockRFI): RFI {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    project_id: "p1",
    rfi_number: raw.number, // dummy-data: "RFI-001"
    title: raw.subject, // dummy-data uses "subject"
    description: raw.subject, // no separate description in dummy-data
    discipline: null, // not in dummy-data
    status: mapRFIStatus(raw.status),
    priority: (raw.priority?.toLowerCase() ?? "medium") as RFI["priority"],
    submitted_by: null,
    assigned_to: null,
    submitted_date: null,
    required_date: raw.due ?? null,
    answered_date: null,
    cost_impact: false,
    schedule_impact: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

export async function listRFIs(projectId?: string): Promise<ServiceResult<RFI[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_RFIS.map(toRFI));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_RFIS.map(toRFI));

  try {
    let query = supabase
      .from("rfi")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return fail<RFI[]>(error);
    return ok(data as RFI[]);
  } catch (err) {
    return fail<RFI[]>(err);
  }
}

export async function getRFI(id: string): Promise<ServiceResult<RFI>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_RFIS.find((r) => String(r.id) === id);
    if (!raw) return fail<RFI>(`RFI ${id} not found.`);
    return mockOk(toRFI(raw));
  }

  try {
    const { data, error } = await supabase
      .from("rfi")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<RFI>(error);
    return ok(data as RFI);
  } catch (err) {
    return fail<RFI>(err);
  }
}

export async function createRFI(payload: RFIInsert): Promise<ServiceResult<RFI>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<RFI>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase.from("rfi").insert(payload).select().single();

    if (error) return fail<RFI>(error);
    return ok(data as RFI);
  } catch (err) {
    return fail<RFI>(err);
  }
}

export async function updateRFI(id: string, payload: RFIUpdate): Promise<ServiceResult<RFI>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<RFI>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("rfi")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<RFI>(error);
    return ok(data as RFI);
  } catch (err) {
    return fail<RFI>(err);
  }
}
