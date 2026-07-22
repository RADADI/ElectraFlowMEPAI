import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listNCRs, getNCR, createNCR, updateNCR } from "@/services/ncr.service";
import type { NCRInsert, NCRUpdate } from "@/types/database";

export const NCR_KEYS = {
  all: ["ncr"] as const,
  byProject: (projectId: string) => ["ncr", "project", projectId] as const,
  detail: (id: string) => ["ncr", id] as const,
};

export function useNCRs(projectId?: string) {
  return useQuery({
    queryKey: projectId ? NCR_KEYS.byProject(projectId) : NCR_KEYS.all,
    queryFn: () => listNCRs(projectId),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useNCR(id: string) {
  return useQuery({
    queryKey: NCR_KEYS.detail(id),
    queryFn: () => getNCR(id),
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useCreateNCR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NCRInsert) => createNCR(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NCR_KEYS.all });
    },
  });
}

export function useUpdateNCR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NCRUpdate) => updateNCR(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NCR_KEYS.all });
      qc.invalidateQueries({ queryKey: NCR_KEYS.detail(id) });
    },
  });
}
