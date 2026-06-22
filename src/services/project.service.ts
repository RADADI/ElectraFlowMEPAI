/**
 * Project service — Phase 4 (real Supabase CRUD)
 *
 * Routing rules (in priority order):
 *   1. Demo session  → always use mock/sessionStorage overlay.
 *   2. Supabase not configured → mock/sessionStorage overlay.
 *   3. Supabase configured but no org_id → explicit error (never silent mock).
 *   4. Supabase configured + org_id → real DB operations.
 *
 * For Phase 4 (before Clerk JWT, Phase 5):
 *   DB operations use `serviceClient` (service role, bypasses RLS) when available.
 *   Without `serviceClient`, RLS blocks the anon key → service returns an error
 *   asking the user to set VITE_SUPABASE_SERVICE_ROLE_KEY.
 *
 * Mock mode features (when routing to mock):
 *   • sessionStorage overlay so create/update/archive survive within the session.
 *   • Role-based list filtering.
 *   • Demo-mode banner shown by UI (isMockData === true).
 */

import { supabase, serviceClient, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext, getCurrentUserId, resolveOrganizationId } from "@/lib/auth-bridge";
import { getStoredUser } from "@/contexts/auth-context";
import { projects as MOCK_PROJECTS, employees as MOCK_EMPLOYEES } from "@/lib/dummy-data";
import type {
  ProjectView,
  ProjectMemberView,
  ProjectMilestoneView,
  ProjectCreateInput,
  ProjectUpdateInput,
} from "@/types/project-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";

// ─── Active DB client helper ──────────────────────────────────────────────────

/**
 * Returns the best available Supabase client:
 *   serviceClient  (bypasses RLS, Phase 4 dev) if configured
 *   supabase       (anon key, needs JWT for RLS) as fallback
 *   null           if Supabase is not configured at all
 */
function db() {
  return serviceClient ?? supabase;
}

/**
 * Check whether we should use Supabase or mock for a given request.
 * Returns the org_id when Supabase path is appropriate.
 *
 * Returns: { useSupabase: false } → use mock
 *          { useSupabase: true, orgId: string, client: SupabaseClient } → use Supabase
 *          { useSupabase: true, orgId: null, error: string } → surface org error to UI
 */
type SupabaseRouting =
  | { useSupabase: false }
  | { useSupabase: true; orgId: string; client: NonNullable<ReturnType<typeof db>> }
  | { useSupabase: true; orgId: null; error: string };

async function routeToSupabase(): Promise<SupabaseRouting> {
  const { isDemo } = getSessionContext();

  // Demo sessions always use mock — never touch the database
  if (isDemo) return { useSupabase: false };

  // Supabase not configured — use mock
  if (!IS_SUPABASE_CONFIGURED) return { useSupabase: false };

  const client = db();

  // Supabase is configured but no client (shouldn't happen, but guard anyway)
  if (!client) return { useSupabase: false };

  // Resolve organisation ID (sync fast-path, then async Supabase lookup)
  const orgId = await resolveOrganizationId();

  if (!orgId) {
    // Supabase IS configured, user is NOT demo, but we can't find org_id.
    // This is an explicit error — never silently fall back to mock.
    const msg = IS_SUPABASE_CONFIGURED
      ? "Organization not configured. " +
        "Set VITE_SUPABASE_ORG_ID in your .env file or ensure your profile " +
        "exists in the Supabase database (run seed.sql)."
      : "Supabase is not configured.";
    return { useSupabase: true, orgId: null, error: msg };
  }

  return { useSupabase: true, orgId, client };
}

// ─── Session-storage overlay (mock mutations) ─────────────────────────────────

const OVERLAY_KEY = "ef-mock-projects-overlay";

interface MockOverlay {
  created: ProjectView[];
  updated: Record<string, Partial<ProjectView>>;
  archived: string[];
}

function getOverlay(): MockOverlay {
  try {
    const raw = sessionStorage.getItem(OVERLAY_KEY);
    return raw ? (JSON.parse(raw) as MockOverlay) : { created: [], updated: {}, archived: [] };
  } catch {
    return { created: [], updated: {}, archived: [] };
  }
}

