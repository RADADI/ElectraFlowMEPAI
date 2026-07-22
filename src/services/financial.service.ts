/**
 * Financial service — Phase 12
 *
 * Covers: project budgets, expenses, change orders, invoices (with items),
 * payments, labor cost from approved timesheets, and org/project summaries.
 *
 * All functions follow the service pattern: Supabase when configured,
 * mock fallback when not.  Mock data lives in @/lib/dummy-data.
 */

import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  ProjectBudget,
  Expense,
  ChangeOrder,
  Invoice,
  InvoiceItem,
  Payment,
} from "@/types/database";
import type {
  ProjectBudgetView,
  OrgFinancialSummary,
  ExpenseView,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  ChangeOrderView,
  ChangeOrderCreateInput,
  InvoiceView,
  InvoiceCreateInput,
  PaymentView,
  PaymentCreateInput,
  LaborCostRow,
} from "@/types/financial-view";
import {
  dummyProjectBudgets,
  dummyExpenses,
  dummyChangeOrders,
  dummyInvoices,
} from "@/lib/dummy-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0;
}

function toDate(s: string | null | undefined): string {
  return s ?? new Date().toISOString().slice(0, 10);
}

function isOverdue(invoice: { due_date: string; status: string }): boolean {
  return invoice.status === "sent" && new Date(invoice.due_date) < new Date();
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const mockBudgets: ProjectBudgetView[] = (
  dummyProjectBudgets as unknown as ProjectBudgetView[]
).map((b) => ({ ...b }));

const mockExpenses: ExpenseView[] = (dummyExpenses as unknown as ExpenseView[]).map((e) => ({
  ...e,
}));

const mockCOs: ChangeOrderView[] = (dummyChangeOrders as unknown as ChangeOrderView[]).map((c) => ({
  ...c,
}));

const mockInvoices: InvoiceView[] = (dummyInvoices as unknown as InvoiceView[]).map((i) => ({
  ...i,
}));

// ─── Budget ───────────────────────────────────────────────────────────────────

export async function getProjectBudget(
  projectId: string,
): Promise<ServiceResult<ProjectBudgetView | null>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const found = mockBudgets.find((b) => b.project_id === projectId) ?? null;
    return mockOk(found);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(null);

  try {
    const { data, error } = await supabase
      .from("project_budgets")
      .select("*, projects(name, project_number)")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail(error);
    if (!data) return ok(null);

    const budget = data as ProjectBudget & {
      projects: { name: string; project_number: string };
    };

    // Fetch labor cost from approved timesheet entries
    const laborResult = await getLaborCostForProject(projectId);
    const labor = laborResult.data?.labor_cost ?? 0;

    // Fetch approved expenses total
    const expResult = await supabase
      .from("expenses")
      .select("amount")
      .eq("project_id", projectId)
      .eq("status", "approved")
      .is("deleted_at", null);

    const actualExpenses = (expResult.data ?? []).reduce((s, e) => s + fmt(e.amount), 0);

    // Invoice totals
    const invResult = await supabase
      .from("invoices")
      .select("status, total_amount, paid_amount")
      .eq("project_id", projectId)
      .in("status", ["sent", "paid", "overdue"])
      .is("deleted_at", null);

    const billed = (invResult.data ?? []).reduce((s, i) => s + fmt(i.total_amount), 0);
    const collected = (invResult.data ?? []).reduce((s, i) => s + fmt(i.paid_amount), 0);

    const revised = fmt(budget.total_budget) + fmt(budget.approved_changes);
    const contingencyAmt = (revised * fmt(budget.contingency_percent)) / 100;
    const totalActual = actualExpenses + labor;
    const variance = revised - totalActual;

    const view: ProjectBudgetView = {
      id: budget.id,
      project_id: budget.project_id,
      project_name: budget.projects?.name ?? "",
      project_number: budget.projects?.project_number ?? "",
      organization_id: budget.organization_id,
      total_budget: fmt(budget.total_budget),
      approved_changes: fmt(budget.approved_changes),
      revised_budget: revised,
      contingency_percent: fmt(budget.contingency_percent),
      contingency_amount: contingencyAmt,
      notes: budget.notes,
      actual_expenses: actualExpenses,
      labor_cost: labor,
      total_actual: totalActual,
      variance,
      variance_percent: revised > 0 ? (variance / revised) * 100 : 0,
      billed,
      collected,
      outstanding: billed - collected,
      created_at: budget.created_at,
      updated_at: budget.updated_at,
    };

    return ok(view);
  } catch (err) {
    return fail(err);
  }
}

