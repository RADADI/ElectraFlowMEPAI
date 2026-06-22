/**
 * Document React Query hooks — Phase 6
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listDocuments,
  getDocument,
  uploadDocument,
  uploadNewVersion,
  listDocumentVersions,
  listDocumentApprovals,
  downloadDocument,
  submitForReview,
  approveDocument,
  rejectDocument,
  archiveDocument,
  restoreDocument,
} from "@/services/document.service";
import type {
  DocumentFilterInput,
  DocumentUploadInput,
  DocumentVersionInput,
} from "@/types/document-view";

export const DOCUMENT_KEYS = {
  all: ["documents"] as const,
  list: (filters: DocumentFilterInput) => ["documents", "list", filters] as const,
  detail: (id: string) => ["documents", id] as const,
  versions: (id: string) => ["documents", id, "versions"] as const,
  approvals: (id: string) => ["documents", id, "approvals"] as const,
};

export function useDocuments(filters: DocumentFilterInput = {}) {
  return useQuery({
    queryKey: DOCUMENT_KEYS.list(filters),
    queryFn: async () => {
      const result = await listDocuments(filters);
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: DOCUMENT_KEYS.detail(id),
    queryFn: async () => {
      const result = await getDocument(id);
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useDocumentVersions(docId: string) {
  return useQuery({
    queryKey: DOCUMENT_KEYS.versions(docId),
    queryFn: async () => {
      const result = await listDocumentVersions(docId);
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    select: (result) => result.data ?? [],
    enabled: !!docId,
  });
}

export function useDocumentApprovals(docId: string) {
  return useQuery({
    queryKey: DOCUMENT_KEYS.approvals(docId),
    queryFn: async () => {
      const result = await listDocumentApprovals(docId);
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    select: (result) => result.data ?? [],
    enabled: !!docId,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      file,
      onProgress,
    }: {
      input: DocumentUploadInput;
      file: File;
      onProgress?: Parameters<typeof uploadDocument>[2];
    }) => uploadDocument(input, file, onProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
    },
  });
}

export function useUploadNewVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      file,
      input,
      onProgress,
    }: {
      docId: string;
      file: File;
      input: DocumentVersionInput;
      onProgress?: Parameters<typeof uploadNewVersion>[3];
    }) => uploadNewVersion(docId, file, input, onProgress),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(vars.docId) });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.versions(vars.docId) });
    },
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: (docId: string) => downloadDocument(docId),
  });
}

export function useSubmitForReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => submitForReview(docId),
    onSuccess: (_data, docId) => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(docId) });
    },
  });
}

export function useApproveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, comments }: { docId: string; comments?: string }) =>
      approveDocument(docId, comments),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(vars.docId) });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.approvals(vars.docId) });
    },
  });
}

export function useRejectDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, comments }: { docId: string; comments: string }) =>
      rejectDocument(docId, comments),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(vars.docId) });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.approvals(vars.docId) });
    },
  });
}

export function useArchiveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => archiveDocument(docId),
    onSuccess: (_data, docId) => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(docId) });
    },
  });
}

export function useRestoreDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => restoreDocument(docId),
    onSuccess: (_data, docId) => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(docId) });
    },
  });
}
