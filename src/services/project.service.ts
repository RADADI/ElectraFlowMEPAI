/**
 * Project service — Phase 4
 *
 * Returns ProjectView (Project + denormalized client_name / pm_name) from
 * either Supabase (when configured) or mock data (dummy-data.ts overlay).
 *
 * Mock mode features:
 *  • Role-based filtering (Admin/Executive: all; PM: managed; Engineers: assigned)
 *  • sessionStorage overlay so create/update/archive survive within the session
 *  • Demo users (isDemo=true) see all projects with a banner in the UI
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
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
    // sessionStorage unavailable (e.g. SSR) — ignore
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
    // ProjectView fields
    client_name: raw.client ?? null,
    pm_name: raw.pm ?? null,
  };
}

// ─── Role-based filter (mock mode) ───────────────────────────────────────────

function applyMockRoleFilter(projects: ProjectView[]): ProjectView[] {
  const { role, isDemo } = getSessionContext();
  if (!role) return [];
  // Admin and Executive see everything
  if (role === "Admin" || role === "Executive") return projects;
  // Demo users see all projects; the UI shows an info banner
  if (isDemo) return projects;

  const userName = (getStoredUser()?.fullName ?? "").toLowerCase().trim();
  if (!userName) return projects;

  if (role === "Project Manager") {
    return projects.filter((p) => p.pm_name?.toLowerCase().trim() === userName);
  }

  if (role === "Senior Electrical Engineer" || role === "Electrical Engineer") {
    // Filter based on the raw engineers array (checked before conversion)
    const assignedIds = new Set(
      MOCK_PROJECTS.filter((r) =>
        (r.engineers ?? []).some((e) => e.toLowerCase().trim() === userName),
      ).map((r) => r.id),
    );
    // Keep newly created mock projects regardless (creator should see them)
    const overlay = getOverlay();
    const createdIds = new Set(overlay.created.map((p) => p.id));
    return projects.filter((p) => assignedIds.has(p.id) || createdIds.has(p.id));
  }

  return projects;
}

// ─── Compose the full mock project list from base + overlay ───────────────────

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
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(applyMockRoleFilter(getMockProjectList()));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(getMockProjectList());

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*, clients:client_id(name), pm:pm_id(full_name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return fail<ProjectView[]>(error);
    const views: ProjectView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as unknown as ProjectView),
      client_name: (row.clients as Record<string, string> | null)?.name ?? null,
      pm_name: (row.pm as Record<string, string> | null)?.full_name ?? null,
    }));
    return ok(views);
  } catch (err) {
    return fail<ProjectView[]>(err);
  }
}

// ─── Service: get single ──────────────────────────────────────────────────────

export async function getProject(id: string): Promise<ServiceResult<ProjectView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const project = getMockProjectList().find((p) => p.id === id);
    if (!project) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(project);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) {
    const project = getMockProjectList().find((p) => p.id === id);
    if (!project) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(project);
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*, clients:client_id(name), pm:pm_id(full_name)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return fail<ProjectView>(error);
    const row = data as Record<string, unknown>;
    return ok({
      ...(row as unknown as ProjectView),
      client_name: (row.clients as Record<string, string> | null)?.name ?? null,
      pm_name: (row.pm as Record<string, string> | null)?.full_name ?? null,
    });
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: create ──────────────────────────────────────────────────────────

export async function createProject(
  input: ProjectCreateInput,
): Promise<ServiceResult<ProjectView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
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

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail<ProjectView>("No active organisation.");

  try {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: organizationId,
        project_number: input.project_number,
        name: input.name,
        description: input.description,
        location: input.location,
        discipline: input.discipline,
        status: input.status ?? "planning",
        priority: input.priority ?? "medium",
        risk_level: input.risk_level ?? "low",
        start_date: input.start_date,
        end_date: input.end_date,
        budget: input.budget,
        progress_percent: 0,
      })
      .select()
      .single();

    if (error) return fail<ProjectView>(error);
    return ok({ ...(data as ProjectView), client_name: null, pm_name: null });
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: update ──────────────────────────────────────────────────────────

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<ServiceResult<ProjectView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const overlay = getOverlay();
    overlay.updated[id] = { ...(overlay.updated[id] ?? {}), ...input };
    saveOverlay(overlay);
    const updated = getMockProjectList().find((p) => p.id === id);
    if (!updated) return fail<ProjectView>(`Project "${id}" not found.`);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase
      .from("projects")
      .update({
        ...(input.project_number !== undefined && { project_number: input.project_number }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.discipline !== undefined && { discipline: input.discipline }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.risk_level !== undefined && { risk_level: input.risk_level }),
        ...(input.start_date !== undefined && { start_date: input.start_date }),
        ...(input.end_date !== undefined && { end_date: input.end_date }),
        ...(input.budget !== undefined && { budget: input.budget }),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail<ProjectView>(error);
    return ok({ ...(data as ProjectView), client_name: null, pm_name: null });
  } catch (err) {
    return fail<ProjectView>(err);
  }
}

// ─── Service: archive (soft-delete) ──────────────────────────────────────────

export async function archiveProject(id: string): Promise<ServiceResult<boolean>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const overlay = getOverlay();
    if (!overlay.archived.includes(id)) overlay.archived.push(id);
    saveOverlay(overlay);
    return mockOk(true);
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

// ─── Service: project members ─────────────────────────────────────────────────

export async function listProjectMembers(
  projectId: string,
): Promise<ServiceResult<ProjectMemberView[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
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
    // Overlay-created projects have no engineer list; return a placeholder member
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

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    const { data, error } = await supabase
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
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const raw = MOCK_PROJECTS.find((p) => p.id === projectId);
    const progress = raw?.progress ?? 0;
    // Mark milestones as done based on project progress
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

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    const { data, error } = await supabase
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
