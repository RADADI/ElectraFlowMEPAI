/**
 * User service — Phase 6
 *
 * Admin-only operations for managing organisation members:
 *   • listUsers()        — list active + inactive profiles
 *   • changeRole()       — update profiles.role (DB is authoritative)
 *   • deactivateUser()   — set is_active = false
 *   • reactivateUser()   — set is_active = true
 *
 * All mutations write an audit log entry.
 * Role changes take effect the next time the affected user makes a profile
 * check (bootstrapProfile re-reads the DB on every sign-in).
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type { UserRole } from "@/types/database";

// ─── View type ────────────────────────────────────────────────────────────────

export interface UserView {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  title: string | null;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
  onboarding_done: boolean;
  created_at: string;
  clerk_user_id: string | null;
}

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) return false;
  return true;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_USERS_KEY = "mep-users-mock";

const SEED_USERS: UserView[] = [
  {
    id: "u1",
    organization_id: "mock-org",
    full_name: "Ahmed Hassan",
    email: "ahmed.hassan@electraflow.ai",
    role: "project_manager",
    title: "Senior PM",
    department: "Engineering",
    avatar_url: null,
    is_active: true,
    onboarding_done: true,
    created_at: "2025-01-10T00:00:00Z",
    clerk_user_id: null,
  },
  {
    id: "u2",
    organization_id: "mock-org",
    full_name: "Sara Khan",
    email: "sara.khan@electraflow.ai",
    role: "senior_electrical_engineer",
    title: "Lead Electrical Engineer",
    department: "Engineering",
    avatar_url: null,
    is_active: true,
    onboarding_done: true,
    created_at: "2025-01-12T00:00:00Z",
    clerk_user_id: null,
  },
  {
    id: "u3",
    organization_id: "mock-org",
    full_name: "John Doe",
    email: "john.doe@electraflow.ai",
    role: "electrical_engineer",
    title: "Electrical Engineer",
    department: "Engineering",
    avatar_url: null,
    is_active: true,
    onboarding_done: true,
    created_at: "2025-02-01T00:00:00Z",
    clerk_user_id: null,
  },
  {
    id: "u4",
    organization_id: "mock-org",
    full_name: "Linda Park",
    email: "linda.park@electraflow.ai",
    role: "qa_qc_engineer",
    title: "QA Lead",
    department: "Quality",
    avatar_url: null,
    is_active: true,
    onboarding_done: true,
    created_at: "2025-02-15T00:00:00Z",
    clerk_user_id: null,
  },
];

function getMockUsers(): UserView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_USERS_KEY);
    const overrides: UserView[] = raw ? (JSON.parse(raw) as UserView[]) : [];
    const overrideIds = new Set(overrides.map((u) => u.id));
    return [...overrides, ...SEED_USERS.filter((u) => !overrideIds.has(u.id))];
  } catch {
    return SEED_USERS;
  }
}

function saveMockUsers(users: UserView[]): void {
  try {
    const overrides = users.filter((u) => !SEED_USERS.find((s) => s.id === u.id));
    const mutated = users.filter((u) => {
      const seed = SEED_USERS.find((s) => s.id === u.id);
      return seed && JSON.stringify(u) !== JSON.stringify(seed);
    });
    sessionStorage.setItem(MOCK_USERS_KEY, JSON.stringify([...overrides, ...mutated]));
  } catch {
    // ignore
  }
}

// ─── List users ───────────────────────────────────────────────────────────────

export async function listUsers(): Promise<ServiceResult<UserView[]>> {
  if (!shouldUseSupabase()) {
    return mockOk(getMockUsers());
  }

  const orgId = getSessionContext().organizationId;
  if (!orgId) return fail<UserView[]>("No active organisation.");

  try {
    const { data, error } = await supabase!
      .from("profiles")
      .select(
        "id, organization_id, full_name, email, role, title, department, avatar_url, is_active, onboarding_done, created_at, clerk_user_id",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });

    if (error) return fail<UserView[]>(error);
    return ok(data as UserView[]);
  } catch (err) {
    return fail<UserView[]>(err);
  }
}

// ─── Change role ──────────────────────────────────────────────────────────────

export async function changeRole(
  profileId: string,
  newRole: UserRole,
): Promise<ServiceResult<UserView>> {
  if (!shouldUseSupabase()) {
    const all = getMockUsers();
    const idx = all.findIndex((u) => u.id === profileId);
    if (idx === -1) return fail<UserView>("User not found.");
    const oldRole = all[idx].role;
    all[idx] = { ...all[idx], role: newRole };
    saveMockUsers(all);
    await logAction({
      action: "user.role_changed",
      resource_type: "profile",
      resource_id: profileId,
      old_data: { role: oldRole },
      new_data: { role: newRole },
    });
    return mockOk(all[idx]);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId || !userId) return fail<UserView>("No active session.");

  try {
    // Fetch old role for audit log
    const { data: old } = await supabase!
      .from("profiles")
      .select("role")
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .single();

    const { data, error } = await supabase!
      .from("profiles")
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, full_name, email, role, title, department, avatar_url, is_active, onboarding_done, created_at, clerk_user_id",
      )
      .single();

    if (error) return fail<UserView>(error);

    await logAction({
      action: "user.role_changed",
      resource_type: "profile",
      resource_id: profileId,
      old_data: { role: old?.role },
      new_data: { role: newRole },
    });

    return ok(data as UserView);
  } catch (err) {
    return fail<UserView>(err);
  }
}

// ─── Deactivate user ──────────────────────────────────────────────────────────

export async function deactivateUser(profileId: string): Promise<ServiceResult<UserView>> {
  if (!shouldUseSupabase()) {
    const all = getMockUsers();
    const idx = all.findIndex((u) => u.id === profileId);
    if (idx === -1) return fail<UserView>("User not found.");
    all[idx] = { ...all[idx], is_active: false };
    saveMockUsers(all);
    await logAction({
      action: "user.deactivated",
      resource_type: "profile",
      resource_id: profileId,
    });
    return mockOk(all[idx]);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId || !userId) return fail<UserView>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, full_name, email, role, title, department, avatar_url, is_active, onboarding_done, created_at, clerk_user_id",
      )
      .single();

    if (error) return fail<UserView>(error);

    await logAction({
      action: "user.deactivated",
      resource_type: "profile",
      resource_id: profileId,
    });

    return ok(data as UserView);
  } catch (err) {
    return fail<UserView>(err);
  }
}

// ─── Reactivate user ──────────────────────────────────────────────────────────

export async function reactivateUser(profileId: string): Promise<ServiceResult<UserView>> {
  if (!shouldUseSupabase()) {
    const all = getMockUsers();
    const idx = all.findIndex((u) => u.id === profileId);
    if (idx === -1) return fail<UserView>("User not found.");
    all[idx] = { ...all[idx], is_active: true };
    saveMockUsers(all);
    return mockOk(all[idx]);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId || !userId) return fail<UserView>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("profiles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .select(
        "id, organization_id, full_name, email, role, title, department, avatar_url, is_active, onboarding_done, created_at, clerk_user_id",
      )
      .single();

    if (error) return fail<UserView>(error);
    return ok(data as UserView);
  } catch (err) {
    return fail<UserView>(err);
  }
}
