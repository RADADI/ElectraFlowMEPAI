import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSubmittals,
  getSubmittal,
  createSubmittal,
  updateSubmittal,
} from "@/services/submittal.service";
import type { SubmittalInsert, SubmittalUpdate } from "@/types/database";

export const SUBMITTAL_KEYS = {
  all: ["submittals"] as const,
  byProject: (projectId: string) => ["submittals", "project", projectId] as const,
  detail: (id: string) => ["submittals", id] as const,
};

export function useSubmittals(projectId?: string) {
  return useQuery({
    queryKey: projectId ? SUBMITTAL_KEYS.byProject(projectId) : SUBMITTAL_KEYS.all,
    queryFn: () => listSubmittals(projectId),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useSubmittal(id: string) {
  return useQuery({
    queryKey: SUBMITTAL_KEYS.detail(id),
    queryFn: () => getSubmittal(id),
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useCreateSubmittal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmittalInsert) => createSubmittal(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
    },
  });
}

export function useUpdateSubmittal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmittalUpdate) => updateSubmittal(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
    },
  });
}
