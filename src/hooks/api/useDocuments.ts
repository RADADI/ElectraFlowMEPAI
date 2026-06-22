import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
} from "@/services/document.service";
import type { DocumentInsert, DocumentUpdate } from "@/types/database";

export const DOCUMENT_KEYS = {
  all: ["documents"] as const,
  byProject: (projectId: string) => ["documents", "project", projectId] as const,
  detail: (id: string) => ["documents", id] as const,
};

export function useDocuments(projectId?: string) {
  return useQuery({
    queryKey: projectId ? DOCUMENT_KEYS.byProject(projectId) : DOCUMENT_KEYS.all,
    queryFn: () => listDocuments(projectId),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: DOCUMENT_KEYS.detail(id),
    queryFn: () => getDocument(id),
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DocumentInsert) => createDocument(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
    },
  });
}

export function useUpdateDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DocumentUpdate) => updateDocument(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.all });
      qc.invalidateQueries({ queryKey: DOCUMENT_KEYS.detail(id) });
    },
  });
}