export async function listProjectBudgets(): Promise<ServiceResult<ProjectBudgetView[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(mockBudgets);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    const { data, error } = await supabase
      .from("project_budgets")
      .select("*, projects(name, project_number)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return fail(error);

    const views: ProjectBudgetView[] = await Promise.all(
      (
        (data ?? []) as (ProjectBudget & {
          projects: { name: string; project_number: string };
        })[]
      ).map(async (b) => {
        const laborResult = await getLaborCostForProject(b.project_id);
        const labor = laborResult.data?.labor_cost ?? 0;

        const expResult = await supabase!
          .from("expenses")
          .select("amount")
          .eq("project_id", b.project_id)
          .eq("status", "approved")
          .is("deleted_at", null);
        const actualExpenses = (expResult.data ?? []).reduce((s, e) => s + fmt(e.amount), 0);

        const invResult = await supabase!
          .from("invoices")
          .select("status, total_amount, paid_amount")
          .eq("project_id", b.project_id)
          .in("status", ["sent", "paid", "overdue"])
          .is("deleted_at", null);
        const billed = (invResult.data ?? []).reduce((s, i) => s + fmt(i.total_amount), 0);
        const collected = (invResult.data ?? []).reduce((s, i) => s + fmt(i.paid_amount), 0);

        const revised = fmt(b.total_budget) + fmt(b.approved_changes);
        const contingencyAmt = (revised * fmt(b.contingency_percent)) / 100;
        const totalActual = actualExpenses + labor;
        const variance = revised - totalActual;

        return {
          id: b.id,
          project_id: b.project_id,
          project_name: b.projects?.name ?? "",
          project_number: b.projects?.project_number ?? "",
          organization_id: b.organization_id,
          total_budget: fmt(b.total_budget),
          approved_changes: fmt(b.approved_changes),
          revised_budget: revised,
          contingency_percent: fmt(b.contingency_percent),
          contingency_amount: contingencyAmt,
          notes: b.notes,
          actual_expenses: actualExpenses,
          labor_cost: labor,
          total_actual: totalActual,
          variance,
          variance_percent: revised > 0 ? (variance / revised) * 100 : 0,
          billed,
          collected,
          outstanding: billed - collected,
          created_at: b.created_at,
          updated_at: b.updated_at,
        };
      }),
    );

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

export async function upsertProjectBudget(
  projectId: string,
  payload: {
    total_budget: number;
    contingency_percent?: number;
    notes?: string | null;
  },
): Promise<ServiceResult<ProjectBudget>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return fail("Supabase is not configured.");
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("project_budgets")
      .upsert(
        {
          project_id: projectId,
          organization_id: organizationId,
          total_budget: payload.total_budget,
          contingency_percent: payload.contingency_percent ?? 10,
          notes: payload.notes ?? null,
          created_by: userId,
        },
        { onConflict: "project_id" },
      )
      .select()
      .single();

    if (error) return fail(error);

    await logAction({
      action: "budget.upsert",
      resource_type: "project_budgets",
      resource_id: (data as ProjectBudget).id,
      new_data: payload as Record<string, unknown>,
    });

    return ok(data as ProjectBudget);
  } catch (err) {
    return fail(err);
  }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function listExpenses(
  filters: {
    projectId?: string;
    status?: string;
    category?: string;
  } = {},
): Promise<ServiceResult<ExpenseView[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = [...mockExpenses];
    if (filters.projectId) items = items.filter((e) => e.project_id === filters.projectId);
    if (filters.status) items = items.filter((e) => e.status === filters.status);
    if (filters.category) items = items.filter((e) => e.category === filters.category);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    let q = supabase
      .from("expenses")
      .select(
        "*, projects(name, project_number), created_by_profile:profiles!created_by(full_name), approved_by_profile:profiles!approved_by(full_name)",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false });

    if (filters.projectId) q = q.eq("project_id", filters.projectId);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.category) q = q.eq("category", filters.category);

    const { data, error } = await q;
    if (error) return fail(error);

    const views: ExpenseView[] = (data ?? []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      project_id: e.project_id as string,
      project_name: (e.projects as { name: string } | null)?.name ?? "",
      project_number: (e.projects as { project_number: string } | null)?.project_number ?? "",
      organization_id: e.organization_id as string,
      category: e.category as ExpenseView["category"],
      description: e.description as string,
      amount: fmt(e.amount),
      expense_date: e.expense_date as string,
      vendor: e.vendor as string | null,
      reference_number: e.reference_number as string | null,
      billable: e.billable as boolean,
      status: e.status as ExpenseView["status"],
      approved_by: e.approved_by as string | null,
      approved_by_name: (e.approved_by_profile as { full_name: string } | null)?.full_name ?? null,
      approved_at: e.approved_at as string | null,
      rejection_reason: e.rejection_reason as string | null,
      created_by: e.created_by as string | null,
      created_by_name: (e.created_by_profile as { full_name: string } | null)?.full_name ?? null,
      created_at: e.created_at as string,
      updated_at: e.updated_at as string,
    }));

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

