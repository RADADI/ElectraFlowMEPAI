/**
 * Employee / Resource service — Phase 3
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { employees as MOCK_EMPLOYEES } from "@/lib/dummy-data";
import type { Employee, EmployeeInsert, EmployeeUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

type MockEmployee = (typeof MOCK_EMPLOYEES)[number];

function toEmployee(raw: MockEmployee): Employee {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    profile_id: null,
    employee_number: String(raw.id),
    full_name: raw.name, // dummy-data: "Sara Khan"
    email: `${raw.name.toLowerCase().replace(/\s+/g, ".")}@electraflow.ai`,
    role: "electrical_engineer" as Employee["role"],
    department: null, // not in dummy-data
    title: raw.role, // dummy-data: "Senior Electrical Engineer"
    phone: null,
    hire_date: null,
    employment_type: "full_time",
    is_active: raw.status !== "Inactive",
    hourly_rate: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

export async function listEmployees(): Promise<ServiceResult<Employee[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_EMPLOYEES.map(toEmployee));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_EMPLOYEES.map(toEmployee));

  try {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("full_name");

    if (error) return fail<Employee[]>(error);
    return ok(data as Employee[]);
  } catch (err) {
    return fail<Employee[]>(err);
  }
}

export async function getEmployee(id: string): Promise<ServiceResult<Employee>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_EMPLOYEES.find((e) => String(e.id) === id);
    if (!raw) return fail<Employee>(`Employee ${id} not found.`);
    return mockOk(toEmployee(raw));
  }

  try {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<Employee>(error);
    return ok(data as Employee);
  } catch (err) {
    return fail<Employee>(err);
  }
}

export async function createEmployee(payload: EmployeeInsert): Promise<ServiceResult<Employee>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Employee>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase.from("employees").insert(payload).select().single();

    if (error) return fail<Employee>(error);
    return ok(data as Employee);
  } catch (err) {
    return fail<Employee>(err);
  }
}

export async function updateEmployee(
  id: string,
  payload: EmployeeUpdate,
): Promise<ServiceResult<Employee>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Employee>("Supabase is not configured.");
  }

  try {
    const { data, error } = await supabase
      .from("employees")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<Employee>(error);
    return ok(data as Employee);
  } catch (err) {
    return fail<Employee>(err);
  }
}
