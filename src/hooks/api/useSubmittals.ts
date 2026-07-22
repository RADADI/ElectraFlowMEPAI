/**
 * Submittal React Query hooks — Phase 7
 *
 * All mutations invalidate the relevant query keys so the UI stays in sync
 * after create / update / workflow actions.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSubmittals,
  getSubmittal,
  createSubmittal,
  updateSubmittal,
  submitSubmittal,
  reviewSubmittal,
  reviseAndResubmit,
  archiveSubmittal,
  restoreSubmittal,
  listSubmittalItems,
  addSubmittalItem,
  removeSubmittalItem,
  listSubmittalReviews,
  attachDocumentToItem,
  removeDocumentFromItem,
  listItemDocuments,
} from "@/services/submittal.service";
import type {
  SubmittalCreateInput,
  SubmittalUpdateInput,
  SubmittalItemInput,
  ReviseInput,
  ReviewActionInput,
  SubmittalFilterInput,
} from "@/types/submittal-view";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const SUBMITTAL_KEYS = {
  all: ["submittals"] as const,
  filtered: (f: SubmittalFilterInput) => ["submittals", "filtered", f] as const,
  byProject: (projectId: string) => ["submittals", "project", projectId] as const,
  detail: (id: string) => ["submittals", id] as const,
  items: (submittalId: string) => ["submittals", submittalId, "items"] as const,
  reviews: (submittalId: string) => ["submittals", submittalId, "reviews"] as const,
  itemDocs: (itemId: string) => ["submittal-item-docs", itemId] as const,
};

// ─── List ─────────────────────────────────────────────────────────────────────

export function useSubmittals(filters?: SubmittalFilterInput) {
  const key = filters?.projectId
    ? SUBMITTAL_KEYS.byProject(filters.projectId)
    : filters
      ? SUBMITTAL_KEYS.filtered(filters)
      : SUBMITTAL_KEYS.all;

  return useQuery({
    queryKey: key,
    queryFn: () => listSubmittals(filters),
    staleTime: 30_000,
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useSubmittal(id: string) {
  return useQuery({
    queryKey: SUBMITTAL_KEYS.detail(id),
    queryFn: () => getSubmittal(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function useSubmittalItems(submittalId: string) {
  return useQuery({
    queryKey: SUBMITTAL_KEYS.items(submittalId),
    queryFn: () => listSubmittalItems(submittalId),
    enabled: !!submittalId,
    staleTime: 30_000,
  });
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export function useSubmittalReviews(submittalId: string) {
  return useQuery({
    queryKey: SUBMITTAL_KEYS.reviews(submittalId),
    queryFn: () => listSubmittalReviews(submittalId),
    enabled: !!submittalId,
    staleTime: 30_000,
  });
}

// ─── Item documents ───────────────────────────────────────────────────────────

export function useItemDocuments(itemId: string) {
  return useQuery({
    queryKey: SUBMITTAL_KEYS.itemDocs(itemId),
    queryFn: () => listItemDocuments(itemId),
    select: (result) => result.data ?? [],
    enabled: !!itemId,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateSubmittal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmittalCreateInput) => createSubmittal(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
    },
  });
}

export function useUpdateSubmittal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmittalUpdateInput) => updateSubmittal(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
    },
  });
}

export function useSubmitSubmittal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitSubmittal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
    },
  });
}

export function useReviewSubmittal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewActionInput) => reviewSubmittal(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.reviews(id) });
    },
  });
}

export function useReviseAndResubmit(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviseInput) => reviseAndResubmit(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
    },
  });
}

export function useArchiveSubmittal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archiveSubmittal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
    },
  });
}

export function useRestoreSubmittal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restoreSubmittal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.all });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.detail(id) });
    },
  });
}

export function useAddSubmittalItem(submittalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmittalItemInput) => addSubmittalItem(submittalId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.items(submittalId) });
    },
  });
}

export function useRemoveSubmittalItem(submittalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => removeSubmittalItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.items(submittalId) });
    },
  });
}

export function useAttachDocument(submittalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, documentId }: { itemId: string; documentId: string }) =>
      attachDocumentToItem(submittalId, itemId, documentId),
    onSuccess: (_result, { itemId }) => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.itemDocs(itemId) });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.items(submittalId) });
    },
  });
}

export function useDetachDocument(submittalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, documentId }: { itemId: string; documentId: string }) =>
      removeDocumentFromItem(itemId, documentId),
    onSuccess: (_result, { itemId }) => {
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.itemDocs(itemId) });
      qc.invalidateQueries({ queryKey: SUBMITTAL_KEYS.items(submittalId) });
    },
  });
}
