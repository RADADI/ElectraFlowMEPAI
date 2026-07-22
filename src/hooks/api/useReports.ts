/**
 * React Query hooks — Phase 14 Reports
 */

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSavedReports,
  getSavedReport,
  createSavedReport,
  updateSavedReport,
  deleteSavedReport,
  runReport,
  listReportRuns,
  getReportRun,
  getReportPreview,
  exportReportCsv,
} from "@/services/report.service";
import type { CreateReportInput, RunReportInput } from "@/types/report-view";
import type { SavedReportUpdate } from "@/types/database";

export const REPORT_KEYS = {
  all: ["reports"] as const,
  list: () => ["reports", "list"] as const,
  detail: (id: string) => ["reports", id] as const,
  runs: (savedReportId?: string) => ["report_runs", savedReportId] as const,
  run: (id: string) => ["report_runs", "detail", id] as const,
  preview: (type: string) => ["report_preview", type] as const,
};

export function useSavedReports() {
  return useInfiniteQuery({
    queryKey: REPORT_KEYS.list(),
    queryFn: ({ pageParam }) => listSavedReports({ cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((p) => p.data?.items ?? []),
      isMockData: data.pages[0]?.isMockData ?? false,
    }),
    staleTime: 60_000,
  });
}

export function useSavedReport(id: string) {
  return useQuery({
    queryKey: REPORT_KEYS.detail(id),
    queryFn: () => getSavedReport(id),
    select: (r) => ({ data: r.data, error: r.error, isMockData: r.isMockData }),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateSavedReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReportInput) => createSavedReport(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEYS.all }),
  });
}

export function useUpdateSavedReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: SavedReportUpdate) => updateSavedReport(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REPORT_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: REPORT_KEYS.all });
    },
  });
}

export function useDeleteSavedReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEYS.all }),
  });
}

export function useRunReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RunReportInput) => runReport(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEYS.runs() }),
  });
}

export function useReportRuns(savedReportId?: string) {
  return useInfiniteQuery({
    queryKey: REPORT_KEYS.runs(savedReportId),
    queryFn: ({ pageParam }) =>
      listReportRuns({ saved_report_id: savedReportId, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    select: (data) => ({
      items: data.pages.flatMap((p) => p.data?.items ?? []),
      isMockData: data.pages[0]?.isMockData ?? false,
    }),
    staleTime: 30_000,
  });
}

export function useReportRun(id: string) {
  return useQuery({
    queryKey: REPORT_KEYS.run(id),
    queryFn: () => getReportRun(id),
    select: (r) => r.data,
    enabled: !!id,
  });
}

export function useReportPreview(reportType: string, columns?: string[]) {
  return useQuery({
    queryKey: REPORT_KEYS.preview(reportType),
    queryFn: () => getReportPreview(reportType as import("@/types/database").ReportType, columns),
    select: (r) => r.data,
    enabled: !!reportType,
    staleTime: 60_000,
  });
}

export function useExportReportCsv() {
  return useMutation({
    mutationFn: (runId: string) => exportReportCsv(runId),
  });
}
