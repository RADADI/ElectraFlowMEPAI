/**
 * React Query hooks — Phase 14 Audit Explorer
 */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  listAuditEvents,
  getAuditEvent,
  searchAuditEvents,
  type AuditEventFilters,
} from "@/services/audit-explorer.service";

export const AUDIT_KEYS = {
  list: (filters: AuditEventFilters) => ["audit_events", filters] as const,
  detail: (id: string) => ["audit_events", id] as const,
  search: (term: string) => ["audit_search", term] as const,
};

export function useAuditEvents(filters: Omit<AuditEventFilters, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: AUDIT_KEYS.list(filters),
    queryFn: ({ pageParam }) =>
      listAuditEvents({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((p) => p.data?.items ?? []),
      isMockData: data.pages[0]?.isMockData ?? false,
    }),
    staleTime: 60_000,
  });
}

export function useAuditEvent(id: string) {
  return useQuery({
    queryKey: AUDIT_KEYS.detail(id),
    queryFn: () => getAuditEvent(id),
    select: (r) => r.data,
    enabled: !!id,
  });
}

export function useAuditSearch(term: string) {
  return useQuery({
    queryKey: AUDIT_KEYS.search(term),
    queryFn: () => searchAuditEvents(term),
    select: (r) => r.data ?? [],
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}