export async function createExpense(
  input: ExpenseCreateInput,
): Promise<ServiceResult<ExpenseView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const mock: ExpenseView = {
      id: crypto.randomUUID(),
      project_id: input.project_id,
      project_name: "Demo Project",
      project_number: "DEMO-001",
      organization_id: "mock-org",
      category: input.category,
      description: input.description,
      amount: input.amount,
      expense_date: input.expense_date,
      vendor: input.vendor ?? null,
      reference_number: input.reference_number ?? null,
      billable: input.billable ?? true,
      status: "pending",
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      rejection_reason: null,
      created_by: null,
      created_by_name: "Demo User",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockExpenses.unshift(mock);
    return mockOk(mock);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        project_id: input.project_id,
        organization_id: organizationId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        expense_date: input.expense_date,
        vendor: input.vendor ?? null,
        reference_number: input.reference_number ?? null,
        billable: input.billable ?? true,
        status: "pending",
        created_by: userId,
      })
      .select()
      .single();

    if (error) return fail(error);

    await logAction({
      action: "expense.create",
      resource_type: "expenses",
      resource_id: (data as Expense).id,
      new_data: input as unknown as Record<string, unknown>,
    });

    const result = await listExpenses({ projectId: input.project_id });
    const found = result.data?.find((e) => e.id === (data as Expense).id);
    return found
      ? ok(found)
      : ok({
          ...(data as Expense),
          project_name: "",
          project_number: "",
          approved_by_name: null,
          created_by_name: null,
        } as ExpenseView);
  } catch (err) {
    return fail(err);
  }
}

export async function updateExpense(
  id: string,
  input: ExpenseUpdateInput,
): Promise<ServiceResult<Expense>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockExpenses.findIndex((e) => e.id === id);
    if (idx >= 0) Object.assign(mockExpenses[idx], input, { updated_at: new Date().toISOString() });
    return mockOk(mockExpenses[idx] as unknown as Expense);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("expenses")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) return fail(error);
    await logAction({
      action: "expense.update",
      resource_type: "expenses",
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    return ok(data as Expense);
  } catch (err) {
    return fail(err);
  }
}

export async function approveExpense(id: string): Promise<ServiceResult<Expense>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockExpenses.findIndex((e) => e.id === id);
    if (idx >= 0)
      Object.assign(mockExpenses[idx], {
        status: "approved",
        approved_at: new Date().toISOString(),
      });
    return mockOk(mockExpenses[idx] as unknown as Expense);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("expenses")
      .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) return fail(error);
    await logAction({ action: "expense.approve", resource_type: "expenses", resource_id: id });
    return ok(data as Expense);
  } catch (err) {
    return fail(err);
  }
}

export async function rejectExpense(id: string, reason: string): Promise<ServiceResult<Expense>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockExpenses.findIndex((e) => e.id === id);
    if (idx >= 0)
      Object.assign(mockExpenses[idx], { status: "rejected", rejection_reason: reason });
    return mockOk(mockExpenses[idx] as unknown as Expense);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("expenses")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) return fail(error);
    await logAction({
      action: "expense.reject",
      resource_type: "expenses",
      resource_id: id,
      new_data: { reason },
    });
    return ok(data as Expense);
  } catch (err) {
    return fail(err);
  }
}

export async function deleteExpense(id: string): Promise<ServiceResult<{ id: string }>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockExpenses.findIndex((e) => e.id === id);
    if (idx >= 0) mockExpenses.splice(idx, 1);
    return mockOk({ id });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { error } = await supabase
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) return fail(error);
    await logAction({ action: "expense.delete", resource_type: "expenses", resource_id: id });
    return ok({ id });
  } catch (err) {
    return fail(err);
  }
}

// ─── Change Orders ────────────────────────────────────────────────────────────

