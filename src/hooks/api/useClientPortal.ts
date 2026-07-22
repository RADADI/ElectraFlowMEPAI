/**
 * Client Portal React Query hooks — Phase 15D
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  getClientDashboard,
  listClientDocuments,
  getClientDocument,
  downloadClientDocument,
  listClientRFIs,
  getClientRFI,
  listClientSubmittals,
  getClientSubmittal,
  listClientInvoices,
  getClientInvoice,
  listClientActivity,
  listClientMeetings,
  listClientDownloads,
  getClientPortalPreferences,
  updateClientPortalPreferences,
  listClientAnnouncements,
} from "@/services/client-portal.service";
import type {
  ClientPortalListOptions,
  ClientPortalPreferencesInput,
} from "@/types/client-portal-view";

export const CLIENT_PORTAL_KEYS = {
  all: ["client-portal"] as const,
  dashboard: ["client-portal", "dashboard"] as const,
  documents: (opts?: ClientPortalListOptions) => ["client-portal", "documents", opts] as const,
  document: (id: string) => ["client-portal", "document", id] as const,
  rfis: (opts?: ClientPortalListOptions) => ["client-portal", "rfis", opts] as const,
  rfi: (id: string) => ["client-portal", "rfi", id] as const,
  submittals: (opts?: ClientPortalListOptions) => ["client-portal", "submittals", opts] as const,
  submittal: (id: string) => ["client-portal", "submittal", id] as const,
  invoices: (opts?: ClientPortalListOptions) => ["client-portal", "invoices", opts] as const,
  invoice: (id: string) => ["client-portal", "invoice", id] as const,
  activity: (opts?: ClientPortalListOptions) => ["client-portal", "activity", opts] as const,
  meetings: (opts?: ClientPortalListOptions) => ["client-portal", "meetings", opts] as const,
  downloads: (opts?: ClientPortalListOptions) => ["client-portal", "downloads", opts] as const,
  preferences: ["client-portal", "preferences"] as const,
  announcements: ["client-portal", "announcements"] as const,
};

function invalidatePortal(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: CLIENT_PORTAL_KEYS.all });
}

export function useClientDashboard() {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.dashboard,
    queryFn: () => getClientDashboard(),
    select: (r) => r,
    staleTime: 30_000,
  });
}

export function useClientDocuments(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.documents(filters),
    queryFn: ({ pageParam }) =>
      listClientDocuments({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientDocument(id: string) {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.document(id),
    queryFn: () => getClientDocument(id),
    select: (r) => r.data ?? null,
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useDownloadClientDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => downloadClientDocument(id),
    onSuccess: () => {
      invalidatePortal(qc);
    },
  });
}

export function useClientRFIs(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.rfis(filters),
    queryFn: ({ pageParam }) =>
      listClientRFIs({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientRFI(id: string) {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.rfi(id),
    queryFn: () => getClientRFI(id),
    select: (r) => r.data ?? null,
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useClientSubmittals(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.submittals(filters),
    queryFn: ({ pageParam }) =>
      listClientSubmittals({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientSubmittal(id: string) {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.submittal(id),
    queryFn: () => getClientSubmittal(id),
    select: (r) => r.data ?? null,
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useClientInvoices(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.invoices(filters),
    queryFn: ({ pageParam }) =>
      listClientInvoices({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientInvoice(id: string) {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.invoice(id),
    queryFn: () => getClientInvoice(id),
    select: (r) => r.data ?? null,
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useClientActivity(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.activity(filters),
    queryFn: ({ pageParam }) =>
      listClientActivity({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientMeetings(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.meetings(filters),
    queryFn: ({ pageParam }) =>
      listClientMeetings({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientDownloads(filters?: ClientPortalListOptions) {
  return useInfiniteQuery({
    queryKey: CLIENT_PORTAL_KEYS.downloads(filters),
    queryFn: ({ pageParam }) =>
      listClientDownloads({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useClientPortalPreferences() {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.preferences,
    queryFn: () => getClientPortalPreferences(),
    select: (r) => r.data ?? null,
    staleTime: 60_000,
  });
}

export function useUpdateClientPortalPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientPortalPreferencesInput) => updateClientPortalPreferences(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CLIENT_PORTAL_KEYS.preferences });
    },
  });
}

export function useClientAnnouncements() {
  return useQuery({
    queryKey: CLIENT_PORTAL_KEYS.announcements,
    queryFn: () => listClientAnnouncements(),
    select: (r) => r.data ?? [],
    staleTime: 60_000,
  });
}
