/**
 * React Query hooks — Phase 14 Analytics
 */

import { useQuery } from "@tanstack/react-query";
import {
  getExecutiveSummary,
  getProjectAnalytics,
  getDocumentAnalytics,
  getSubmittalAnalytics,
  getRFIAnalytics,
  getNCRAnalytics,
  getResourceAnalytics,
  getTimesheetAnalytics,
  getLeaveAnalytics,
  getFinancialAnalytics,
  getNotificationAnalytics,
  getSystemHealth,
  getDashboardSnapshot,
  listThresholdRules,
} from "@/services/analytics.service";

export const ANALYTICS_KEYS = {
  executive: ["analytics", "executive"] as const,
  projects: ["analytics", "projects"] as const,
  documents: ["analytics", "documents"] as const,
  submittals: ["analytics", "submittals"] as const,
  rfi: ["analytics", "rfi"] as const,
  ncr: ["analytics", "ncr"] as const,
  resources: ["analytics", "resources"] as const,
  timesheets: ["analytics", "timesheets"] as const,
  leave: ["analytics", "leave"] as const,
  financials: ["analytics", "financials"] as const,
  notifications: ["analytics", "notifications"] as const,
  system: ["analytics", "system"] as const,
  snapshot: ["analytics", "snapshot"] as const,
  thresholds: ["analytics", "thresholds"] as const,
};

export function useExecutiveSummary() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.executive,
    queryFn: () => getExecutiveSummary(),
    select: (r) => ({ data: r.data, error: r.error, isMockData: r.isMockData }),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

export function useProjectAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.projects,
    queryFn: () => getProjectAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useDocumentAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.documents,
    queryFn: () => getDocumentAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useSubmittalAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.submittals,
    queryFn: () => getSubmittalAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useRFIAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.rfi,
    queryFn: () => getRFIAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useNCRAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.ncr,
    queryFn: () => getNCRAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useResourceAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.resources,
    queryFn: () => getResourceAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useTimesheetAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.timesheets,
    queryFn: () => getTimesheetAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useLeaveAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.leave,
    queryFn: () => getLeaveAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useFinancialAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.financials,
    queryFn: () => getFinancialAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useNotificationAnalytics() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.notifications,
    queryFn: () => getNotificationAnalytics(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useSystemHealth() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.system,
    queryFn: () => getSystemHealth(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useDashboardSnapshot() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.snapshot,
    queryFn: () => getDashboardSnapshot(),
    select: (r) => r.data,
    staleTime: 120_000,
  });
}
export function useThresholdRules() {
  return useQuery({
    queryKey: ANALYTICS_KEYS.thresholds,
    queryFn: () => listThresholdRules(),
    select: (r) => r.data ?? [],
    staleTime: 300_000,
  });
}