export async function listChangeOrders(
  filters: {
    projectId?: string;
    status?: string;
  } = {},
): Promise<ServiceResult<ChangeOrderView[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = [...mockCOs];
    if (filters.projectId) items = items.filter((c) => c.project_id === filters.projectId);
    if (filters.status) items = items.filter((c) => c.status === filters.status);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    let q = supabase
      .from("change_orders")
      .select(
        "*, projects(name, project_number), submitted_by_profile:profiles!submitted_by(full_name), reviewed_by_profile:profiles!reviewed_by(full_name), created_by_profile:profiles!created_by(full_name)",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filters.projectId) q = q.eq("project_id", filters.projectId);
    if (filters.status) q = q.eq("status", filters.status);

    const { data, error } = await q;
    if (error) return fail(error);

    const views: ChangeOrderView[] = (data ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      project_id: c.project_id as string,
      project_name: (c.projects as { name: string } | null)?.name ?? "",
      project_number: (c.projects as { project_number: string } | null)?.project_number ?? "",
      organization_id: c.organization_id as string,
      co_number: c.co_number as string,
      title: c.title as string,
      description: c.description as string | null,
      amount: fmt(c.amount),
      status: c.status as ChangeOrderView["status"],
      submitted_by: c.submitted_by as string | null,
      submitted_by_name:
        (c.submitted_by_profile as { full_name: string } | null)?.full_name ?? null,
      submitted_at: c.submitted_at as string | null,
      reviewed_by: c.reviewed_by as string | null,
      reviewed_by_name: (c.reviewed_by_profile as { full_name: string } | null)?.full_name ?? null,
      reviewed_at: c.reviewed_at as string | null,
      rejection_reason: c.rejection_reason as string | null,
      void_reason: c.void_reason as string | null,
      revision_number: c.revision_number as number,
      created_by: c.created_by as string | null,
      created_by_name: (c.created_by_profile as { full_name: string } | null)?.full_name ?? null,
      created_at: c.created_at as string,
      updated_at: c.updated_at as string,
    }));

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

export async function createChangeOrder(
  input: ChangeOrderCreateInput,
): Promise<ServiceResult<ChangeOrderView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const mock: ChangeOrderView = {
      id: crypto.randomUUID(),
      project_id: input.project_id,
      project_name: "Demo Project",
      project_number: "DEMO-001",
      organization_id: "mock-org",
      co_number: input.co_number,
      title: input.title,
      description: input.description ?? null,
      amount: input.amount,
      status: "draft",
      submitted_by: null,
      submitted_by_name: null,
      submitted_at: null,
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      rejection_reason: null,
      void_reason: null,
      revision_number: 1,
      created_by: null,
      created_by_name: "Demo User",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockCOs.unshift(mock);
    return mockOk(mock);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("change_orders")
      .insert({
        project_id: input.project_id,
        organization_id: organizationId,
        co_number: input.co_number,
        title: input.title,
        description: input.description ?? null,
        amount: input.amount,
        status: "draft",
        created_by: userId,
      })
      .select()
      .single();

    if (error) return fail(error);
    await logAction({
      action: "change_order.create",
      resource_type: "change_orders",
      resource_id: (data as ChangeOrder).id,
      new_data: input as unknown as Record<string, unknown>,
    });
    return ok(data as unknown as ChangeOrderView);
  } catch (err) {
    return fail(err);
  }
}

export async function submitChangeOrder(id: string): Promise<ServiceResult<ChangeOrder>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockCOs.findIndex((c) => c.id === id);
    if (idx >= 0)
      Object.assign(mockCOs[idx], { status: "submitted", submitted_at: new Date().toISOString() });
    return mockOk(mockCOs[idx] as unknown as ChangeOrder);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("change_orders")
      .update({ status: "submitted", submitted_by: userId, submitted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft")
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) return fail(error);
    await logAction({
      action: "change_order.submit",
      resource_type: "change_orders",
      resource_id: id,
    });
    return ok(data as ChangeOrder);
  } catch (err) {
    return fail(err);
  }
}

export async function approveChangeOrder(id: string): Promise<ServiceResult<ChangeOrder>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockCOs.findIndex((c) => c.id === id);
    if (idx >= 0)
      Object.assign(mockCOs[idx], { status: "approved", reviewed_at: new Date().toISOString() });
    return mockOk(mockCOs[idx] as unknown as ChangeOrder);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    // Fetch the CO to get amount and project_id
    const { data: co, error: coErr } = await supabase
      .from("change_orders")
      .select("amount, project_id")
      .eq("id", id)
      .single();
    if (coErr) return fail(coErr);

    // Approve CO
    const { data, error } = await supabase
      .from("change_orders")
      .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) return fail(error);

    // Increment approved_changes on project_budgets (upsert)
    await supabase.from("project_budgets").upsert(
      {
        project_id: (co as ChangeOrder).project_id,
        organization_id: organizationId,
        approved_changes: (co as ChangeOrder).amount,
      },
      { onConflict: "project_id", ignoreDuplicates: false },
    );

    await logAction({
      action: "change_order.approve",
      resource_type: "change_orders",
      resource_id: id,
    });
    return ok(data as ChangeOrder);
  } catch (err) {
    return fail(err);
  }
}

