/**
 * React Query hooks — Projects (Phase 4)
 *
 * All hooks consume ProjectView (never Project directly).
 * When Supabase is configured they fetch real data; otherwise they return
 * session-overlay + dummy-data — the UI never needs to know which.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  listProjectMembers,
  listProjectMilestones,
} from "@/services/project.service";
import type { ProjectCreateInput, ProjectUpdateInput } from "@/types/project-view";

// ─── Query key factory ────────────────────────────────────────────────────────

export const PROJECT_KEYS = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  members: (id: string) => ["projects", id, "members"] as const,
  milestones: (id: string) => ["projects", id, "milestones"] as const,
};

// ─── List ─────────────────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: PROJECT_KEYS.all,
    queryFn: () => listProjects(),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useProject(id: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.detail(id),
    queryFn: () => getProject(id),
    // Return the full ServiceResult so callers can distinguish null data from errors
    enabled: !!id,
  });
}

// ─── Members ─────────────────────────────────────────────────────────────────

export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.members(projectId),
    queryFn: () => listProjectMembers(projectId),
    select: (result) => result.data ?? [],
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export function useProjectMilestones(projectId: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.milestones(projectId),
    queryFn: () => listProjectMilestones(projectId),
    select: (result) => result.data ?? [],
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCreateInput) => createProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectUpdateInput) => updateProject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(id) });
    },
  });
}

// ─── Archive ─────────────────────────────────────────────────────────────────

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveProject(id),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(id) });
    },
  });
}
