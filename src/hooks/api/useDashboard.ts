/**
 * React Query hooks — Phase 14 Dashboard preferences
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDashboardPreferences,
  saveDashboardPreferences,
  resetDashboardPreferences,
} from "@/services/dashboard.service";
import type { DashboardType, DashboardPreferenceUpdate } from "@/types/database";
import type { AppRole } from "@/lib/permissions";

export const DASHBOARD_KEYS = {
  prefs: (type: DashboardType) => ["dashboard_prefs", type] as const,
};

export function useDashboardPreferences(
  dashboardType: DashboardType = "executive",
  role: AppRole | null = null,
) {
  return useQuery({
    queryKey: DASHBOARD_KEYS.prefs(dashboardType),
    queryFn: () => getDashboardPreferences(dashboardType, role),
    select: (r) => ({ data: r.data, error: r.error, isMockData: r.isMockData }),
    staleTime: 120_000,
  });
}

export function useSaveDashboardPreferences(
  dashboardType: DashboardType = "executive",
  role: AppRole | null = null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: DashboardPreferenceUpdate) =>
      saveDashboardPreferences(dashboardType, updates, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARD_KEYS.prefs(dashboardType) }),
  });
}

export function useResetDashboardPreferences(
  dashboardType: DashboardType = "executive",
  role: AppRole | null = null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resetDashboardPreferences(dashboardType, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: DASHBOARD_KEYS.prefs(dashboardType) }),
  });
}
