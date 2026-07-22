import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listLeaveRequests,
  getLeaveRequest,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveBalance,
  type LeaveFilter,
} from "@/services/leave.service";
import type { LeaveCreateInput, RejectLeaveInput } from "@/types/timesheet-view";

export const LEAVE_KEYS = {
  all: ["leave"] as const,
  filtered: (f: LeaveFilter) => ["leave", "filtered", f] as const,
  detail: (id: string) => ["leave", id] as const,
  balance: (empId: string) => ["leave", "balance", empId] as const,
};

export function useLeaveRequests(filters?: LeaveFilter) {
  return useQuery({
    queryKey: filters ? LEAVE_KEYS.filtered(filters) : LEAVE_KEYS.all,
    queryFn: () => listLeaveRequests(filters),
    staleTime: 30_000,
  });
}

export function useLeaveRequest(id: string) {
  return useQuery({
    queryKey: LEAVE_KEYS.detail(id),
    queryFn: () => getLeaveRequest(id),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useLeaveBalance(employeeId: string) {
  return useQuery({
    queryKey: LEAVE_KEYS.balance(employeeId),
    queryFn: () => getLeaveBalance(employeeId),
    select: (result) => result.data,
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeaveCreateInput) => createLeaveRequest(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.all });
      if (vars.employee_id) {
        qc.invalidateQueries({ queryKey: LEAVE_KEYS.balance(vars.employee_id) });
      }
    },
  });
}

export function useApproveLeaveRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveLeaveRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.all });
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.detail(id) });
    },
  });
}

export function useRejectLeaveRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RejectLeaveInput) => rejectLeaveRequest(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.all });
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.detail(id) });
    },
  });
}

export function useCancelLeaveRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelLeaveRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.all });
      qc.invalidateQueries({ queryKey: LEAVE_KEYS.detail(id) });
    },
  });
}