function saveOverlay(o: MockOverlay): void {
  try {
    sessionStorage.setItem(OVERLAY_KEY, JSON.stringify(o));
  } catch {
    // sessionStorage unavailable — ignore
  }
}

// ─── Mock data adapters ───────────────────────────────────────────────────────

type RawProject = (typeof MOCK_PROJECTS)[number];

function mapStatus(s: string): ProjectView["status"] {
  const m: Record<string, ProjectView["status"]> = {
    "On Track": "active",
    Delayed: "on_hold",
    "At Risk": "on_hold",
  };
  return (m[s] as ProjectView["status"]) ?? "active";
}

function mapPriority(s: string | undefined): ProjectView["priority"] {
  const m: Record<string, ProjectView["priority"]> = {
    Low: "low",
    Medium: "medium",
    High: "high",
    Critical: "critical",
  };
  return (s ? (m[s] ?? "medium") : "medium") as ProjectView["priority"];
}

function mapRisk(s: string | undefined): ProjectView["risk_level"] {
  const m: Record<string, ProjectView["risk_level"]> = {
    Low: "low",
    Medium: "medium",
    High: "high",
    Critical: "critical",
  };
  return (s ? (m[s] ?? "low") : "low") as ProjectView["risk_level"];
}

function toProjectView(raw: RawProject): ProjectView {
  return {
    id: raw.id,
    organization_id: "mock-org",
    project_number: raw.number,
    name: raw.name,
    description: null,
    client_id: null,
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    risk_level: mapRisk(raw.risk),
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
    client_name: raw.client ?? null,
    pm_name: raw.pm ?? null,
  };
}

/** Convert a Supabase row (with optional joined clients/pm objects) to ProjectView. */
function rowToProjectView(row: Record<string, unknown>): ProjectView {
  return {
    ...(row as unknown as ProjectView),
    client_name: (row.clients as Record<string, string> | null)?.name ?? null,
    pm_name: (row.pm as Record<string, string> | null)?.full_name ?? null,
  };
}

// ─── Role-based filter (mock mode) ───────────────────────────────────────────

function applyMockRoleFilter(projects: ProjectView[]): ProjectView[] {
  const { role, isDemo } = getSessionContext();
  if (!role) return [];
  if (role === "Admin" || role === "Executive") return projects;
  if (isDemo) return projects;

  const userName = (getStoredUser()?.fullName ?? "").toLowerCase().trim();
  if (!userName) return projects;

  if (role === "Project Manager") {
    return projects.filter((p) => p.pm_name?.toLowerCase().trim() === userName);
  }

  if (role === "Senior Electrical Engineer" || role === "Electrical Engineer") {
    const assignedIds = new Set(
      MOCK_PROJECTS.filter((r) =>
        (r.engineers ?? []).some((e) => e.toLowerCase().trim() === userName),
      ).map((r) => r.id),
    );
    const createdIds = new Set(getOverlay().created.map((p) => p.id));
    return projects.filter((p) => assignedIds.has(p.id) || createdIds.has(p.id));
  }

  return projects;
}

// ─── Compose mock project list (base dummy-data + sessionStorage overlay) ────

function getMockProjectList(): ProjectView[] {
  const overlay = getOverlay();
  const archivedSet = new Set(overlay.archived);

  const base = MOCK_PROJECTS.filter((r) => !archivedSet.has(r.id)).map((raw) => {
    const view = toProjectView(raw);
    const updates = overlay.updated[raw.id];
    return updates ? { ...view, ...updates } : view;
  });

  return [...base, ...overlay.created.filter((p) => !archivedSet.has(p.id))];
}

// ─── Service: list ─────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ServiceResult<ProjectView[]>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    return mockOk(applyMockRoleFilter(getMockProjectList()));
  }

  if (routing.orgId === null) {
    return fail<ProjectView[]>(routing.error);
  }

  const { orgId, client } = routing;

  try {
    const { data, error } = await client
      .from("projects")
      .select("*, clients:client_id(name), pm:pm_id(full_name)")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return fail<ProjectView[]>(error);
    return ok((data ?? []).map((row: Record<string, unknown>) => rowToProjectView(row)));
  } catch (err) {
    return fail<ProjectView[]>(err);
  }
}