export async function rejectChangeOrder(
  id: string,
  reason: string,
): Promise<ServiceResult<ChangeOrder>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockCOs.findIndex((c) => c.id === id);
    if (idx >= 0) Object.assign(mockCOs[idx], { status: "rejected", rejection_reason: reason });
    return mockOk(mockCOs[idx] as unknown as ChangeOrder);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("change_orders")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) return fail(error);
    await logAction({
      action: "change_order.reject",
      resource_type: "change_orders",
      resource_id: id,
      new_data: { reason },
    });
    return ok(data as ChangeOrder);
  } catch (err) {
    return fail(err);
  }
}

export async function voidChangeOrder(
  id: string,
  reason: string,
): Promise<ServiceResult<ChangeOrder>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockCOs.findIndex((c) => c.id === id);
    if (idx >= 0) Object.assign(mockCOs[idx], { status: "voided", void_reason: reason });
    return mockOk(mockCOs[idx] as unknown as ChangeOrder);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("change_orders")
      .update({ status: "voided", void_reason: reason })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) return fail(error);
    await logAction({
      action: "change_order.void",
      resource_type: "change_orders",
      resource_id: id,
      new_data: { reason },
    });
    return ok(data as ChangeOrder);
  } catch (err) {
    return fail(err);
  }
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function listInvoices(
  filters: {
    projectId?: string;
    status?: string;
  } = {},
): Promise<ServiceResult<InvoiceView[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items = mockInvoices.map((i) => ({ ...i, is_overdue: isOverdue(i) }));
    if (filters.projectId) items = items.filter((i) => i.project_id === filters.projectId);
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    let q = supabase
      .from("invoices")
      .select(
        "*, projects(name, project_number), created_by_profile:profiles!created_by(full_name), invoice_items(*), payments(*)",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false });

    if (filters.projectId) q = q.eq("project_id", filters.projectId);
    if (filters.status) q = q.eq("status", filters.status);

    const { data, error } = await q;
    if (error) return fail(error);

    const views: InvoiceView[] = (data ?? []).map((inv: Record<string, unknown>) => {
      const total = fmt(inv.total_amount);
      const paid = fmt(inv.paid_amount);
      return {
        id: inv.id as string,
        project_id: inv.project_id as string,
        project_name: (inv.projects as { name: string } | null)?.name ?? "",
        project_number: (inv.projects as { project_number: string } | null)?.project_number ?? "",
        organization_id: inv.organization_id as string,
        invoice_number: inv.invoice_number as string,
        title: inv.title as string,
        client_name: inv.client_name as string | null,
        status: inv.status as InvoiceView["status"],
        issue_date: toDate(inv.issue_date as string),
        due_date: toDate(inv.due_date as string),
        subtotal: fmt(inv.subtotal),
        tax_rate: fmt(inv.tax_rate),
        tax_amount: fmt(inv.tax_amount),
        total_amount: total,
        paid_amount: paid,
        outstanding_amount: total - paid,
        notes: inv.notes as string | null,
        created_by: inv.created_by as string | null,
        created_by_name:
          (inv.created_by_profile as { full_name: string } | null)?.full_name ?? null,
        created_at: inv.created_at as string,
        updated_at: inv.updated_at as string,
        is_overdue: isOverdue({ due_date: inv.due_date as string, status: inv.status as string }),
        items: ((inv.invoice_items as InvoiceItem[]) ?? []).map((item) => ({
          id: item.id,
          invoice_id: item.invoice_id,
          description: item.description,
          quantity: fmt(item.quantity),
          unit_price: fmt(item.unit_price),
          amount: fmt(item.amount),
          sort_order: item.sort_order,
        })),
        payments: ((inv.payments as Payment[]) ?? []).map((p) => ({
          id: p.id,
          invoice_id: p.invoice_id,
          invoice_number: inv.invoice_number as string,
          project_id: p.project_id,
          project_name: (inv.projects as { name: string } | null)?.name ?? "",
          organization_id: p.organization_id,
          amount: fmt(p.amount),
          payment_date: toDate(p.payment_date),
          method: p.method,
          reference_number: p.reference_number,
          notes: p.notes,
          created_by: p.created_by,
          created_by_name: null,
          created_at: p.created_at,
        })),
      };
    });

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

