/**
 * RFI React Query hooks — Phase 8
 *
 * All mutations invalidate the relevant query keys so the UI stays in sync.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listRFIs,
  getRFI,
  createRFI,
  updateRFI,
  submitRFI,
  assignRFI,
  respondToRFI,
  requestMoreInfo,
  closeRFI,
  reopenRFI,
  archiveRFI,
  restoreRFI,
  voidRFI,
  listRFIResponses,
  listRFIDocuments,
  attachDocumentToRFI,
  removeDocumentFromRFI,
} from "@/services/rfi.service";
import type {
  RFICreateInput,
  RFIUpdateInput,
  RFIResponseInput,
  VoidRFIInput,
  AssignRFIInput,
  RFIFilterInput,
} from "@/types/rfi-view";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const RFI_KEYS = {
  all: ["rfi"] as const,
  filtered: (f: RFIFilterInput) => ["rfi", "filtered", f] as const,
  byProject: (projectId: string) => ["rfi", "project", projectId] as const,
  detail: (id: string) => ["rfi", id] as const,
  responses: (rfiId: string) => ["rfi", rfiId, "responses"] as const,
  documents: (rfiId: string) => ["rfi", rfiId, "documents"] as const,
};

// ─── List ─────────────────────────────────────────────────────────────────────

export function useRFIs(filters?: RFIFilterInput) {
  const key = filters?.projectId
    ? RFI_KEYS.byProject(filters.projectId)
    : filters
      ? RFI_KEYS.filtered(filters)
      : RFI_KEYS.all;

  return useQuery({
    queryKey: key,
    queryFn: () => listRFIs(filters),
    staleTime: 30_000,
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useRFI(id: string) {
  return useQuery({
    queryKey: RFI_KEYS.detail(id),
    queryFn: () => getRFI(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─── Responses ────────────────────────────────────────────────────────────────

export function useRFIResponses(rfiId: string) {
  return useQuery({
    queryKey: RFI_KEYS.responses(rfiId),
    queryFn: () => listRFIResponses(rfiId),
    select: (result) => result.data ?? [],
    enabled: !!rfiId,
    staleTime: 30_000,
  });
}

// ─── Documents ────────────────────────────────────────────────────────────────

export function useRFIDocuments(rfiId: string) {
  return useQuery({
    queryKey: RFI_KEYS.documents(rfiId),
    queryFn: () => listRFIDocuments(rfiId),
    select: (result) => result.data ?? [],
    enabled: !!rfiId,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateRFI() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RFICreateInput) => createRFI(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
    },
  });
}

export function useUpdateRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RFIUpdateInput) => updateRFI(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useSubmitRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitRFI(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useAssignRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignRFIInput) => assignRFI(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useRespondToRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RFIResponseInput) => respondToRFI(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RFI_KEYS.responses(id) });
    },
  });
}

export function useRequestMoreInfo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => requestMoreInfo(id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: RFI_KEYS.responses(id) });
    },
  });
}

export function useCloseRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => closeRFI(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useReopenRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reopenRFI(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useArchiveRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archiveRFI(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useRestoreRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restoreRFI(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useVoidRFI(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VoidRFIInput) => voidRFI(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.all });
      qc.invalidateQueries({ queryKey: RFI_KEYS.detail(id) });
    },
  });
}

export function useAttachRFIDocument(rfiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => attachDocumentToRFI(rfiId, documentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.documents(rfiId) });
    },
  });
}

export function useRemoveRFIDocument(rfiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => removeDocumentFromRFI(rfiId, documentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RFI_KEYS.documents(rfiId) });
    },
  });
}
