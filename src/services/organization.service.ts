/**
 * Organization service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import type { Organization, OrganizationUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

const MOCK_ORG: Organization = {
  id: "mock-org",
  name: "ElectraFlow Demo Co.",
  slug: "electraflow-demo",
  plan: "pro",
  logo_url: null,
  website: null,
  industry: "Electrical Engineering",
  country: "US",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};

export async function getOrganization(): Promise<ServiceResult<Organization>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_ORG);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_ORG);

  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .is("deleted_at", null)
      .single();

    if (error) return fail<Organization>(error);
    return ok(data as Organization);
  } catch (err) {
    return fail<Organization>(err);
  }
}

export async function updateOrganization(
  id: string,
  payload: OrganizationUpdate,
): Promise<ServiceResult<Organization>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Organization>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("organizations")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<Organization>(error);
    return ok(data as Organization);
  } catch (err) {
    return fail<Organization>(err);
  }
}