export async function createInvoice(
  input: InvoiceCreateInput,
): Promise<ServiceResult<InvoiceView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const taxRate = input.tax_rate ?? 0;
    const taxAmt = (subtotal * taxRate) / 100;
    const mock: InvoiceView = {
      id: crypto.randomUUID(),
      project_id: input.project_id,
      project_name: "Demo Project",
      project_number: "DEMO-001",
      organization_id: "mock-org",
      invoice_number: input.invoice_number,
      title: input.title,
      client_name: input.client_name ?? null,
      status: "draft",
      issue_date: input.issue_date,
      due_date: input.due_date,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmt,
      total_amount: subtotal + taxAmt,
      paid_amount: 0,
      outstanding_amount: subtotal + taxAmt,
      notes: input.notes ?? null,
      created_by: null,
      created_by_name: "Demo User",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_overdue: false,
      items: input.items.map((item, i) => ({
        id: crypto.randomUUID(),
        invoice_id: "",
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.quantity * item.unit_price,
        sort_order: i,
      })),
      payments: [],
    };
    mockInvoices.unshift(mock);
    return mockOk(mock);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const taxRate = input.tax_rate ?? 0;
    const taxAmt = (subtotal * taxRate) / 100;

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        project_id: input.project_id,
        organization_id: organizationId,
        invoice_number: input.invoice_number,
        title: input.title,
        client_name: input.client_name ?? null,
        issue_date: input.issue_date,
        due_date: input.due_date,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmt,
        total_amount: subtotal + taxAmt,
        notes: input.notes ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return fail(error);

    const invoiceId = (inv as Invoice).id;

    if (input.items.length > 0) {
      await supabase.from("invoice_items").insert(
        input.items.map((item, i) => ({
          invoice_id: invoiceId,
          organization_id: organizationId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.quantity * item.unit_price,
          sort_order: i,
        })),
      );
    }

    await logAction({
      action: "invoice.create",
      resource_type: "invoices",
      resource_id: invoiceId,
      new_data: { invoice_number: input.invoice_number },
    });

    const result = await listInvoices({ projectId: input.project_id });
    const found = result.data?.find((i) => i.id === invoiceId);
    return found ? ok(found) : ok(inv as unknown as InvoiceView);
  } catch (err) {
    return fail(err);
  }
}

export async function sendInvoice(id: string): Promise<ServiceResult<Invoice>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockInvoices.findIndex((i) => i.id === id);
    if (idx >= 0) Object.assign(mockInvoices[idx], { status: "sent" });
    return mockOk(mockInvoices[idx] as unknown as Invoice);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", id)
      .eq("status", "draft")
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) return fail(error);
    await logAction({ action: "invoice.send", resource_type: "invoices", resource_id: id });
    return ok(data as Invoice);
  } catch (err) {
    return fail(err);
  }
}

export async function voidInvoice(id: string): Promise<ServiceResult<Invoice>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = mockInvoices.findIndex((i) => i.id === id);
    if (idx >= 0) Object.assign(mockInvoices[idx], { status: "voided" });
    return mockOk(mockInvoices[idx] as unknown as Invoice);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "voided" })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) return fail(error);
    await logAction({ action: "invoice.void", resource_type: "invoices", resource_id: id });
    return ok(data as Invoice);
  } catch (err) {
    return fail(err);
  }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function recordPayment(
  input: PaymentCreateInput,
): Promise<ServiceResult<PaymentView>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const mock: PaymentView = {
      id: crypto.randomUUID(),
      invoice_id: input.invoice_id,
      invoice_number: "INV-DEMO",
      project_id: input.project_id,
      project_name: "Demo Project",
      organization_id: "mock-org",
      amount: input.amount,
      payment_date: input.payment_date,
      method: input.method,
      reference_number: input.reference_number ?? null,
      notes: input.notes ?? null,
      created_by: null,
      created_by_name: "Demo User",
      created_at: new Date().toISOString(),
    };
    // Update invoice paid_amount in mock
    const invIdx = mockInvoices.findIndex((i) => i.id === input.invoice_id);
    if (invIdx >= 0) {
      const inv = mockInvoices[invIdx];
      inv.paid_amount = (inv.paid_amount ?? 0) + input.amount;
      inv.outstanding_amount = inv.total_amount - inv.paid_amount;
      if (inv.paid_amount >= inv.total_amount) inv.status = "paid";
      inv.payments = [...(inv.payments ?? []), mock];
    }
    return mockOk(mock);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        invoice_id: input.invoice_id,
        project_id: input.project_id,
        organization_id: organizationId,
        amount: input.amount,
        payment_date: input.payment_date,
        method: input.method,
        reference_number: input.reference_number ?? null,
        notes: input.notes ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return fail(error);

    // Update paid_amount on the invoice
    const { data: inv } = await supabase
      .from("invoices")
      .select("total_amount, paid_amount")
      .eq("id", input.invoice_id)
      .single();

    if (inv) {
      const newPaid = fmt(inv.paid_amount) + input.amount;
      const newStatus = newPaid >= fmt(inv.total_amount) ? "paid" : undefined;
      await supabase
        .from("invoices")
        .update({
          paid_amount: newPaid,
          ...(newStatus ? { status: newStatus } : {}),
        })
        .eq("id", input.invoice_id);
    }

    await logAction({
      action: "payment.record",
      resource_type: "payments",
      resource_id: (payment as Payment).id,
      new_data: { invoice_id: input.invoice_id, amount: input.amount },
    });
    return ok(payment as unknown as PaymentView);
  } catch (err) {
    return fail(err);
  }
}

