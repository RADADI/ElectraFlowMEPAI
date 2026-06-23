/**
 * Holiday service — Phase 11
 * Admin/HR can manage holidays. All organisation members can read.
 * Mock fallback from dummyHolidays.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { dummyHolidays } from "@/lib/dummy-data";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type { HolidayView, HolidayCreateInput, HolidayUpdateInput } from "@/types/timesheet-view";

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) return false;
  return true;
}

function isAdminOrHR(role: string | null | undefined) {
  const r = (role ?? "").toLowerCase().replace(/ /g, "_");
  return r === "admin" || r === "hr";
}

const MOCK_KEY = "mep-holidays-mock";

function getMockHolidays(): HolidayView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    const overrides: HolidayView[] = raw ? JSON.parse(raw) : [];
    const base = dummyHolidays as HolidayView[];
    const ids = new Set(overrides.map((h) => h.id));
    return [...overrides, ...base.filter((h) => !ids.has(h.id))].filter((h) => !h.deleted_at);
  } catch {
    return dummyHolidays as HolidayView[];
  }
}

function saveMockHolidays(items: HolidayView[]): void {
  try {
    sessionStorage.setItem(MOCK_KEY, JSON.stringify(items));
  } catch (_e) {
    /* storage unavailable */
  }
}

export async function listHolidays(): Promise<ServiceResult<HolidayView[]>> {
  if (!shouldUseSupabase()) return mockOk(getMockHolidays());

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(dummyHolidays as HolidayView[]);

  try {
    const { data, error } = await supabase!
      .from("holidays")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("holiday_date");

    if (error) return fail<HolidayView[]>(error);
    return ok((data ?? []) as HolidayView[]);
  } catch (err) {
    return fail<HolidayView[]>(err);
  }
}

export async function createHoliday(
  input: HolidayCreateInput,
): Promise<ServiceResult<HolidayView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<HolidayView>("Only Admin and HR can create holidays.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockHolidays();
    if (all.some((h) => h.holiday_date === input.holiday_date)) {
      return fail<HolidayView>("A holiday already exists for this date in your organisation.");
    }
    const newH: HolidayView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      name: input.name,
      holiday_date: input.holiday_date,
      recurring: input.recurring ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      deleted_at: null,
    };
    saveMockHolidays([newH, ...all]);
    return mockOk(newH);
  }

  if (!organizationId) {
    return fail<HolidayView>("Organisation is not configured for this user.");
  }

  try {
    const { data, error } = await supabase!
      .from("holidays")
      .insert({
        ...input,
        organization_id: organizationId,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return fail<HolidayView>("A holiday already exists for this date in your organisation.");
      return fail<HolidayView>(error);
    }
    void logAction({
      action: "holiday.created",
      resource_type: "holiday",
      resource_id: (data as { id: string }).id,
      new_data: { name: input.name, holiday_date: input.holiday_date },
    });
    return ok(data as HolidayView);
  } catch (err) {
    return fail<HolidayView>(err);
  }
}

export async function updateHoliday(
  id: string,
  input: HolidayUpdateInput,
): Promise<ServiceResult<HolidayView>> {
  const { role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<HolidayView>("Only Admin and HR can update holidays.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockHolidays();
    const idx = all.findIndex((h) => h.id === id);
    if (idx === -1) return fail<HolidayView>("Holiday not found.");
    const updated = {
      ...all[idx],
      ...input,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockHolidays(next);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase!
      .from("holidays")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<HolidayView>(error);
    return ok(data as HolidayView);
  } catch (err) {
    return fail<HolidayView>(err);
  }
}

export async function archiveHoliday(id: string): Promise<ServiceResult<boolean>> {
  const { role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<boolean>("Only Admin and HR can archive holidays.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockHolidays();
    saveMockHolidays(
      all.map((h) => (h.id === id ? { ...h, deleted_at: new Date().toISOString() } : h)),
    );
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("holidays")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}
