/**
 * Project service — Phase 4.1 (security cleanup)
 *
 * Data routing rules (priority order):
 *   1. Demo session                          → mock / sessionStorage overlay
 *   2. Supabase not configured               → mock / sessionStorage overlay
 *   3. Supabase configured, JWT NOT ready    → mock / sessionStorage overlay
 *                                              + dev console info message
 *   4. Supabase configured, JWT ready        → real Supabase CRUD (Phase 5+)
 *
 * Phase 4.1 reality: IS_JWT_READY = false → all requests use mock path.
 *
 * The Supabase code stubs are kept in the Phase 5 branches so the migration
 * is a single flag flip (IS_JWT_READY = true) once Clerk JWT is wired.
 *
 * Removed from Phase 4.0:
 *   • serviceClient (service role key — was a client-side security risk)
 *   • resolveOrganizationId() (depended on serviceClient)
 *   • routeToSupabase() union type (replaced by simple shouldUseSupabase())
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext, getCurrentUserId, getCurrentOrganizationId } from "@/lib/auth-bridge";
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

// ─── Routing gate ─────────────────────────────────────────────────────────────

/**
 * Returns true only when it is safe and appropriate to query Supabase directly.
 *
 * Phase 4.1: always returns false because IS_JWT_READY = false.
 *   Without a valid JWT, auth.uid() is null in RLS → queries are blocked.
 *   The anon key alone must never be used for protected data without auth context.
 *
 * Phase 5: returns true once IS_JWT_READY is flipped after Clerk JWT wiring.
 */
function shouldUseSupabase(): boolean {
  const { isDemo } = getSessionContext();
  // Demo sessions never hit Supabase — always mock/sessionStorage.
  if (isDemo) return false;
  // Supabase not configured → mock.
  if (!IS_SUPABASE_CONFIGURED) return false;
  // JWT not ready → profile not bootstrapped yet → mock.
  // isJwtReady() is a runtime check (not import-time), so it reflects the
  // current session state: false before bootstrap, true after.
  if (!isJwtReady()) {
    if (import.meta.env.DEV) {
      console.info(
        "[ElectraFlow] Project service: Supabase configured but JWT not ready. " +
          "Using mock/sessionStorage. Bootstrap completes after Clerk sign-in.",
      );
    }
    return false;
  }
  return true;
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

/** Convert a Supabase row (with optional joined clients/pm) to ProjectView. */
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

// ─── Compose mock project list (base + sessionStorage overlay) ────────────────

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
  // Phase 4.1: shouldUseSupabase() always returns false.
  if (!shouldUseSupabase()) {
    return mockOk(applyMockRoleFilter(getMockProjectList()));
  }

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  // Reached only when IS_JWT_READY = true and Clerk JWT is set on supabase client.
  const orgId = getCurrentOrganizationId();
  if (!orgId) {
    return fail<ProjectView[]>("Organisation ID not resolved from JWT. Check Phase 5 auth setup.");
  }

  try {
    const { data, error } = await supabase!
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
  if (!shouldUseSupabase()) {
    const project = getMockProjectList().find((p) => p.id === id);
    if (!project) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(project);
  }

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  try {
    const { data, error } = await supabase!
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
  if (!shouldUseSupabase()) {
    // Mock / sessionStorage path — changes visible in this tab until refresh
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

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  const orgId = getCurrentOrganizationId();
  if (!orgId) return fail<ProjectView>("Organisation ID not resolved from JWT.");
  const userId = getCurrentUserId();

  try {
    const { data, error } = await supabase!
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
  if (!shouldUseSupabase()) {
    const overlay = getOverlay();
    overlay.updated[id] = { ...(overlay.updated[id] ?? {}), ...input };
    saveOverlay(overlay);
    const updated = getMockProjectList().find((p) => p.id === id);
    if (!updated) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(updated);
  }

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  const userId = getCurrentUserId();

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
    const { data, error } = await supabase!
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
      client_name: input.client_name ?? (data as ProjectView).client_name ?? null,
      pm_name: input.pm_name ?? (data as ProjectView).pm_name ?? null,
    });
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: archive (soft-delete) ──────────────────────────────────────────

export async function archiveProject(id: string): Promise<ServiceResult<boolean>> {
  if (!shouldUseSupabase()) {
    const overlay = getOverlay();
    if (!overlay.archived.includes(id)) overlay.archived.push(id);
    saveOverlay(overlay);
    return mockOk(true);
  }

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  const userId = getCurrentUserId();

  try {
    const { error } = await supabase!
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
  if (!shouldUseSupabase()) {
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

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  try {
    const { data, error } = await supabase!
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
  if (!shouldUseSupabase()) {
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

  // ── Phase 5+ Supabase path ─────────────────────────────────────────────────
  try {
    const { data, error } = await supabase!
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
