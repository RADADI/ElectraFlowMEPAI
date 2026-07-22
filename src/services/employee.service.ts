/**
 * Employee / Resource service — Phase 10
 *
 * Full Supabase CRUD with overbooking protection, certification tracking,
 * workload aggregation, capacity warning computation, and audit logging.
 *
 * Falls back to mock/sessionStorage when Supabase is not configured or JWT
 * is not ready.
 *
 * Behaviour matrix:
 *   Supabase NOT configured  → mock always
 *   Supabase configured, JWT NOT ready → mock (dev warning logged)
 *   Supabase configured, JWT ready     → real DB + RLS
 *
 * Key business rules enforced in service (AND in RLS):
 *   - createEmployee / updateEmployee: Admin / HR only
 *   - createAllocation: Admin / HR / PM only
 *   - Overbooking check: sum of active allocation_percent in date range must not
 *     exceed 100% unless force=true AND role=admin
 *   - deactivateEmployee: sets is_active=false; warns if active allocations remain
 *   - reactivateEmployee: sets is_active=true, employment_status='active'
 *   - Certification expiry badges: computed in-service, never stored
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { employees as DUMMY_EMP, workloadByMonth } from "@/lib/dummy-data";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import { getCertBadge } from "@/types/employee-view";
import type {
  EmployeeView,
  EmployeeSkillView,
  EmployeeCertificationView,
  AllocationView,
  CapacityWarning,
  WorkloadMonth,
  HeatmapRow,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  SkillCreateInput,
  CertificationCreateInput,
  AllocationCreateInput,
  AllocationUpdateInput,
  EmployeeFilterInput,
} from "@/types/employee-view";

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT not ready — using mock employees.");
    return false;
  }
  return true;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function norm(r: string | null | undefined) {
  return (r ?? "").toLowerCase().replace(/ /g, "_");
}

function isAdmin(role: string | null | undefined) {
  return norm(role) === "admin";
}

function isAdminOrHR(role: string | null | undefined) {
  const r = norm(role);
  return r === "admin" || r === "hr";
}

function canAllocate(role: string | null | undefined) {
  const r = norm(role);
  return ["admin", "hr", "project_manager"].includes(r);
}

// ─── SessionStorage mock helpers ──────────────────────────────────────────────

const MOCK_EMP_KEY = "mep-employees-mock";
const MOCK_SKILLS_KEY = "mep-emp-skills-mock";
const MOCK_CERTS_KEY = "mep-emp-certs-mock";
const MOCK_ALLOC_KEY = "mep-emp-allocs-mock";

type DummyRaw = (typeof DUMMY_EMP)[number];

function toView(raw: DummyRaw): EmployeeView {
  return {
    id: raw.id,
    organization_id: "mock-org",
    profile_id: null,
    employee_number: raw.id.replace("e", "EMP-00"),
    full_name: raw.name,
    email: `${raw.name.toLowerCase().replace(/\s+/g, ".")}@electraflow.ai`,
    role: "electrical_engineer",
    department: "Engineering",
    discipline: "Electrical",
    title: raw.role,
    phone: null,
    hire_date: null,
    employment_type: "full_time",
    employment_status: raw.status === "Inactive" ? "terminated" : "active",
    default_weekly_capacity_hours: 40,
    billable_target_percent: 80,
    location: null,
    manager_id: null,
    start_date: null,
    end_date: null,
    is_active: raw.status !== "Inactive",
    hourly_rate: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    manager_name: null,
    current_utilization_percent: raw.util ?? 0,
    current_projects: raw.current ? [raw.current] : [],
  };
}

function getMockEmployees(): EmployeeView[] {
  const base = DUMMY_EMP.map(toView);
  try {
    const raw = sessionStorage.getItem(MOCK_EMP_KEY);
    const overrides: EmployeeView[] = raw ? (JSON.parse(raw) as EmployeeView[]) : [];
    const ids = new Set(overrides.map((e) => e.id));
    return [...overrides, ...base.filter((e) => !ids.has(e.id))];
  } catch {
    return base;
  }
}

function saveMockEmployees(items: EmployeeView[]): void {
  try {
    const base = DUMMY_EMP.map(toView);
    const baseIds = new Set(base.map((e) => e.id));
    const custom = items.filter((e) => !baseIds.has(e.id));
    const mutated = items.filter((e) => {
      if (!baseIds.has(e.id)) return false;
      const b = base.find((b) => b.id === e.id);
      return JSON.stringify(e) !== JSON.stringify(b);
    });
    sessionStorage.setItem(MOCK_EMP_KEY, JSON.stringify([...custom, ...mutated]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional
}

function getMockSkills(empId: string): EmployeeSkillView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_SKILLS_KEY);
    const all: EmployeeSkillView[] = raw ? (JSON.parse(raw) as EmployeeSkillView[]) : [];
    return all.filter((s) => s.employee_id === empId && !s.deleted_at);
  } catch {
    return [];
  }
}

function saveMockSkill(s: EmployeeSkillView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_SKILLS_KEY);
    const all: EmployeeSkillView[] = raw ? (JSON.parse(raw) as EmployeeSkillView[]) : [];
    sessionStorage.setItem(MOCK_SKILLS_KEY, JSON.stringify([...all, s]));
    // eslint-disable-next-line no-empty
  } catch {}
}

function softDeleteMockSkill(skillId: string): void {
  try {
    const raw = sessionStorage.getItem(MOCK_SKILLS_KEY);
    const all: EmployeeSkillView[] = raw ? (JSON.parse(raw) as EmployeeSkillView[]) : [];
    sessionStorage.setItem(
      MOCK_SKILLS_KEY,
      JSON.stringify(
        all.map((s) => (s.id === skillId ? { ...s, deleted_at: new Date().toISOString() } : s)),
      ),
    );
    // eslint-disable-next-line no-empty
  } catch {}
}

function getMockCerts(empId: string): EmployeeCertificationView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_CERTS_KEY);
    const all: EmployeeCertificationView[] = raw
      ? (JSON.parse(raw) as EmployeeCertificationView[])
      : [];
    return all
      .filter((c) => c.employee_id === empId && !c.deleted_at)
      .map((c) => ({ ...c, cert_badge: getCertBadge(c.expiry_date) }));
  } catch {
    return [];
  }
}

function saveMockCert(c: EmployeeCertificationView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_CERTS_KEY);
    const all: EmployeeCertificationView[] = raw
      ? (JSON.parse(raw) as EmployeeCertificationView[])
      : [];
    sessionStorage.setItem(MOCK_CERTS_KEY, JSON.stringify([...all, c]));
    // eslint-disable-next-line no-empty
  } catch {}
}

function softDeleteMockCert(certId: string): void {
  try {
    const raw = sessionStorage.getItem(MOCK_CERTS_KEY);
    const all: EmployeeCertificationView[] = raw
      ? (JSON.parse(raw) as EmployeeCertificationView[])
      : [];
    sessionStorage.setItem(
      MOCK_CERTS_KEY,
      JSON.stringify(
        all.map((c) => (c.id === certId ? { ...c, deleted_at: new Date().toISOString() } : c)),
      ),
    );
    // eslint-disable-next-line no-empty
  } catch {}
}

function getMockAllocs(empId?: string): AllocationView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_ALLOC_KEY);
    const all: AllocationView[] = raw ? (JSON.parse(raw) as AllocationView[]) : [];
    return empId
      ? all.filter((a) => a.employee_id === empId && !a.deleted_at)
      : all.filter((a) => !a.deleted_at);
  } catch {
    return [];
  }
}

function saveMockAlloc(a: AllocationView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_ALLOC_KEY);
    const all: AllocationView[] = raw ? (JSON.parse(raw) as AllocationView[]) : [];
    sessionStorage.setItem(MOCK_ALLOC_KEY, JSON.stringify([...all, a]));
    // eslint-disable-next-line no-empty
  } catch {}
}

function updateMockAlloc(id: string, patch: Partial<AllocationView>): void {
  try {
    const raw = sessionStorage.getItem(MOCK_ALLOC_KEY);
    const all: AllocationView[] = raw ? (JSON.parse(raw) as AllocationView[]) : [];
    sessionStorage.setItem(
      MOCK_ALLOC_KEY,
      JSON.stringify(all.map((a) => (a.id === id ? { ...a, ...patch } : a))),
    );
    // eslint-disable-next-line no-empty
  } catch {}
}

// ─── Supabase denormalisation helpers ─────────────────────────────────────────

const EMP_SELECT = `
  *,
  manager:employees!manager_id(full_name),
  allocations:resource_allocations(allocation_percent, status, start_date, end_date,
    project:projects!project_id(name))
`;

function empRowToView(row: Record<string, unknown>): EmployeeView {
  const mgr = row.manager as { full_name?: string } | null;
  const allocs =
    (row.allocations as Array<{
      allocation_percent: number;
      status: string;
      start_date: string;
      end_date: string | null;
      project: { name?: string } | null;
    }>) ?? [];
  const today = new Date().toISOString().split("T")[0];
  const active = allocs.filter(
    (a) => a.status === "active" && a.start_date <= today && (!a.end_date || a.end_date >= today),
  );
  const totalPct = active.reduce((sum, a) => sum + (a.allocation_percent ?? 0), 0);
  const projectNames = active.map((a) => a.project?.name).filter(Boolean) as string[];

  return {
    ...(row as unknown as EmployeeView),
    manager_name: mgr?.full_name ?? null,
    current_utilization_percent: totalPct,
    current_projects: projectNames,
  };
}

const ALLOC_SELECT = `
  *,
  employee:employees!employee_id(full_name),
  project:projects!project_id(name, deleted_at)
`;

function allocRowToView(row: Record<string, unknown>): AllocationView {
  const emp = row.employee as { full_name?: string } | null;
  const proj = row.project as { name?: string; deleted_at?: string | null } | null;
  return {
    ...(row as unknown as AllocationView),
    employee_name: emp?.full_name ?? "Unknown",
    project_name: proj?.name ?? "Unknown",
    project_archived: !!proj?.deleted_at,
  };
}

// ─── Overbooking check ────────────────────────────────────────────────────────

async function checkOverbook(
  employeeId: string,
  startDate: string,
  endDate: string | null,
  allocationPct: number,
  excludeId?: string,
): Promise<{ overbooked: boolean; totalPct: number }> {
  const { organizationId } = getSessionContext();
  try {
    let q = supabase!
      .from("resource_allocations")
      .select("allocation_percent")
      .eq("employee_id", employeeId)
      .eq("organization_id", organizationId!)
      .is("deleted_at", null)
      .neq("status", "ended")
      .lte("start_date", endDate ?? "9999-12-31")
      .or(`end_date.is.null,end_date.gte.${startDate}`);

    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    const existing = (data ?? []).reduce(
      (sum: number, r: { allocation_percent: number }) => sum + r.allocation_percent,
      0,
    );
    return { overbooked: existing + allocationPct > 100, totalPct: existing + allocationPct };
  } catch {
    return { overbooked: false, totalPct: allocationPct };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listEmployees(
  filters?: EmployeeFilterInput,
): Promise<ServiceResult<EmployeeView[]>> {
  if (!shouldUseSupabase()) {
    let items = getMockEmployees();
    if (filters?.is_active !== undefined)
      items = items.filter((e) => e.is_active === filters.is_active);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          (e.employee_number ?? "").toLowerCase().includes(q) ||
          (e.title ?? "").toLowerCase().includes(q),
      );
    }
    if (filters?.department) items = items.filter((e) => e.department === filters.department);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(DUMMY_EMP.map(toView));

  try {
    let q = supabase!
      .from("employees")
      .select(EMP_SELECT)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("full_name");

    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.department) q = q.eq("department", filters.department);
    if (filters?.employment_status) q = q.eq("employment_status", filters.employment_status);
    if (filters?.search)
      q = q.or(`full_name.ilike.%${filters.search}%,employee_number.ilike.%${filters.search}%`);

    const { data, error } = await q;
    if (error) return fail<EmployeeView[]>(error);
    return ok((data ?? []).map((r: unknown) => empRowToView(r as Record<string, unknown>)));
  } catch (err) {
    return fail<EmployeeView[]>(err);
  }
}

export async function getEmployee(id: string): Promise<ServiceResult<EmployeeView>> {
  if (!shouldUseSupabase()) {
    const found = getMockEmployees().find((e) => e.id === id);
    if (!found) return fail<EmployeeView>(`Employee ${id} not found.`);
    return mockOk(found);
  }

  try {
    const { data, error } = await supabase!
      .from("employees")
      .select(EMP_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail<EmployeeView>(error);
    if (!data) return fail<EmployeeView>("Employee not found.");
    return ok(empRowToView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<EmployeeView>(err);
  }
}

export async function createEmployee(
  input: EmployeeCreateInput,
): Promise<ServiceResult<EmployeeView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<EmployeeView>("Only Admin and HR can create employees.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockEmployees();
    if (input.employee_number && all.some((e) => e.employee_number === input.employee_number)) {
      return fail<EmployeeView>("Employee number already exists in this organisation.");
    }
    const newEmp: EmployeeView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      profile_id: input.profile_id ?? null,
      employee_number: input.employee_number ?? null,
      full_name: input.full_name,
      email: input.email,
      role: input.role,
      department: input.department ?? null,
      discipline: input.discipline ?? null,
      title: input.title ?? null,
      phone: input.phone ?? null,
      hire_date: input.hire_date ?? null,
      employment_type: input.employment_type,
      employment_status: input.employment_status ?? "active",
      default_weekly_capacity_hours: input.default_weekly_capacity_hours ?? 40,
      billable_target_percent: input.billable_target_percent ?? 80,
      location: input.location ?? null,
      manager_id: input.manager_id ?? null,
      start_date: input.start_date ?? null,
      end_date: null,
      is_active: true,
      hourly_rate: input.hourly_rate ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      updated_by: null,
      deleted_at: null,
      manager_name: null,
      current_utilization_percent: 0,
      current_projects: [],
    };
    saveMockEmployees([newEmp, ...all]);
    return mockOk(newEmp);
  }

  if (!organizationId) {
    return fail<EmployeeView>("Organisation is not configured for this user.");
  }

  try {
    const { data, error } = await supabase!
      .from("employees")
      .insert({
        ...input,
        organization_id: organizationId,
        is_active: true,
        employment_status: input.employment_status ?? "active",
        default_weekly_capacity_hours: input.default_weekly_capacity_hours ?? 40,
        created_by: userId,
        updated_by: userId,
      })
      .select(EMP_SELECT)
      .single();

    if (error) {
      if (error.code === "23505")
        return fail<EmployeeView>("Employee number already exists in this organisation.");
      return fail<EmployeeView>(error);
    }

    void logAction({
      action: "employee.created",
      resource_type: "employee",
      resource_id: (data as { id: string }).id,
      new_data: { full_name: input.full_name },
    });
    return ok(empRowToView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<EmployeeView>(err);
  }
}

export async function updateEmployee(
  id: string,
  input: EmployeeUpdateInput,
): Promise<ServiceResult<EmployeeView>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<EmployeeView>("Only Admin and HR can update employees.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockEmployees();
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) return fail<EmployeeView>("Employee not found.");
    const updated = { ...all[idx], ...input, updated_at: new Date().toISOString() };
    const next = [...all];
    next[idx] = updated;
    saveMockEmployees(next);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase!
      .from("employees")
      .update({ ...input, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", id)
      .select(EMP_SELECT)
      .single();

    if (error) {
      if (error.code === "23505")
        return fail<EmployeeView>("Employee number already exists in this organisation.");
      return fail<EmployeeView>(error);
    }
    return ok(empRowToView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<EmployeeView>(err);
  }
}

export async function deactivateEmployee(
  id: string,
): Promise<ServiceResult<EmployeeView & { warning?: string }>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<EmployeeView & { warning?: string }>("Only Admin and HR can deactivate employees.");
  }

  // Check for active allocations (warn, don't block)
  let warning: string | undefined;
  if (shouldUseSupabase()) {
    const { data: activeAllocs } = await supabase!
      .from("resource_allocations")
      .select("id")
      .eq("employee_id", id)
      .eq("organization_id", organizationId!)
      .eq("status", "active")
      .is("deleted_at", null);

    if (activeAllocs && activeAllocs.length > 0) {
      warning = `This employee has ${activeAllocs.length} active allocation(s). They will remain until manually ended.`;
    }
  }

  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockEmployees();
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) return fail<EmployeeView & { warning?: string }>("Employee not found.");
    const updated = {
      ...all[idx],
      is_active: false,
      employment_status: "terminated" as const,
      end_date: now.split("T")[0],
      updated_at: now,
    };
    const next = [...all];
    next[idx] = updated;
    saveMockEmployees(next);
    return mockOk({ ...updated, warning });
  }

  try {
    const { data, error } = await supabase!
      .from("employees")
      .update({
        is_active: false,
        employment_status: "terminated",
        end_date: now.split("T")[0],
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(EMP_SELECT)
      .single();

    if (error) return fail<EmployeeView & { warning?: string }>(error);
    void logAction({
      action: "employee.deactivated",
      resource_type: "employee",
      resource_id: id,
    });
    return ok({ ...empRowToView(data as unknown as Record<string, unknown>), warning });
  } catch (err) {
    return fail<EmployeeView & { warning?: string }>(err);
  }
}

export async function reactivateEmployee(id: string): Promise<ServiceResult<EmployeeView>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<EmployeeView>("Only Admin and HR can reactivate employees.");
  }

  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockEmployees();
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) return fail<EmployeeView>("Employee not found.");
    const updated = {
      ...all[idx],
      is_active: true,
      employment_status: "active" as const,
      end_date: null,
      updated_at: now,
    };
    const next = [...all];
    next[idx] = updated;
    saveMockEmployees(next);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase!
      .from("employees")
      .update({
        is_active: true,
        employment_status: "active",
        end_date: null,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(EMP_SELECT)
      .single();

    if (error) return fail<EmployeeView>(error);
    void logAction({
      action: "employee.reactivated",
      resource_type: "employee",
      resource_id: id,
    });
    return ok(empRowToView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<EmployeeView>(err);
  }
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export async function listSkills(employeeId: string): Promise<ServiceResult<EmployeeSkillView[]>> {
  if (!shouldUseSupabase()) return mockOk(getMockSkills(employeeId));

  try {
    const { data, error } = await supabase!
      .from("employee_skills")
      .select("*")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("skill_name");

    if (error) return fail<EmployeeSkillView[]>(error);
    return ok((data ?? []) as EmployeeSkillView[]);
  } catch (err) {
    return fail<EmployeeSkillView[]>(err);
  }
}

export async function addSkill(
  employeeId: string,
  input: SkillCreateInput,
): Promise<ServiceResult<EmployeeSkillView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<EmployeeSkillView>("Only Admin and HR can add skills.");
  }

  if (!shouldUseSupabase()) {
    const skill: EmployeeSkillView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      employee_id: employeeId,
      skill_name: input.skill_name,
      skill_category: input.skill_category ?? null,
      proficiency_level: input.proficiency_level,
      years_experience: input.years_experience ?? null,
      certified: input.certified ?? false,
      last_used_date: input.last_used_date ?? null,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    saveMockSkill(skill);
    return mockOk(skill);
  }

  try {
    const { data, error } = await supabase!
      .from("employee_skills")
      .insert({ ...input, employee_id: employeeId, organization_id: organizationId! })
      .select()
      .single();

    if (error) return fail<EmployeeSkillView>(error);
    return ok(data as EmployeeSkillView);
  } catch (err) {
    return fail<EmployeeSkillView>(err);
  }
}

export async function removeSkill(skillId: string): Promise<ServiceResult<boolean>> {
  const { role } = getSessionContext();
  if (!isAdminOrHR(role)) return fail<boolean>("Only Admin and HR can remove skills.");

  if (!shouldUseSupabase()) {
    softDeleteMockSkill(skillId);
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("employee_skills")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", skillId);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

// ─── Certifications ───────────────────────────────────────────────────────────

export async function listCertifications(
  employeeId: string,
): Promise<ServiceResult<EmployeeCertificationView[]>> {
  if (!shouldUseSupabase()) return mockOk(getMockCerts(employeeId));

  try {
    const { data, error } = await supabase!
      .from("employee_certifications")
      .select("*")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    if (error) return fail<EmployeeCertificationView[]>(error);
    return ok(
      (data ?? []).map((c: { expiry_date?: string | null } & Record<string, unknown>) => ({
        ...(c as unknown as EmployeeCertificationView),
        cert_badge: getCertBadge(c.expiry_date ?? null),
      })),
    );
  } catch (err) {
    return fail<EmployeeCertificationView[]>(err);
  }
}

export async function addCertification(
  employeeId: string,
  input: CertificationCreateInput,
): Promise<ServiceResult<EmployeeCertificationView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!isAdminOrHR(role)) {
    return fail<EmployeeCertificationView>("Only Admin and HR can add certifications.");
  }

  if (!shouldUseSupabase()) {
    const cert: EmployeeCertificationView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      employee_id: employeeId,
      certification_name: input.certification_name,
      issuing_body: input.issuing_body ?? null,
      certification_number: input.certification_number ?? null,
      issue_date: input.issue_date ?? null,
      expiry_date: input.expiry_date ?? null,
      attachment_url: input.attachment_url ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      cert_badge: getCertBadge(input.expiry_date ?? null),
    };
    saveMockCert(cert);
    return mockOk(cert);
  }

  try {
    const { data, error } = await supabase!
      .from("employee_certifications")
      .insert({
        ...input,
        employee_id: employeeId,
        organization_id: organizationId!,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return fail<EmployeeCertificationView>(error);
    const c = data as { expiry_date?: string | null } & Record<string, unknown>;
    return ok({
      ...(c as unknown as EmployeeCertificationView),
      cert_badge: getCertBadge(c.expiry_date ?? null),
    });
  } catch (err) {
    return fail<EmployeeCertificationView>(err);
  }
}

export async function removeCertification(certId: string): Promise<ServiceResult<boolean>> {
  const { role } = getSessionContext();
  if (!isAdminOrHR(role)) return fail<boolean>("Only Admin and HR can remove certifications.");

  if (!shouldUseSupabase()) {
    softDeleteMockCert(certId);
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("employee_certifications")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", certId);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

// ─── Allocations ──────────────────────────────────────────────────────────────

export async function listAllocations(
  employeeId?: string,
  projectId?: string,
): Promise<ServiceResult<AllocationView[]>> {
  if (!shouldUseSupabase()) return mockOk(getMockAllocs(employeeId));

  try {
    let q = supabase!
      .from("resource_allocations")
      .select(ALLOC_SELECT)
      .is("deleted_at", null)
      .order("start_date", { ascending: false });

    if (employeeId) q = q.eq("employee_id", employeeId);
    if (projectId) q = q.eq("project_id", projectId);

    const { data, error } = await q;
    if (error) return fail<AllocationView[]>(error);
    return ok((data ?? []).map((r: unknown) => allocRowToView(r as Record<string, unknown>)));
  } catch (err) {
    return fail<AllocationView[]>(err);
  }
}

export async function createAllocation(
  input: AllocationCreateInput,
): Promise<ServiceResult<AllocationView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!canAllocate(role)) {
    return fail<AllocationView>("Only Admin, HR, and Project Manager can create allocations.");
  }
  if (input.allocation_percent < 1 || input.allocation_percent > 100) {
    return fail<AllocationView>("Allocation percent must be between 1 and 100.");
  }
  if (input.end_date && input.end_date < input.start_date) {
    return fail<AllocationView>("End date must be after start date.");
  }

  if (!shouldUseSupabase()) {
    // Mock overbooking check
    const existing = getMockAllocs(input.employee_id)
      .filter((a) => a.status === "active")
      .reduce((sum, a) => sum + a.allocation_percent, 0);
    const total = existing + input.allocation_percent;

    if (total > 100 && !input.force) {
      return fail<AllocationView>(
        `OVERBOOK: This employee would be at ${total}% for this period. Admin can force-override.`,
      );
    }

    const newAlloc: AllocationView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      employee_id: input.employee_id,
      project_id: input.project_id,
      role_on_project: input.role_on_project ?? null,
      allocation_percent: input.allocation_percent,
      weekly_hours: input.weekly_hours ?? null,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      status: "active",
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      updated_by: null,
      deleted_at: null,
      employee_name: "Demo Employee",
      project_name: "Demo Project",
      project_archived: false,
    };
    saveMockAlloc(newAlloc);
    return mockOk(newAlloc);
  }

  if (!organizationId) {
    return fail<AllocationView>("Organisation is not configured for this user.");
  }

  // Overbooking check
  const { overbooked, totalPct } = await checkOverbook(
    input.employee_id,
    input.start_date,
    input.end_date ?? null,
    input.allocation_percent,
  );

  if (overbooked && !input.force) {
    return fail<AllocationView>(
      `OVERBOOK: This employee would be at ${totalPct}% for this period. Admin can force-override.`,
    );
  }
  if (overbooked && input.force && !isAdmin(role)) {
    return fail<AllocationView>("Only Admin can force-override an overbooking.");
  }

  try {
    const { data, error } = await supabase!
      .from("resource_allocations")
      .insert({
        organization_id: organizationId,
        employee_id: input.employee_id,
        project_id: input.project_id,
        role_on_project: input.role_on_project ?? null,
        allocation_percent: input.allocation_percent,
        weekly_hours: input.weekly_hours ?? null,
        start_date: input.start_date,
        end_date: input.end_date ?? null,
        status: "active",
        notes: input.notes ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select(ALLOC_SELECT)
      .single();

    if (error) return fail<AllocationView>(error);
    void logAction({
      action: "resource.allocated",
      resource_type: "resource_allocation",
      resource_id: (data as { id: string }).id,
      new_data: {
        employee_id: input.employee_id,
        project_id: input.project_id,
        allocation_percent: input.allocation_percent,
      },
    });
    return ok(allocRowToView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<AllocationView>(err);
  }
}

export async function updateAllocation(
  id: string,
  input: AllocationUpdateInput,
): Promise<ServiceResult<AllocationView>> {
  const { userId, role } = getSessionContext();

  if (!canAllocate(role)) {
    return fail<AllocationView>("Only Admin, HR, and Project Manager can update allocations.");
  }

  if (!shouldUseSupabase()) {
    updateMockAlloc(id, {
      ...input,
      updated_at: new Date().toISOString(),
    });
    const updated = getMockAllocs().find((a) => a.id === id);
    return mockOk(updated!);
  }

  try {
    const { data, error } = await supabase!
      .from("resource_allocations")
      .update({ ...input, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", id)
      .select(ALLOC_SELECT)
      .single();

    if (error) return fail<AllocationView>(error);
    return ok(allocRowToView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<AllocationView>(err);
  }
}

export async function archiveAllocation(id: string): Promise<ServiceResult<boolean>> {
  const { userId, role } = getSessionContext();

  if (!canAllocate(role)) {
    return fail<boolean>("Only Admin, HR, and Project Manager can end allocations.");
  }

  if (!shouldUseSupabase()) {
    updateMockAlloc(id, {
      status: "ended",
      deleted_at: new Date().toISOString(),
    });
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("resource_allocations")
      .update({
        status: "ended",
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id);

    if (error) return fail<boolean>(error);
    void logAction({
      action: "resource.allocation_ended",
      resource_type: "resource_allocation",
      resource_id: id,
    });
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

// ─── Workload summary ────────────────────────────────────────────────────────

export async function getWorkloadSummary(): Promise<ServiceResult<WorkloadMonth[]>> {
  if (!shouldUseSupabase()) {
    // Derive from dummy data so demo mode has real-looking data
    const rows: WorkloadMonth[] = workloadByMonth.map((d) => ({
      month: d.m,
      required_hours: d.required,
      available_hours: d.available,
      utilization_pct: Math.round((d.required / d.available) * 100),
    }));
    return mockOk(rows);
  }

  try {
    const { organizationId } = getSessionContext();
    const now = new Date();
    const months: WorkloadMonth[] = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = d.toLocaleString("default", { month: "short", year: "numeric" });
      const monthStr = d.toISOString().slice(0, 7); // "2026-07"
      const firstDay = `${monthStr}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

      const { data: allocs } = await supabase!
        .from("resource_allocations")
        .select("allocation_percent, employee:employees!employee_id(default_weekly_capacity_hours)")
        .eq("organization_id", organizationId!)
        .eq("status", "active")
        .is("deleted_at", null)
        .lte("start_date", lastDay)
        .or(`end_date.is.null,end_date.gte.${firstDay}`);

      const { data: emps } = await supabase!
        .from("employees")
        .select("default_weekly_capacity_hours")
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .is("deleted_at", null);

      const available = (emps ?? []).reduce(
        (sum: number, e: { default_weekly_capacity_hours?: number }) =>
          sum + (e.default_weekly_capacity_hours ?? 40),
        0,
      );

      const required = (
        (allocs ?? []) as unknown as Array<{
          allocation_percent: number;
          employee:
            | { default_weekly_capacity_hours?: number }
            | { default_weekly_capacity_hours?: number }[]
            | null;
        }>
      ).reduce((sum, a) => {
        const empData = Array.isArray(a.employee) ? a.employee[0] : a.employee;
        const cap = empData?.default_weekly_capacity_hours ?? 40;
        return sum + cap * (a.allocation_percent / 100);
      }, 0);

      months.push({
        month: label,
        required_hours: Math.round(required),
        available_hours: Math.round(available),
        utilization_pct: available > 0 ? Math.round((required / available) * 100) : 0,
      });
    }

    return ok(months);
  } catch (err) {
    return fail<WorkloadMonth[]>(err);
  }
}

export async function getCapacityWarnings(): Promise<ServiceResult<CapacityWarning[]>> {
  if (!shouldUseSupabase()) {
    const warnings: CapacityWarning[] = DUMMY_EMP.filter((e) => e.util > 95).map((e) => ({
      employee_id: e.id,
      employee_name: e.name,
      health: "overbooked",
      utilization_percent: e.util,
      billable_target_percent: 80,
    }));
    return mockOk(warnings);
  }

  try {
    const { organizationId } = getSessionContext();
    const today = new Date().toISOString().split("T")[0];

    const { data: emps } = await supabase!
      .from("employees")
      .select("id, full_name, default_weekly_capacity_hours, billable_target_percent, is_active")
      .eq("organization_id", organizationId!)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (!emps || emps.length === 0) return ok([]);

    const { data: allocs } = await supabase!
      .from("resource_allocations")
      .select("employee_id, allocation_percent")
      .eq("organization_id", organizationId!)
      .eq("status", "active")
      .is("deleted_at", null)
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${today}`);

    const allocByEmp: Record<string, number> = {};
    for (const a of allocs ?? []) {
      allocByEmp[a.employee_id] = (allocByEmp[a.employee_id] ?? 0) + a.allocation_percent;
    }

    const warnings: CapacityWarning[] = (
      emps as Array<{
        id: string;
        full_name: string;
        default_weekly_capacity_hours: number;
        billable_target_percent: number | null;
        is_active: boolean;
      }>
    ).map((e) => {
      const pct = allocByEmp[e.id] ?? 0;
      const target = e.billable_target_percent ?? 80;
      let health: CapacityWarning["health"] = "healthy";
      if (!e.is_active) health = "unavailable";
      else if (pct > 100) health = "overbooked";
      else if (pct < target) health = "underutilized";
      return {
        employee_id: e.id,
        employee_name: e.full_name,
        health,
        utilization_percent: pct,
        billable_target_percent: target,
      };
    });

    return ok(warnings);
  } catch (err) {
    return fail<CapacityWarning[]>(err);
  }
}

export async function getHeatmapData(): Promise<ServiceResult<HeatmapRow[]>> {
  if (!shouldUseSupabase()) {
    const rows: HeatmapRow[] = DUMMY_EMP.map((e) => ({
      employee_id: e.id,
      employee_name: e.name,
      months: [0, 1, 2, 3, 4, 5].map((offset) => {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return {
          label: d.toLocaleString("default", { month: "short" }),
          percent: Math.min(100, (e.util ?? 80) + (offset - 2) * 3),
        };
      }),
    }));
    return mockOk(rows);
  }

  try {
    const { organizationId } = getSessionContext();

    const { data: emps } = await supabase!
      .from("employees")
      .select("id, full_name")
      .eq("organization_id", organizationId!)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name");

    if (!emps || emps.length === 0) return ok([]);

    const rows: HeatmapRow[] = await Promise.all(
      (emps as Array<{ id: string; full_name: string }>).map(async (emp) => {
        const months: HeatmapRow["months"] = [];
        for (let i = 0; i < 6; i++) {
          const d = new Date();
          d.setMonth(d.getMonth() + i);
          const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
          const label = d.toLocaleString("default", { month: "short" });

          const { data: allocs } = await supabase!
            .from("resource_allocations")
            .select("allocation_percent")
            .eq("employee_id", emp.id)
            .eq("status", "active")
            .is("deleted_at", null)
            .lte("start_date", lastDay)
            .or(`end_date.is.null,end_date.gte.${firstDay}`);

          const total = (allocs ?? []).reduce(
            (sum: number, a: { allocation_percent: number }) => sum + a.allocation_percent,
            0,
          );
          months.push({ label, percent: Math.min(total, 120) });
        }
        return { employee_id: emp.id, employee_name: emp.full_name, months };
      }),
    );

    return ok(rows);
  } catch (err) {
    return fail<HeatmapRow[]>(err);
  }
}
