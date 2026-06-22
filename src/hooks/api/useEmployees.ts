/**
 * Employee / Resource React Query hooks — Phase 10
 *
 * All mutations invalidate the relevant query keys so the UI stays in sync.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  reactivateEmployee,
  listSkills,
  addSkill,
  removeSkill,
  listCertifications,
  addCertification,
  removeCertification,
  listAllocations,
  createAllocation,
  updateAllocation,
  archiveAllocation,
  getWorkloadSummary,
  getCapacityWarnings,
  getHeatmapData,
} from "@/services/employee.service";
import type {
  EmployeeCreateInput,
  EmployeeUpdateInput,
  SkillCreateInput,
  CertificationCreateInput,
  AllocationCreateInput,
  AllocationUpdateInput,
  EmployeeFilterInput,
} from "@/types/employee-view";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const EMPLOYEE_KEYS = {
  all: ["employees"] as const,
  filtered: (f: EmployeeFilterInput) => ["employees", "filtered", f] as const,
  detail: (id: string) => ["employees", id] as const,
  skills: (id: string) => ["employees", id, "skills"] as const,
  certs: (id: string) => ["employees", id, "certs"] as const,
  allocations: (empId?: string, projId?: string) =>
    ["employees", "allocations", empId ?? "all", projId ?? "all"] as const,
  workloadSummary: () => ["employees", "workload-summary"] as const,
  capacityWarnings: () => ["employees", "capacity-warnings"] as const,
  heatmap: () => ["employees", "heatmap"] as const,
};

// ─── Employees ────────────────────────────────────────────────────────────────

export function useEmployees(filters?: EmployeeFilterInput) {
  const key = filters ? EMPLOYEE_KEYS.filtered(filters) : EMPLOYEE_KEYS.all;
  return useQuery({
    queryKey: key,
    queryFn: () => listEmployees(filters),
    staleTime: 60_000,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.detail(id),
    queryFn: () => getEmployee(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmployeeCreateInput) => createEmployee(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.capacityWarnings() });
    },
  });
}

export function useUpdateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmployeeUpdateInput) => updateEmployee(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(id) });
    },
  });
}

export function useDeactivateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deactivateEmployee(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.capacityWarnings() });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.heatmap() });
    },
  });
}

export function useReactivateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reactivateEmployee(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.capacityWarnings() });
    },
  });
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export function useEmployeeSkills(employeeId: string) {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.skills(employeeId),
    queryFn: () => listSkills(employeeId),
    select: (result) => result.data ?? [],
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

export function useAddSkill(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreateInput) => addSkill(employeeId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.skills(employeeId) });
    },
  });
}

export function useRemoveSkill(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) => removeSkill(skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.skills(employeeId) });
    },
  });
}

// ─── Certifications ───────────────────────────────────────────────────────────

export function useEmployeeCertifications(employeeId: string) {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.certs(employeeId),
    queryFn: () => listCertifications(employeeId),
    select: (result) => result.data ?? [],
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

export function useAddCertification(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CertificationCreateInput) => addCertification(employeeId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.certs(employeeId) });
    },
  });
}

export function useRemoveCertification(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (certId: string) => removeCertification(certId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.certs(employeeId) });
    },
  });
}

// ─── Allocations ──────────────────────────────────────────────────────────────

export function useResourceAllocations(employeeId?: string, projectId?: string) {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.allocations(employeeId, projectId),
    queryFn: () => listAllocations(employeeId, projectId),
    select: (result) => result.data ?? [],
    staleTime: 30_000,
  });
}

export function useCreateAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AllocationCreateInput) => createAllocation(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.allocations(vars.employee_id) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(vars.employee_id) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.capacityWarnings() });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.heatmap() });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.workloadSummary() });
    },
  });
}

export function useUpdateAllocation(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AllocationUpdateInput }) =>
      updateAllocation(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.allocations(employeeId) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(employeeId) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.capacityWarnings() });
    },
  });
}

export function useArchiveAllocation(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAllocation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.allocations(employeeId) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(employeeId) });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.capacityWarnings() });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.heatmap() });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.workloadSummary() });
    },
  });
}

// ─── Workload / Capacity ──────────────────────────────────────────────────────

export function useWorkloadSummary() {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.workloadSummary(),
    queryFn: () => getWorkloadSummary(),
    select: (result) => result.data ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useCapacityWarnings() {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.capacityWarnings(),
    queryFn: () => getCapacityWarnings(),
    select: (result) => result.data ?? [],
    staleTime: 2 * 60_000,
  });
}

export function useHeatmapData() {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.heatmap(),
    queryFn: () => getHeatmapData(),
    select: (result) => result.data ?? [],
    staleTime: 5 * 60_000,
  });
}
