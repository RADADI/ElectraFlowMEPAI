/**
 * Dashboard preferences service — Phase 14
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { getDefaultLayout } from "@/lib/widget-registry";
import type { AppRole } from "@/lib/permissions";
import type {
  DashboardPreference,
  DashboardPreferenceInsert,
  DashboardPreferenceUpdate,
  DashboardType,
} from "@/types/database";
import type { DashboardPreferenceView } from "@/types/report-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

let MOCK_PREFS: DashboardPreference[] = [];

async function getProfileId(): Promise<string | null> {
  if (!supabase) return "mock-profile";
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

function buildView(pref: DashboardPreference, role: AppRole | null): DashboardPreferenceView {
  const hidden = new Set(pref.hidden_widgets);
  const visible = pref.layout.filter((id) => !hidden.has(id));
  void role;
  return { ...pref, visible_widgets: visible.length ? visible : getDefaultLayout(role) };
}

export async function getDashboardPreferences(
  dashboardType: DashboardType = "executive",
  role: AppRole | null = null,
): Promise<ServiceResult<DashboardPreferenceView>> {
  const { organizationId } = getSessionContext();
  const profileId = await getProfileId();

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const existing = MOCK_PREFS.find(
      (p) => p.profile_id === (profileId ?? "mock-profile") && p.dashboard_type === dashboardType,
    );
    if (existing) return mockOk(buildView(existing, role));
    const defaults: DashboardPreference = {
      id: "default",
      organization_id: organizationId ?? "mock-org",
      profile_id: profileId ?? "mock-profile",
      dashboard_type: dashboardType,
      layout: getDefaultLayout(role),
      favorite_widgets: [],
      hidden_widgets: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return mockOk(buildView(defaults, role));
  }

  if (!organizationId || !profileId) return fail("No active session.");

  try {
    const { data } = await supabase
      .from("dashboard_preferences")
      .select("*")
      .eq("profile_id", profileId)
      .eq("dashboard_type", dashboardType)
      .maybeSingle();

    if (data) return ok(buildView(data as DashboardPreference, role));

    const defaults: DashboardPreferenceView = {
      id: "",
      organization_id: organizationId,
      profile_id: profileId,
      dashboard_type: dashboardType,
      layout: getDefaultLayout(role),
      favorite_widgets: [],
      hidden_widgets: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      visible_widgets: getDefaultLayout(role),
    };
    return ok(defaults);
  } catch (err) {
    return fail(err);
  }
}

export async function saveDashboardPreferences(
  dashboardType: DashboardType,
  updates: DashboardPreferenceUpdate,
  role: AppRole | null = null,
): Promise<ServiceResult<DashboardPreferenceView>> {
  const { organizationId } = getSessionContext();
  const profileId = await getProfileId();
  if (!profileId) return fail("No active session.");

  const layout = updates.layout ?? getDefaultLayout(role);
  if (layout.length > 20) return fail("Maximum 20 widgets allowed.");

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = MOCK_PREFS.findIndex(
      (p) => p.profile_id === profileId && p.dashboard_type === dashboardType,
    );
    if (idx !== -1) {
      MOCK_PREFS[idx] = {
        ...MOCK_PREFS[idx],
        ...updates,
        layout,
        updated_at: new Date().toISOString(),
      };
      return mockOk(buildView(MOCK_PREFS[idx], role));
    }
    const entry: DashboardPreference = {
      id: crypto.randomUUID(),
      organization_id: organizationId ?? "mock-org",
      profile_id: profileId,
      dashboard_type: dashboardType,
      layout,
      favorite_widgets: updates.favorite_widgets ?? [],
      hidden_widgets: updates.hidden_widgets ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    MOCK_PREFS.push(entry);
    return mockOk(buildView(entry, role));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const row: DashboardPreferenceInsert = {
      organization_id: organizationId,
      profile_id: profileId,
      dashboard_type: dashboardType,
      layout,
      favorite_widgets: updates.favorite_widgets ?? [],
      hidden_widgets: updates.hidden_widgets ?? [],
    };
    const { data, error } = await supabase
      .from("dashboard_preferences")
      .upsert(row, { onConflict: "profile_id,dashboard_type" })
      .select()
      .single();
    if (error) return fail(error);
    return ok(buildView(data as DashboardPreference, role));
  } catch (err) {
    return fail(err);
  }
}

export async function resetDashboardPreferences(
  dashboardType: DashboardType,
  role: AppRole | null = null,
): Promise<ServiceResult<DashboardPreferenceView>> {
  const profileId = await getProfileId();
  if (!profileId) return fail("No active session.");

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    MOCK_PREFS = MOCK_PREFS.filter(
      (p) => !(p.profile_id === profileId && p.dashboard_type === dashboardType),
    );
    return getDashboardPreferences(dashboardType, role);
  }

  try {
    await supabase
      .from("dashboard_preferences")
      .delete()
      .eq("profile_id", profileId)
      .eq("dashboard_type", dashboardType);
    return getDashboardPreferences(dashboardType, role);
  } catch (err) {
    return fail(err);
  }
}
