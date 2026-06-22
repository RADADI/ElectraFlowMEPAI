import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRFIs, getRFI, createRFI, updateRFI } from "@/services/rfi.service";
import type { RFIInsert, RFIUpdate } from "@/types/database";

export const RFI_KEYS = {
  all: ["rfi"] as const,
  byProject: (projectId: string) => ["rfi", "project", projectId] as const,
  detail: (id: string) => ["rfi", id] as const,
};

export function useRFIs(projectId?: string) {
  return useQuery({
    queryKey: projectId ? RFI_KEYS.byProject(projectId) : RFI_KEYS.all,
    queryFn: () => listRFIs(projectId),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useRFI(id: string) {
  return useQuery({
    queryKey: RFI_KEYS.detail(id),
    queryFn: () => getRFI(id),
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useCreateRFI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RFIInsert) => createRFI(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
    },
  });
}

export function useUpdateRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RFIUpdate) => updateRFI(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}
