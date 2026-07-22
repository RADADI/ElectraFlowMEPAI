import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTimesheets,
  getTimesheet,
  createTimesheet,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  unlockTimesheet,
  archiveTimesheet,
  listEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  getTimesheetSummary,
  type TimesheetFilter,
} from "@/services/timesheet.service";
import type {
  TimesheetCreateInput,
  TimesheetEntryInput,
  ApproveTimesheetInput,
  RejectTimesheetInput,
  UnlockTimesheetInput,
} from "@/types/timesheet-view";

export const TIMESHEET_KEYS = {
  all: ["timesheets"] as const,
  filtered: (f: TimesheetFilter) => ["timesheets", "filtered", f] as const,
  detail: (id: string) => ["timesheets", id] as const,
  entries: (id: string) => ["timesheets", id, "entries"] as const,
  summary: () => ["timesheets", "summary"] as const,
};

export function useTimesheets(filters?: TimesheetFilter) {
  return useQuery({
    queryKey: filters ? TIMESHEET_KEYS.filtered(filters) : TIMESHEET_KEYS.all,
    queryFn: () => listTimesheets(filters),
    staleTime: 30_000,
  });
}

export function useTimesheet(id: string) {
  return useQuery({
    queryKey: TIMESHEET_KEYS.detail(id),
    queryFn: () => getTimesheet(id),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useTimesheetSummary() {
  return useQuery({
    queryKey: TIMESHEET_KEYS.summary(),
    queryFn: () => getTimesheetSummary(),
    select: (result) => result.data,
    staleTime: 60_000,
  });
}

export function useCreateTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TimesheetCreateInput) => createTimesheet(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.all });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.summary() });
    },
  });
}

export function useSubmitTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitTimesheet(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.all });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.summary() });
    },
  });
}

export function useApproveTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApproveTimesheetInput) => approveTimesheet(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.all });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.summary() });
    },
  });
}

export function useRejectTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RejectTimesheetInput) => rejectTimesheet(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.all });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.summary() });
    },
  });
}

export function useUnlockTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UnlockTimesheetInput) => unlockTimesheet(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.all });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.summary() });
    },
  });
}

export function useArchiveTimesheet(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archiveTimesheet(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.all });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.summary() });
    },
  });
}

export function useTimesheetEntries(timesheetId: string) {
  return useQuery({
    queryKey: TIMESHEET_KEYS.entries(timesheetId),
    queryFn: () => listEntries(timesheetId),
    select: (result) => result.data ?? [],
    enabled: !!timesheetId,
    staleTime: 15_000,
  });
}

export function useAddTimesheetEntry(timesheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TimesheetEntryInput) => addEntry(timesheetId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.entries(timesheetId) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(timesheetId) });
    },
  });
}

export function useUpdateTimesheetEntry(timesheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TimesheetEntryInput> }) =>
      updateEntry(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.entries(timesheetId) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(timesheetId) });
    },
  });
}

export function useDeleteTimesheetEntry(timesheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => deleteEntry(entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.entries(timesheetId) });
      qc.invalidateQueries({ queryKey: TIMESHEET_KEYS.detail(timesheetId) });
    },
  });
}
