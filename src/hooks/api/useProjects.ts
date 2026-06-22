/**
 * React Query hooks — Projects
 *
 * These hooks are ready to use from any page component.
 * When Supabase is configured they fetch real data; otherwise they return
 * the mock data from dummy-data.ts — the UI never needs to know which.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "@/services/project.service";
import type { ProjectInsert, ProjectUpdate } from "@/types/database";

export const PROJECT_KEYS = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: PROJECT_KEYS.all,
    queryFn: () => listProjects(),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: PROJECT_KEYS.detail(id),
    queryFn: () => getProject(id),
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectInsert) => createProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectUpdate) => updateProject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.detail(id) });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    },
  });
}