// ─── Service: get single ──────────────────────────────────────────────────────

export async function getProject(id: string): Promise<ServiceResult<ProjectView>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    const project = getMockProjectList().find((p) => p.id === id);
    if (!project) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(project);
  }

  if (routing.orgId === null) {
    return fail<ProjectView>(routing.error);
  }

  const { client } = routing;

  try {
    const { data, error } = await client
      .from("projects")
      .select("*, clients:client_id(name), pm:pm_id(full_name)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail<ProjectView>(error);
    if (!data) return fail<ProjectView>(`Project "${id}" not found or has been archived.`);
    return ok(rowToProjectView(data as Record<string, unknown>));
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: create ──────────────────────────────────────────────────────────

export async function createProject(
  input: ProjectCreateInput,
): Promise<ServiceResult<ProjectView>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    // Mock / sessionStorage path
    const now = new Date().toISOString();
    const newProject: ProjectView = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      organization_id: "mock-org",
      project_number: input.project_number,
      name: input.name,
      description: input.description ?? null,
      client_id: null,
      status: input.status ?? "planning",
      priority: input.priority ?? "medium",
      risk_level: input.risk_level ?? "low",
      location: input.location ?? null,
      discipline: input.discipline ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      budget: input.budget ?? null,
      progress_percent: 0,
      pm_id: null,
      created_at: now,
      updated_at: now,
      created_by: null,
      updated_by: null,
      deleted_at: null,
      client_name: input.client_name ?? null,
      pm_name: input.pm_name ?? null,
    };
    const overlay = getOverlay();
    overlay.created.push(newProject);
    saveOverlay(overlay);
    return mockOk(newProject);
  }

  if (routing.orgId === null) {
    return fail<ProjectView>(routing.error);
  }

  const { orgId, client } = routing;
  const userId = getCurrentUserId();

  try {
    const { data, error } = await client
      .from("projects")
      .insert({
        organization_id: orgId,
        project_number: input.project_number,
        name: input.name,
        description: input.description ?? null,
        location: input.location ?? null,
        discipline: input.discipline ?? null,
        status: input.status ?? "planning",
        priority: input.priority ?? "medium",
        risk_level: input.risk_level ?? "low",
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        budget: input.budget ?? null,
        progress_percent: 0,
        ...(userId && { created_by: userId }),
      })
      .select()
      .single();

    if (error) return fail<ProjectView>(error);

    // Note: client_name and pm_name are denormalized view fields.
    // They are passed from the form as human-readable strings.
    // In Phase 5, these will be resolved via client_id/pm_id JOINs.
    return ok({
      ...(data as ProjectView),
      client_name: input.client_name ?? null,
      pm_name: input.pm_name ?? null,
    });
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: update ──────────────────────────────────────────────────────────

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<ServiceResult<ProjectView>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    const overlay = getOverlay();
    overlay.updated[id] = { ...(overlay.updated[id] ?? {}), ...input };
    saveOverlay(overlay);
    const updated = getMockProjectList().find((p) => p.id === id);
    if (!updated) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(updated);
  }

  if (routing.orgId === null) {
    return fail<ProjectView>(routing.error);
  }

  const { client } = routing;
  const userId = getCurrentUserId();

  // Build only the fields that were supplied (undefined = unchanged)
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ...(userId && { updated_by: userId }),
  };

  if (input.project_number !== undefined) patch.project_number = input.project_number;
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.location !== undefined) patch.location = input.location;
  if (input.discipline !== undefined) patch.discipline = input.discipline;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.risk_level !== undefined) patch.risk_level = input.risk_level;
  if (input.start_date !== undefined) patch.start_date = input.start_date;
  if (input.end_date !== undefined) patch.end_date = input.end_date;
  if (input.budget !== undefined) patch.budget = input.budget;

  try {
    const { data, error } = await client
      .from("projects")
      .update(patch)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return fail<ProjectView>(error);
    if (!data) return fail<ProjectView>(`Project "${id}" not found.`);

    return ok({
      ...(data as ProjectView),
      // Preserve denormalized display names from the input (Phase 4)
      client_name: input.client_name ?? (data as ProjectView).client_name ?? null,
      pm_name: input.pm_name ?? (data as ProjectView).pm_name ?? null,
    });
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: archive (soft-delete) ──────────────────────────────────────────

export async function archiveProject(id: string): Promise<ServiceResult<boolean>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    const overlay = getOverlay();
    if (!overlay.archived.includes(id)) overlay.archived.push(id);
    saveOverlay(overlay);
    return mockOk(true);
  }

  if (routing.orgId === null) {
    return fail<boolean>(routing.error);
  }

  const { client } = routing;
  const userId = getCurrentUserId();

  try {
    const { error } = await client
      .from("projects")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(userId && { updated_by: userId }),
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return fail<boolean>(error);
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

// ─── Service: project members ─────────────────────────────────────────────────

export async function listProjectMembers(
  projectId: string,
): Promise<ServiceResult<ProjectMemberView[]>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    const raw = MOCK_PROJECTS.find((p) => p.id === projectId);
    const engineerNames: string[] = raw?.engineers ?? [];
    const members: ProjectMemberView[] = MOCK_EMPLOYEES.filter((e) =>
      engineerNames.includes(e.name),
    ).map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      utilization_percent: e.util,
      status: e.status,
    }));

    if (members.length === 0) {
      members.push({
        id: "demo-pm",
        name: raw?.pm ?? getStoredUser()?.fullName ?? "Project Manager",
        role: "Project Manager",
        utilization_percent: 80,
        status: "Healthy",
      });
    }
    return mockOk(members);
  }

  if (routing.orgId === null) return fail<ProjectMemberView[]>(routing.error);

  const { client } = routing;

  try {
    const { data, error } = await client
      .from("project_members")
      .select("id, profile_id, role, profiles:profile_id(full_name)")
      .eq("project_id", projectId)
      .is("deleted_at", null);

    if (error) return fail<ProjectMemberView[]>(error);
    const views: ProjectMemberView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: (row.profiles as Record<string, string> | null)?.full_name ?? "Unknown",
      role: String(row.role),
      utilization_percent: 0,
      status: "Active",
    }));
    return ok(views);
  } catch (err) {
    return fail<ProjectMemberView[]>(err);
  }
}

