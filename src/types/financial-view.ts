/**
 * Financial view types — Phase 12
 *
 * UI-friendly shapes that denormalize DB rows with display fields,
 * computed totals, and project/profile names.
 *
 * Rule: pages/components NEVER import raw DB types directly.
 * They receive these view types from the financial service via React Query.
 */

import type {
  ExpenseCategory,
  ExpenseStatus,
  ChangeOrderStatus,
  InvoiceStatus,
  PaymentMethod,
} from "@/types/database";

export type { ExpenseCategory, ExpenseStatus, ChangeOrderStatus, InvoiceStatus, PaymentMethod };

// ─── Budget ───────────────────────────────────────────────────────────────────

export interface ProjectBudgetView {
  id: string;
  project_id: string;
  project_name: string;
  project_number: string;
  organization_id: string;
  /** Baseline approved budget (from project_budgets.total_budget). */
  total_budget: number;
  /** Running sum of approved change-order amounts. */
  approved_changes: number;
  /** total_budget + approved_changes */
  revised_budget: number;
  contingency_percent: number;
  /** revised_budget × contingency_percent / 100 */
  contingency_amount: number;
  notes: string | null;
  /** Approved expenses total */
  actual_expenses: number;
  /** Labor cost derived from approved timesheets × hourly rates */
  labor_cost: number;
  /** actual_expenses + labor_cost */
  total_actual: number;
  /** revised_budget − total_actual (positive = under budget) */
  variance: number;
  variance_percent: number;
  /** Subtotal of sent + paid invoices */
  billed: number;
  /** Sum of paid_amount on invoices */
  collected: number;
  /** billed − collected */
  outstanding: number;
  created_at: string;
  updated_at: string;
}

// ─── Organization financial summary ──────────────────────────────────────────

export interface OrgFinancialSummary {
  total_budget: number;
  total_revised_budget: number;
  total_actual: number;
  total_variance: number;
  total_billed: number;
  total_collected: number;
  total_outstanding: number;
  total_labor_cost: number;
  expense_by_category: { category: ExpenseCategory; amount: number }[];
  invoice_by_status: { status: InvoiceStatus; count: number; amount: number }[];
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export interface ExpenseView {
  id: string;
  project_id: string;
  project_name: string;
  project_number: string;
  organization_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  vendor: string | null;
  reference_number: string | null;
  billable: boolean;
  status: ExpenseStatus;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreateInput {
  project_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  vendor?: string | null;
  reference_number?: string | null;
  billable?: boolean;
}

export type ExpenseUpdateInput = Partial<ExpenseCreateInput>;

// ─── Change Order ─────────────────────────────────────────────────────────────

export interface ChangeOrderView {
  id: string;
  project_id: string;
  project_name: string;
  project_number: string;
  organization_id: string;
  co_number: string;
  title: string;
  description: string | null;
  amount: number;
  status: ChangeOrderStatus;
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  void_reason: string | null;
  revision_number: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeOrderCreateInput {
  project_id: string;
  co_number: string;
  title: string;
  description?: string | null;
  amount: number;
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceItemView {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

export interface InvoiceView {
  id: string;
  project_id: string;
  project_name: string;
  project_number: string;
  organization_id: string;
  invoice_number: string;
  title: string;
  client_name: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  items: InvoiceItemView[];
  payments: PaymentView[];
  /** true if today is past due_date and status is 'sent' */
  is_overdue: boolean;
}

export interface InvoiceCreateInput {
  project_id: string;
  invoice_number: string;
  title: string;
  client_name?: string | null;
  issue_date: string;
  due_date: string;
  tax_rate?: number;
  notes?: string | null;
  items: { description: string; quantity: number; unit_price: number }[];
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface PaymentView {
  id: string;
  invoice_id: string;
  invoice_number: string;
  project_id: string;
  project_name: string;
  organization_id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface PaymentCreateInput {
  invoice_id: string;
  project_id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference_number?: string | null;
  notes?: string | null;
}

// ─── Labor cost ───────────────────────────────────────────────────────────────

export interface LaborCostRow {
  project_id: string;
  project_name: string;
  total_hours: number;
  labor_cost: number;
}
