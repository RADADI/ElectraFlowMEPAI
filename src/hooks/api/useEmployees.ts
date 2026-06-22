import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
} from "@/services/employee.service";
import type { EmployeeInsert, EmployeeUpdate } from "@/types/database";

export const EMPLOYEE_KEYS = {
  all: ["employees"] as const,
  detail: (id: string) => ["employees", id] as const,
};

export function useEmployees() {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.all,
    queryFn: () => listEmployees(),
    select: (result) => result.data ?? [],
    staleTime: 60_000,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: EMPLOYEE_KEYS.detail(id),
    queryFn: () => getEmployee(id),
    select: (result) => result.data ?? null,
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmployeeInsert) => createEmployee(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
    },
  });
}

export function useUpdateEmployee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmployeeUpdate) => updateEmployee(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.all });
      qc.invalidateQueries({ queryKey: EMPLOYEE_KEYS.detail(id) });
    },
  });
}
