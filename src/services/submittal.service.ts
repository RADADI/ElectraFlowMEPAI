/**
 * Submittal service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { submittals as MOCK_SUBMITTALS } from "@/lib/dummy-data";
import type { Submittal, SubmittalInsert, SubmittalUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

type MockSubmittal = (typeof MOCK_SUBMITTALS)[number];

function mapSubmittalStatus(s: string): Submittal["status"] {
  const m: Record<string, Submittal["status"]> = {
    "no exception": "approved",
    "need corrections": "approved_as_noted",
    "resubmittal required": "revise_and_resubmit",
    rejected: "rejected",
    "for record only": "approved",
  };
  return m[s.toLowerCase()] ?? "draft";
}

function toSubmittal(raw: MockSubmittal): Submittal {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    project_id: "p1",
    submittal_number: raw.mark, // dummy-data uses "mark"
    title: raw.product, // dummy-data uses "product"
    discipline: null, // dummy-data has no discipline field
    spec_section: raw.section, // dummy-data uses "section"
    status: mapSubmittalStatus(raw.status),
    submitted_date: null,
    required_date: raw.due ?? null,
    returned_date: null,
    submitted_by: null,
    reviewer_id: null,
    description: raw.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

export async function listSubmittals(projectId?: string): Promise<ServiceResult<Submittal[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_SUBMITTALS.map(toSubmittal));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_SUBMITTALS.map(toSubmittal));

  try {
    let query = supabase
      .from("submittals")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return fail<Submittal[]>(error);
    return ok(data as Submittal[]);
  } catch (err) {
    return fail<Submittal[]>(err);
  }
}

export async function getSubmittal(id: string): Promise<ServiceResult<Submittal>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_SUBMITTALS.find((s) => String(s.id) === id);
    if (!raw) return fail<Submittal>(`Submittal ${id} not found.`);
    return mockOk(toSubmittal(raw));
  }

  try {
    const { data, error } = await supabase
      .from("submittals")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<Submittal>(error);
    return ok(data as Submittal);
  } catch (err) {
    return fail<Submittal>(err);
  }
}

export async function createSubmittal(payload: SubmittalInsert): Promise<ServiceResult<Submittal>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Submittal>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase.from("submittals").insert(payload).select().single();

    if (error) return fail<Submittal>(error);
    return ok(data as Submittal);
  } catch (err) {
    return fail<Submittal>(err);
  }
}

export async function updateSubmittal(
  id: string,
  payload: SubmittalUpdate,
): Promise<ServiceResult<Submittal>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Submittal>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("submittals")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<Submittal>(error);
    return ok(data as Submittal);
  } catch (err) {
    return fail<Submittal>(err);
  }
}