export async function listPayments(
  filters: {
    projectId?: string;
    invoiceId?: string;
  } = {},
): Promise<ServiceResult<PaymentView[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    let items: PaymentView[] = mockInvoices.flatMap((i) => i.payments ?? []);
    if (filters.projectId) items = items.filter((p) => p.project_id === filters.projectId);
    if (filters.invoiceId) items = items.filter((p) => p.invoice_id === filters.invoiceId);
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk([]);

  try {
    let q = supabase
      .from("payments")
      .select("*, invoices(invoice_number), projects(name)")
      .eq("organization_id", organizationId)
      .order("payment_date", { ascending: false });

    if (filters.projectId) q = q.eq("project_id", filters.projectId);
    if (filters.invoiceId) q = q.eq("invoice_id", filters.invoiceId);

    const { data, error } = await q;
    if (error) return fail(error);

    const views: PaymentView[] = (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      invoice_id: p.invoice_id as string,
      invoice_number: (p.invoices as { invoice_number: string } | null)?.invoice_number ?? "",
      project_id: p.project_id as string,
      project_name: (p.projects as { name: string } | null)?.name ?? "",
      organization_id: p.organization_id as string,
      amount: fmt(p.amount),
      payment_date: toDate(p.payment_date as string),
      method: p.method as PaymentView["method"],
      reference_number: p.reference_number as string | null,
      notes: p.notes as string | null,
      created_by: p.created_by as string | null,
      created_by_name: null,
      created_at: p.created_at as string,
    }));

    return ok(views);
  } catch (err) {
    return fail(err);
  }
}

// ─── Labor cost from approved timesheets ─────────────────────────────────────

export async function getLaborCostForProject(
  projectId: string,
): Promise<ServiceResult<LaborCostRow>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const budget = mockBudgets.find((b) => b.project_id === projectId);
    return mockOk({
      project_id: projectId,
      project_name: budget?.project_name ?? "Demo Project",
      total_hours: 240,
      labor_cost: budget?.labor_cost ?? 0,
    });
  }

  try {
    // Join timesheet_entries → timesheets (approved) → employees (hourly_rate)
    const { data, error } = await supabase
      .from("timesheet_entries")
      .select(
        `
        hours,
        timesheets!inner(status, employee_id),
        employees!left(hourly_rate)
      `,
      )
      .eq("project_id", projectId)
      .eq("timesheets.status", "approved");

    if (error) return fail(error);

    let totalHours = 0;
    let laborCost = 0;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const h = fmt(row.hours);
      const rate = fmt((row.employees as { hourly_rate: number } | null)?.hourly_rate ?? 0);
      totalHours += h;
      laborCost += h * rate;
    }

    return ok({
      project_id: projectId,
      project_name: "",
      total_hours: totalHours,
      labor_cost: laborCost,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function getLaborCostAllProjects(): Promise<ServiceResult<LaborCostRow[]>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return mockOk(
      mockBudgets.map((b) => ({
        project_id: b.project_id,
        project_name: b.project_name,
        total_hours: Math.round(b.labor_cost / 85),
        labor_cost: b.labor_cost,
      })),
    );
  }

  try {
    const { data, error } = await supabase
      .from("timesheet_entries")
      .select(
        `
        project_id,
        hours,
        timesheets!inner(status),
        employees!left(hourly_rate)
      `,
      )
      .eq("timesheets.status", "approved");

    if (error) return fail(error);

    const byProject: Record<string, { hours: number; cost: number }> = {};
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const pid = row.project_id as string;
      const h = fmt(row.hours);
      const rate = fmt((row.employees as { hourly_rate: number } | null)?.hourly_rate ?? 0);
      if (!byProject[pid]) byProject[pid] = { hours: 0, cost: 0 };
      byProject[pid].hours += h;
      byProject[pid].cost += h * rate;
    }

    const rows: LaborCostRow[] = Object.entries(byProject).map(([pid, v]) => ({
      project_id: pid,
      project_name: "",
      total_hours: v.hours,
      labor_cost: v.cost,
    }));

    return ok(rows);
  } catch (err) {
    return fail(err);
  }
}

