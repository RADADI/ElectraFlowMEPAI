/**
 * React Query hooks — Projects (Phase 4)
 *
 * All hooks consume ProjectView (never Project directly).
 *
 * Key change vs Phase 3:
 *   useProjects() now THROWS when the service returns an error instead of
 *   silently returning [].  This means React Query sets isError = true and
 *   the error object is available to the UI, which then shows a friendly
 *   "Failed to load projects" state.
 *
 *   Mutation hooks still return ServiceResult so the form/modal can inspect
 *   the error without relying on React Query's error boundary.
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

/**
 * Returns ProjectView[].
 * Sets isError when the service returns an error (e.g. org not configured,
 * Supabase unavailable).  The error message is surfaced in the UI.
 */
export function useProjects() {
  return useQuery({
    queryKey: PROJECT_KEYS.all,
    queryFn: async () => {
      const result = await listProjects();
      // Throw so React Query sets isError = true and the error message
      // propagates to the UI's error EmptyState.
      if (result.error) throw new Error(result.error.message);
      return result.data ?? [];
    },
    staleTime: 30_000,
    retry: (failureCount, error) => {
      // Don't retry org-config errors — they won't self-heal
      const msg = (error as Error)?.message ?? "";
      if (msg.includes("Organization not configured")) return false;
      return failureCount < 2;
    },
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

/**
 * Returns the full ServiceResult so the detail page can distinguish
 * "not found" from "server error" from "loading".
 */
export function useProject(id: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.detail(id),
    queryFn: () => getProject(id),
    enabled: !!id,
    staleTime: 30_000,
    retry: (failureCount, _error) => failureCount < 1,
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
      // Refetch the list so the new project appears from the real data source
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
      // Both invalidations ensure:
      //   • Project disappears from the list
      //   • Detail page shows "not found" if revisited
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(id) });
    },
  });
}
