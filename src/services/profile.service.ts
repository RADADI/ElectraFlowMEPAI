/**
 * Profile service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { getStoredUser, getStoredRole } from "@/contexts/auth-context";
import type { Profile, ProfileInsert, ProfileUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

function buildMockProfile(): Profile {
  const user = getStoredUser();
  const role = getStoredRole();

  return {
    id: user?.id ?? "mock-user",
    organization_id: "mock-org",
    full_name: user?.fullName ?? "Demo User",
    email: user?.email ?? "demo@electraflow.ai",
    role: (role?.toLowerCase().replace(/ /g, "_") ?? "electrical_engineer") as Profile["role"],
    title: null,
    department: null,
    phone: null,
    avatar_url: null,
    is_active: true,
    onboarding_done: true,
    clerk_user_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
}

export async function getCurrentProfile(): Promise<ServiceResult<Profile>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(buildMockProfile());
  }

  const { userId } = getSessionContext();
  if (!userId) return mockOk(buildMockProfile());

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .is("deleted_at", null)
      .single();

    if (error) return fail<Profile>(error);
    return ok(data as Profile);
  } catch (err) {
    return fail<Profile>(err);
  }
}

export async function listProfiles(): Promise<ServiceResult<Profile[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk([buildMockProfile()]);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([buildMockProfile()]);

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("full_name");

    if (error) return fail<Profile[]>(error);
    return ok(data as Profile[]);
  } catch (err) {
    return fail<Profile[]>(err);
  }
}

export async function updateProfile(
  id: string,
  payload: ProfileUpdate,
): Promise<ServiceResult<Profile>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Profile>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<Profile>(error);
    return ok(data as Profile);
  } catch (err) {
    return fail<Profile>(err);
  }
}

export async function createProfile(payload: ProfileInsert): Promise<ServiceResult<Profile>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Profile>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase.from("profiles").insert(payload).select().single();

    if (error) return fail<Profile>(error);
    return ok(data as Profile);
  } catch (err) {
    return fail<Profile>(err);
  }
}