// ─── Service: project milestones ──────────────────────────────────────────────

const MILESTONE_TEMPLATES: Omit<ProjectMilestoneView, "id">[] = [
  { name: "Project Kickoff", due_date: null, completed_date: null, is_done: true },
  { name: "Design Development (30%)", due_date: null, completed_date: null, is_done: true },
  { name: "60% Submittals Package", due_date: null, completed_date: null, is_done: false },
  { name: "90% Submittals Package", due_date: null, completed_date: null, is_done: false },
  { name: "Commissioning", due_date: null, completed_date: null, is_done: false },
  { name: "Final Handover", due_date: null, completed_date: null, is_done: false },
];

export async function listProjectMilestones(
  projectId: string,
): Promise<ServiceResult<ProjectMilestoneView[]>> {
  const routing = await routeToSupabase();

  if (!routing.useSupabase) {
    const raw = MOCK_PROJECTS.find((p) => p.id === projectId);
    const progress = raw?.progress ?? 0;
    const doneCount = Math.floor((progress / 100) * MILESTONE_TEMPLATES.length);
    const milestones: ProjectMilestoneView[] = MILESTONE_TEMPLATES.map((m, i) => ({
      ...m,
      id: `${projectId}-ms-${i}`,
      is_done: i < doneCount,
      due_date: raw?.due ?? null,
      completed_date: i < doneCount ? (raw?.start ?? null) : null,
    }));
    return mockOk(milestones);
  }

  if (routing.orgId === null) return fail<ProjectMilestoneView[]>(routing.error);

  const { client } = routing;

  try {
    const { data, error } = await client
      .from("project_milestones")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });

    if (error) return fail<ProjectMilestoneView[]>(error);
    const views: ProjectMilestoneView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name),
      due_date: (row.due_date as string) ?? null,
      completed_date: (row.completed_date as string) ?? null,
      is_done: row.status === "completed",
    }));
    return ok(views);
  } catch (err) {
    return fail<ProjectMilestoneView[]>(err);
  }
}