// ─── Org financial summary ────────────────────────────────────────────────────

export async function getOrgFinancialSummary(): Promise<ServiceResult<OrgFinancialSummary>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const budgets = mockBudgets;
    const expenses = mockExpenses.filter((e) => e.status === "approved");
    const invoices = mockInvoices;

    const expByCategory = expenses.reduce(
      (acc, e) => {
        const existing = acc.find((x) => x.category === e.category);
        if (existing) existing.amount += e.amount;
        else acc.push({ category: e.category, amount: e.amount });
        return acc;
      },
      [] as { category: ExpenseView["category"]; amount: number }[],
    );

    const invByStatus = invoices.reduce(
      (acc, i) => {
        const existing = acc.find((x) => x.status === i.status);
        if (existing) {
          existing.count++;
          existing.amount += i.total_amount;
        } else acc.push({ status: i.status, count: 1, amount: i.total_amount });
        return acc;
      },
      [] as { status: InvoiceView["status"]; count: number; amount: number }[],
    );

    return mockOk({
      total_budget: budgets.reduce((s, b) => s + b.total_budget, 0),
      total_revised_budget: budgets.reduce((s, b) => s + b.revised_budget, 0),
      total_actual: budgets.reduce((s, b) => s + b.total_actual, 0),
      total_variance: budgets.reduce((s, b) => s + b.variance, 0),
      total_billed: budgets.reduce((s, b) => s + b.billed, 0),
      total_collected: budgets.reduce((s, b) => s + b.collected, 0),
      total_outstanding: budgets.reduce((s, b) => s + b.outstanding, 0),
      total_labor_cost: budgets.reduce((s, b) => s + b.labor_cost, 0),
      expense_by_category: expByCategory,
      invoice_by_status: invByStatus,
    });
  }

  // Supabase: aggregate from list calls
  try {
    const [budgetRes, expenseRes, invoiceRes] = await Promise.all([
      listProjectBudgets(),
      listExpenses({ status: "approved" }),
      listInvoices(),
    ]);

    const budgets = budgetRes.data ?? [];
    const expenses = expenseRes.data ?? [];
    const invoices = invoiceRes.data ?? [];

    const expByCategory = expenses.reduce(
      (acc, e) => {
        const existing = acc.find((x) => x.category === e.category);
        if (existing) existing.amount += e.amount;
        else acc.push({ category: e.category, amount: e.amount });
        return acc;
      },
      [] as { category: ExpenseView["category"]; amount: number }[],
    );

    const invByStatus = invoices.reduce(
      (acc, i) => {
        const existing = acc.find((x) => x.status === i.status);
        if (existing) {
          existing.count++;
          existing.amount += i.total_amount;
        } else acc.push({ status: i.status, count: 1, amount: i.total_amount });
        return acc;
      },
      [] as { status: InvoiceView["status"]; count: number; amount: number }[],
    );

    return ok({
      total_budget: budgets.reduce((s, b) => s + b.total_budget, 0),
      total_revised_budget: budgets.reduce((s, b) => s + b.revised_budget, 0),
      total_actual: budgets.reduce((s, b) => s + b.total_actual, 0),
      total_variance: budgets.reduce((s, b) => s + b.variance, 0),
      total_billed: budgets.reduce((s, b) => s + b.billed, 0),
      total_collected: budgets.reduce((s, b) => s + b.collected, 0),
      total_outstanding: budgets.reduce((s, b) => s + b.outstanding, 0),
      total_labor_cost: budgets.reduce((s, b) => s + b.labor_cost, 0),
      expense_by_category: expByCategory,
      invoice_by_status: invByStatus,
    });
  } catch (err) {
    return fail(err);
  }
}
