/**
 * Project service — Phase 3
 * Uses Supabase when configured, falls back to dummy-data.ts otherwise.
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { projects as MOCK_PROJECTS } from "@/lib/dummy-data";
import type { Project, ProjectInsert, ProjectUpdate } from "@/types/database";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

// ─── Mock adapter ─────────────────────────────────────────────────────────────
// Adapts the existing dummy-data shape into the typed Project shape.

function toProject(raw: (typeof MOCK_PROJECTS)[number]): Project {
  return {
    id: raw.id,
    organization_id: "mock-org",
    project_number: raw.number,
    name: raw.name,
    description: null,
    client_id: null,
    status: (raw.status === "Delayed" ? "on_hold" : "active") as Project["status"],
    priority: (raw.priority?.toLowerCase() ?? "medium") as Project["priority"],
    risk_level: (raw.risk?.toLowerCase() ?? "low") as Project["risk_level"],
    location: raw.location ?? null,
    discipline: raw.discipline ?? null,
    start_date: raw.start ?? null,
    end_date: raw.due ?? null,
    budget: raw.budget ?? null,
    progress_percent: raw.progress ?? 0,
    pm_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
  };
}

// ─── Service methods ──────────────────────────────────────────────────────────

/** List all non-deleted projects visible to the current user. */
export async function listProjects(): Promise<ServiceResult<Project[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(MOCK_PROJECTS.map(toProject));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(MOCK_PROJECTS.map(toProject));

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return fail<Project[]>(error);
    return ok(data as Project[]);
  } catch (err) {
    return fail<Project[]>(err);
  }
}

/** Get a single project by ID. */
export async function getProject(id: string): Promise<ServiceResult<Project>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_PROJECTS.find((p) => p.id === id);
    if (!raw) return fail<Project>(`Project ${id} not found in mock data.`);
    return mockOk(toProject(raw));
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<Project>(error);
    return ok(data as Project);
  } catch (err) {
    return fail<Project>(err);
  }
}

/** Create a new project. */
export async function createProject(payload: ProjectInsert): Promise<ServiceResult<Project>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Project>("Supabase is not configured. Cannot create projects in mock mode.");
  }

  try {
    const { data, error } = await supabase.from("projects").insert(payload).select().single();

    if (error) return fail<Project>(error);
    return ok(data as Project);
  } catch (err) {
    return fail<Project>(err);
  }
}

/** Update a project. */
export async function updateProject(
  id: string,
  payload: ProjectUpdate,
): Promise<ServiceResult<Project>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<Project>("Supabase is not configured. Cannot update projects in mock mode.");
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<Project>(error);
    return ok(data as Project);
  } catch (err) {
    return fail<Project>(err);
  }
}

/** Soft-delete a project. */
export async function deleteProject(id: string): Promise<ServiceResult<boolean>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail<boolean>("Supabase is not configured. Cannot delete projects in mock mode.");
  }

  try {
    const { error } = await supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}
