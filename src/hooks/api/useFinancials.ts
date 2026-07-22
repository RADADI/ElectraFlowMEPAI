/**
 * React Query hooks for the Financials module — Phase 12
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProjectBudget,
  listProjectBudgets,
  upsertProjectBudget,
  listExpenses,
  createExpense,
  updateExpense,
  approveExpense,
  rejectExpense,
  deleteExpense,
  listChangeOrders,
  createChangeOrder,
  submitChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  voidChangeOrder,
  listInvoices,
  createInvoice,
  sendInvoice,
  voidInvoice,
  recordPayment,
  listPayments,
  getOrgFinancialSummary,
  getLaborCostForProject,
} from "@/services/financial.service";
import type {
  ExpenseCreateInput,
  ChangeOrderCreateInput,
  InvoiceCreateInput,
  PaymentCreateInput,
  ExpenseUpdateInput,
} from "@/types/financial-view";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const FINANCIAL_KEYS = {
  budgets: ["financial", "budgets"] as const,
  budget: (projectId: string) => ["financial", "budgets", projectId] as const,
  expenses: (filters?: object) => ["financial", "expenses", filters ?? {}] as const,
  changeOrders: (filters?: object) => ["financial", "change_orders", filters ?? {}] as const,
  invoices: (filters?: object) => ["financial", "invoices", filters ?? {}] as const,
  payments: (filters?: object) => ["financial", "payments", filters ?? {}] as const,
  orgSummary: ["financial", "org_summary"] as const,
  laborCost: (projectId: string) => ["financial", "labor_cost", projectId] as const,
};

// ─── Budgets ──────────────────────────────────────────────────────────────────

export function useProjectBudgets() {
  return useQuery({
    queryKey: FINANCIAL_KEYS.budgets,
    queryFn: () => listProjectBudgets(),
    select: (r) => r.data ?? [],
    staleTime: 60_000,
  });
}

export function useProjectBudget(projectId: string) {
  return useQuery({
    queryKey: FINANCIAL_KEYS.budget(projectId),
    queryFn: () => getProjectBudget(projectId),
    select: (r) => r.data ?? null,
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useUpsertBudget(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      total_budget: number;
      contingency_percent?: number;
      notes?: string | null;
    }) => upsertProjectBudget(projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budget(projectId) });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export function useExpenses(
  filters: { projectId?: string; status?: string; category?: string } = {},
) {
  return useQuery({
    queryKey: FINANCIAL_KEYS.expenses(filters),
    queryFn: () => listExpenses(filters),
    select: (r) => r.data ?? [],
    staleTime: 30_000,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseCreateInput) => createExpense(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "expenses"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExpenseUpdateInput }) =>
      updateExpense(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "expenses"] }),
  });
}

export function useApproveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "expenses"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

export function useRejectExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectExpense(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "expenses"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
    },
  });
}

// ─── Change Orders ────────────────────────────────────────────────────────────

export function useChangeOrders(filters: { projectId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: FINANCIAL_KEYS.changeOrders(filters),
    queryFn: () => listChangeOrders(filters),
    select: (r) => r.data ?? [],
    staleTime: 30_000,
  });
}

export function useCreateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeOrderCreateInput) => createChangeOrder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "change_orders"] }),
  });
}

export function useSubmitChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitChangeOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "change_orders"] }),
  });
}

export function useApproveChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveChangeOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "change_orders"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

export function useRejectChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectChangeOrder(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "change_orders"] }),
  });
}

export function useVoidChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidChangeOrder(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "change_orders"] }),
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export function useInvoices(filters: { projectId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: FINANCIAL_KEYS.invoices(filters),
    queryFn: () => listInvoices(filters),
    select: (r) => r.data ?? [],
    staleTime: 30_000,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvoiceCreateInput) => createInvoice(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "invoices"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

export function useSendInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "invoices"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

export function useVoidInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voidInvoice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial", "invoices"] }),
  });
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export function usePayments(filters: { projectId?: string; invoiceId?: string } = {}) {
  return useQuery({
    queryKey: FINANCIAL_KEYS.payments(filters),
    queryFn: () => listPayments(filters),
    select: (r) => r.data ?? [],
    staleTime: 30_000,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentCreateInput) => recordPayment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial", "payments"] });
      qc.invalidateQueries({ queryKey: ["financial", "invoices"] });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.budgets });
      qc.invalidateQueries({ queryKey: FINANCIAL_KEYS.orgSummary });
    },
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function useOrgFinancialSummary() {
  return useQuery({
    queryKey: FINANCIAL_KEYS.orgSummary,
    queryFn: () => getOrgFinancialSummary(),
    select: (r) => r.data ?? null,
    staleTime: 60_000,
  });
}

export function useLaborCost(projectId: string) {
  return useQuery({
    queryKey: FINANCIAL_KEYS.laborCost(projectId),
    queryFn: () => getLaborCostForProject(projectId),
    select: (r) => r.data ?? null,
    enabled: !!projectId,
    staleTime: 120_000,
  });
}
