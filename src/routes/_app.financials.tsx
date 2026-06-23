import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  Receipt,
  Banknote,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Loader2,
  Send,
  Wallet,
  Users,
} from "lucide-react";
import {
  useOrgFinancialSummary,
  useProjectBudgets,
  useExpenses,
  useCreateExpense,
  useApproveExpense,
  useRejectExpense,
  useDeleteExpense,
  useChangeOrders,
  useCreateChangeOrder,
  useSubmitChangeOrder,
  useApproveChangeOrder,
  useRejectChangeOrder,
  useVoidChangeOrder,
  useInvoices,
  useCreateInvoice,
  useSendInvoice,
  useVoidInvoice,
  useRecordPayment,
} from "@/hooks/api/useFinancials";
import { useProjects } from "@/hooks/api/useProjects";
import { useAuth } from "@/contexts/auth-context";
import type { ExpenseCategory, PaymentMethod } from "@/types/financial-view";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/financials")({
  head: () => ({ meta: [{ title: "Financials — ElectraFlow AI" }] }),
  component: Financials,
});

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(v: number | null | undefined, opts?: { compact?: boolean }): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts?.compact ? "compact" : "standard",
    maximumFractionDigits: opts?.compact ? 1 : 0,
  }).format(v);
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const EXP_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

const CO_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-50 text-slate-700",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  voided: "bg-gray-100 text-gray-500",
};

const INV_STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-50 text-slate-700",
  sent: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
  overdue: "bg-red-50 text-red-700",
  voided: "bg-gray-100 text-gray-500",
};

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "labor",
  "material",
  "equipment",
  "subcontractor",
  "software",
  "travel",
  "other",
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

// ─── Main component ───────────────────────────────────────────────────────────

function Financials() {
  const { role } = useAuth();
  const canWrite = ["Admin", "Project Manager"].includes(role ?? "");
  const canApprove = role === "Admin";

  const summaryQ = useOrgFinancialSummary();
  const budgetsQ = useProjectBudgets();
  const expensesQ = useExpenses();
  const cosQ = useChangeOrders();
  const invoicesQ = useInvoices();
  const projectsQ = useProjects();

  const summary = summaryQ.data;
  const budgets = budgetsQ.data ?? [];
  const expenses = expensesQ.data ?? [];
  const cos = cosQ.data ?? [];
  const invoices = invoicesQ.data ?? [];
  const projects = projectsQ.data ?? [];

  // ── Expense dialog ────────────────────────────────────────────────────────
  const [expOpen, setExpOpen] = useState(false);
  const [expProjectId, setExpProjectId] = useState("");
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("material");
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expVendor, setExpVendor] = useState("");
  const [expRef, setExpRef] = useState("");
  const [expBillable, setExpBillable] = useState(true);
  const createExpMut = useCreateExpense();
  const approveExpMut = useApproveExpense();
  const rejectExpMut = useRejectExpense();
  const deleteExpMut = useDeleteExpense();
  const [rejectExpId, setRejectExpId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expProjectId || !expDesc || !expAmount) return;
    const result = await createExpMut.mutateAsync({
      project_id: expProjectId,
      category: expCategory,
      description: expDesc,
      amount: parseFloat(expAmount),
      expense_date: expDate,
      vendor: expVendor || null,
      reference_number: expRef || null,
      billable: expBillable,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Expense created.");
    setExpOpen(false);
    setExpDesc("");
    setExpAmount("");
    setExpVendor("");
    setExpRef("");
  }

  // ── Change Order dialog ───────────────────────────────────────────────────
  const [coOpen, setCoOpen] = useState(false);
  const [coProjectId, setCoProjectId] = useState("");
  const [coNumber, setCoNumber] = useState("");
  const [coTitle, setCoTitle] = useState("");
  const [coDesc, setCoDesc] = useState("");
  const [coAmount, setCoAmount] = useState("");
  const createCoMut = useCreateChangeOrder();
  const submitCoMut = useSubmitChangeOrder();
  const approveCoMut = useApproveChangeOrder();
  const rejectCoMut = useRejectChangeOrder();
  const voidCoMut = useVoidChangeOrder();
  const [rejectCoId, setRejectCoId] = useState<string | null>(null);
  const [voidCoId, setVoidCoId] = useState<string | null>(null);
  const [coReason, setCoReason] = useState("");

  async function handleCreateCO(e: React.FormEvent) {
    e.preventDefault();
    if (!coProjectId || !coNumber || !coTitle || !coAmount) return;
    const result = await createCoMut.mutateAsync({
      project_id: coProjectId,
      co_number: coNumber,
      title: coTitle,
      description: coDesc || null,
      amount: parseFloat(coAmount),
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Change order created.");
    setCoOpen(false);
    setCoNumber("");
    setCoTitle("");
    setCoDesc("");
    setCoAmount("");
  }

  // ── Invoice dialog ────────────────────────────────────────────────────────
  const [invOpen, setInvOpen] = useState(false);
  const [invProjectId, setInvProjectId] = useState("");
  const [invNumber, setInvNumber] = useState("");
  const [invTitle, setInvTitle] = useState("");
  const [invClient, setInvClient] = useState("");
  const [invIssueDate, setInvIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [invDueDate, setInvDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [invTaxRate, setInvTaxRate] = useState("15");
  const [invItems, setInvItems] = useState([{ description: "", quantity: "1", unit_price: "" }]);
  const createInvMut = useCreateInvoice();
  const sendInvMut = useSendInvoice();
  const voidInvMut = useVoidInvoice();

  function addInvItem() {
    setInvItems((prev) => [...prev, { description: "", quantity: "1", unit_price: "" }]);
  }
  function removeInvItem(i: number) {
    setInvItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invProjectId || !invNumber || !invTitle) return;
    const items = invItems
      .filter((i) => i.description && i.unit_price)
      .map((i) => ({
        description: i.description,
        quantity: parseFloat(i.quantity) || 1,
        unit_price: parseFloat(i.unit_price) || 0,
      }));
    if (items.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }

    const result = await createInvMut.mutateAsync({
      project_id: invProjectId,
      invoice_number: invNumber,
      title: invTitle,
      client_name: invClient || null,
      issue_date: invIssueDate,
      due_date: invDueDate,
      tax_rate: parseFloat(invTaxRate) || 0,
      items,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Invoice created.");
    setInvOpen(false);
  }

  // ── Record Payment dialog ─────────────────────────────────────────────────
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const recordPayMut = useRecordPayment();

  const payInvoice = useMemo(
    () => (invoicesQ.data ?? []).find((i) => i.id === payInvoiceId) ?? null,
    [invoicesQ.data, payInvoiceId],
  );

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payInvoiceId || !payAmount || !payInvoice) return;
    const result = await recordPayMut.mutateAsync({
      invoice_id: payInvoiceId,
      project_id: payInvoice.project_id,
      amount: parseFloat(payAmount),
      payment_date: payDate,
      method: payMethod,
      reference_number: payRef || null,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Payment recorded.");
    setPayInvoiceId(null);
    setPayAmount("");
    setPayRef("");
  }

  // ── Loading / error guards ────────────────────────────────────────────────
  const mainLoading = summaryQ.isLoading || budgetsQ.isLoading;
  const mainError = summaryQ.isError || budgetsQ.isError;

  if (mainLoading) {
    return (
      <>
        <PageHeader title="Financial Dashboard" subtitle="Budget, cost and billing overview." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (mainError) {
    return (
      <>
        <PageHeader title="Financial Dashboard" subtitle="Budget, cost and billing overview." />
        <Alert variant="destructive" className="max-w-lg mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Failed to load financial data. Check your connection.</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={() => {
            summaryQ.refetch();
            budgetsQ.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Financial Dashboard"
        subtitle="Budget, billing, cost and AR across all projects."
      />

      {/* ── Summary stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
        <StatCard
          label="Combined Budget"
          value={fmt(summary?.total_budget, { compact: true })}
          icon={Wallet}
          intent="info"
        />
        <StatCard
          label="Revised Budget"
          value={fmt(summary?.total_revised_budget, { compact: true })}
          icon={TrendingUp}
          intent="info"
        />
        <StatCard
          label="Actual Cost"
          value={fmt(summary?.total_actual, { compact: true })}
          icon={Receipt}
          intent={
            summary && summary.total_actual > summary.total_revised_budget
              ? "destructive"
              : "default"
          }
        />
        <StatCard
          label="Labor Cost"
          value={fmt(summary?.total_labor_cost, { compact: true })}
          icon={Users}
        />
        <StatCard
          label="Variance"
          value={fmt(summary?.total_variance, { compact: true })}
          hint={summary && summary.total_variance >= 0 ? "Under budget" : "Over budget"}
          icon={summary && summary.total_variance >= 0 ? TrendingUp : TrendingDown}
          intent={summary && summary.total_variance >= 0 ? "success" : "destructive"}
        />
        <StatCard
          label="Billed"
          value={fmt(summary?.total_billed, { compact: true })}
          icon={FileText}
          intent="info"
        />
        <StatCard
          label="Collected"
          value={fmt(summary?.total_collected, { compact: true })}
          icon={Banknote}
          intent="success"
        />
        <StatCard
          label="Outstanding AR"
          value={fmt(summary?.total_outstanding, { compact: true })}
          icon={DollarSign}
          intent={summary && summary.total_outstanding > 0 ? "warning" : "default"}
        />
      </div>

      {/* ── Main tabs ─────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="expenses">
            Expenses
            {expenses.filter((e) => e.status === "pending").length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {expenses.filter((e) => e.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="change-orders">
            Change Orders
            {cos.filter((c) => c.status === "submitted").length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {cos.filter((c) => c.status === "submitted").length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices">
            Invoices
            {invoices.filter((i) => i.is_overdue).length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-xs">
                {invoices.filter((i) => i.is_overdue).length} overdue
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─ Overview tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Budget vs Actual by Project</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {budgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Wallet className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No budgets configured.</p>
                  {canWrite && (
                    <p className="text-xs">Open a project and set its budget to get started.</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {[
                          "Project",
                          "Budget",
                          "Approved COs",
                          "Revised",
                          "Actual",
                          "Variance",
                          "Labor",
                          "Billed",
                          "Collected",
                          "Outstanding",
                        ].map((h) => (
                          <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgets.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="px-3">
                            <Link
                              to="/projects/$id"
                              params={{ id: b.project_id }}
                              className="font-medium hover:underline"
                            >
                              {b.project_name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{b.project_number}</div>
                          </TableCell>
                          <TableCell className="px-3 text-sm">{fmt(b.total_budget)}</TableCell>
                          <TableCell className="px-3 text-sm">
                            <span
                              className={b.approved_changes < 0 ? "text-red-600" : "text-green-600"}
                            >
                              {b.approved_changes >= 0 ? "+" : ""}
                              {fmt(b.approved_changes)}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 text-sm font-medium">
                            {fmt(b.revised_budget)}
                          </TableCell>
                          <TableCell className="px-3">
                            <div className="text-sm">{fmt(b.total_actual)}</div>
                            {b.revised_budget > 0 && (
                              <Progress
                                value={Math.min((b.total_actual / b.revised_budget) * 100, 100)}
                                className="h-1 mt-1 w-24"
                              />
                            )}
                          </TableCell>
                          <TableCell className="px-3 text-sm">
                            <span className={b.variance >= 0 ? "text-green-600" : "text-red-600"}>
                              {b.variance >= 0 ? "+" : ""}
                              {fmt(b.variance)}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 text-sm">{fmt(b.labor_cost)}</TableCell>
                          <TableCell className="px-3 text-sm">{fmt(b.billed)}</TableCell>
                          <TableCell className="px-3 text-sm">{fmt(b.collected)}</TableCell>
                          <TableCell className="px-3 text-sm">
                            {b.outstanding > 0 ? (
                              <span className="text-amber-600 font-medium">
                                {fmt(b.outstanding)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expense by category breakdown */}
          {(summary?.expense_by_category?.length ?? 0) > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expense Breakdown by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {summary!.expense_by_category
                    .sort((a, b) => b.amount - a.amount)
                    .map((cat) => (
                      <div key={cat.category} className="rounded-md border p-3 flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground capitalize">{cat.category}</p>
                        <p className="text-base font-semibold">{fmt(cat.amount)}</p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─ Expenses tab ─────────────────────────────────────────────────── */}
        <TabsContent value="expenses">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {expenses.length} expenses · {expenses.filter((e) => e.status === "pending").length}{" "}
              pending approval
            </h3>
            {canWrite && (
              <Button size="sm" onClick={() => setExpOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Expense
              </Button>
            )}
          </div>

          {expensesQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border rounded-lg">
              <Receipt className="h-10 w-10 opacity-30" />
              <p className="text-sm">No expenses recorded.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {[
                          "Date",
                          "Project",
                          "Category",
                          "Description",
                          "Amount",
                          "Billable",
                          "Status",
                          "Actions",
                        ].map((h) => (
                          <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((exp) => (
                        <TableRow key={exp.id}>
                          <TableCell className="px-3 text-sm whitespace-nowrap">
                            {exp.expense_date}
                          </TableCell>
                          <TableCell className="px-3 text-sm">
                            <Link
                              to="/projects/$id"
                              params={{ id: exp.project_id }}
                              className="hover:underline"
                            >
                              {exp.project_number}
                            </Link>
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge variant="outline" className="capitalize text-xs">
                              {exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 text-sm max-w-xs truncate">
                            {exp.description}
                          </TableCell>
                          <TableCell className="px-3 text-sm font-medium">
                            {fmt(exp.amount)}
                          </TableCell>
                          <TableCell className="px-3 text-sm">
                            {exp.billable ? "Yes" : "No"}
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge
                              variant="outline"
                              className={`${EXP_STATUS_COLOR[exp.status]} text-xs capitalize`}
                            >
                              {exp.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3">
                            {exp.status === "pending" && canApprove && (
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-green-600"
                                  disabled={approveExpMut.isPending}
                                  onClick={async () => {
                                    const r = await approveExpMut.mutateAsync(exp.id);
                                    if (r.error) toast.error(r.error.message);
                                    else toast.success("Expense approved.");
                                  }}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-red-600"
                                  onClick={() => {
                                    setRejectExpId(exp.id);
                                    setRejectReason("");
                                  }}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            {exp.status === "pending" && !canApprove && (
                              <span className="text-xs text-muted-foreground">Pending</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─ Change Orders tab ─────────────────────────────────────────────── */}
        <TabsContent value="change-orders">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {cos.length} change orders · {cos.filter((c) => c.status === "submitted").length}{" "}
              pending review
            </h3>
            {canWrite && (
              <Button size="sm" onClick={() => setCoOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New Change Order
              </Button>
            )}
          </div>

          {cosQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : cos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border rounded-lg">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">No change orders.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {[
                          "CO #",
                          "Project",
                          "Title",
                          "Amount",
                          "Status",
                          "Submitted By",
                          "Actions",
                        ].map((h) => (
                          <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cos.map((co) => (
                        <TableRow key={co.id}>
                          <TableCell className="px-3 text-sm font-mono">{co.co_number}</TableCell>
                          <TableCell className="px-3 text-sm">
                            <Link
                              to="/projects/$id"
                              params={{ id: co.project_id }}
                              className="hover:underline"
                            >
                              {co.project_number}
                            </Link>
                          </TableCell>
                          <TableCell className="px-3 text-sm max-w-xs">
                            <div className="font-medium truncate">{co.title}</div>
                            {co.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {co.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell
                            className={`px-3 text-sm font-medium ${co.amount < 0 ? "text-red-600" : "text-green-600"}`}
                          >
                            {co.amount >= 0 ? "+" : ""}
                            {fmt(co.amount)}
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge
                              variant="outline"
                              className={`${CO_STATUS_COLOR[co.status]} text-xs capitalize`}
                            >
                              {co.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 text-sm">
                            {co.submitted_by_name ?? "—"}
                          </TableCell>
                          <TableCell className="px-3">
                            <div className="flex gap-1">
                              {co.status === "draft" && canWrite && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={submitCoMut.isPending}
                                  onClick={async () => {
                                    const r = await submitCoMut.mutateAsync(co.id);
                                    if (r.error) toast.error(r.error.message);
                                    else toast.success("Submitted for review.");
                                  }}
                                >
                                  Submit
                                </Button>
                              )}
                              {co.status === "submitted" && canApprove && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-green-600"
                                    disabled={approveCoMut.isPending}
                                    onClick={async () => {
                                      const r = await approveCoMut.mutateAsync(co.id);
                                      if (r.error) toast.error(r.error.message);
                                      else toast.success("Change order approved.");
                                    }}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-600"
                                    onClick={() => {
                                      setRejectCoId(co.id);
                                      setCoReason("");
                                    }}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {["draft", "submitted"].includes(co.status) && canApprove && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() => {
                                    setVoidCoId(co.id);
                                    setCoReason("");
                                  }}
                                >
                                  Void
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─ Invoices tab ──────────────────────────────────────────────────── */}
        <TabsContent value="invoices">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {invoices.length} invoices · {invoices.filter((i) => i.is_overdue).length} overdue
            </h3>
            {canWrite && (
              <Button size="sm" onClick={() => setInvOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New Invoice
              </Button>
            )}
          </div>

          {invoicesQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border rounded-lg">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">No invoices yet.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {[
                          "Invoice #",
                          "Project",
                          "Title",
                          "Status",
                          "Issue",
                          "Due",
                          "Total",
                          "Paid",
                          "Outstanding",
                          "Actions",
                        ].map((h) => (
                          <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="px-3 text-sm font-mono">
                            {inv.invoice_number}
                          </TableCell>
                          <TableCell className="px-3 text-sm">
                            <Link
                              to="/projects/$id"
                              params={{ id: inv.project_id }}
                              className="hover:underline"
                            >
                              {inv.project_number}
                            </Link>
                          </TableCell>
                          <TableCell className="px-3 text-sm max-w-[180px] truncate">
                            {inv.title}
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge
                              variant="outline"
                              className={`${inv.is_overdue ? INV_STATUS_COLOR.overdue : INV_STATUS_COLOR[inv.status]} text-xs capitalize`}
                            >
                              {inv.is_overdue ? "overdue" : inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 text-sm whitespace-nowrap">
                            {inv.issue_date}
                          </TableCell>
                          <TableCell
                            className={`px-3 text-sm whitespace-nowrap ${inv.is_overdue ? "text-red-600 font-medium" : ""}`}
                          >
                            {inv.due_date}
                          </TableCell>
                          <TableCell className="px-3 text-sm font-medium">
                            {fmt(inv.total_amount)}
                          </TableCell>
                          <TableCell className="px-3 text-sm text-green-600">
                            {inv.paid_amount > 0 ? fmt(inv.paid_amount) : "—"}
                          </TableCell>
                          <TableCell className="px-3 text-sm">
                            {inv.outstanding_amount > 0 ? (
                              <span className="text-amber-600 font-medium">
                                {fmt(inv.outstanding_amount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3">
                            <div className="flex gap-1">
                              {inv.status === "draft" && canWrite && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={sendInvMut.isPending}
                                  onClick={async () => {
                                    const r = await sendInvMut.mutateAsync(inv.id);
                                    if (r.error) toast.error(r.error.message);
                                    else toast.success("Invoice marked as sent.");
                                  }}
                                >
                                  <Send className="mr-1 h-3 w-3" /> Send
                                </Button>
                              )}
                              {["sent", "overdue"].includes(inv.status) && canWrite && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setPayInvoiceId(inv.id);
                                    setPayAmount(String(inv.outstanding_amount));
                                    setPayDate(new Date().toISOString().slice(0, 10));
                                    setPayRef("");
                                  }}
                                >
                                  <Banknote className="mr-1 h-3 w-3" /> Record Payment
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─────────────────── Dialogs ────────────────────────────────────── */}

      {/* Create Expense */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateExpense} className="space-y-3">
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={expProjectId} onValueChange={setExpProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={expCategory}
                  onValueChange={(v) => setExpCategory(v as ExpenseCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Brief description"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Vendor</Label>
                <Input
                  value={expVendor}
                  onChange={(e) => setExpVendor(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reference / PO #</Label>
              <Input
                value={expRef}
                onChange={(e) => setExpRef(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={expBillable}
                onChange={(e) => setExpBillable(e.target.checked)}
                className="rounded"
              />
              Billable to client
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createExpMut.isPending}>
                {createExpMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Expense */}
      <Dialog
        open={!!rejectExpId}
        onOpenChange={(o) => {
          if (!o) setRejectExpId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectExpId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectExpMut.isPending}
              onClick={async () => {
                if (!rejectExpId || !rejectReason.trim()) return;
                const r = await rejectExpMut.mutateAsync({ id: rejectExpId, reason: rejectReason });
                if (r.error) toast.error(r.error.message);
                else {
                  toast.success("Expense rejected.");
                  setRejectExpId(null);
                }
              }}
            >
              {rejectExpMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Change Order */}
      <Dialog open={coOpen} onOpenChange={setCoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Change Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCO} className="space-y-3">
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={coProjectId} onValueChange={setCoProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CO Number</Label>
                <Input
                  value={coNumber}
                  onChange={(e) => setCoNumber(e.target.value)}
                  placeholder="CO-001"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Amount (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={coAmount}
                  onChange={(e) => setCoAmount(e.target.value)}
                  placeholder="-50000 or +150000"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={coTitle}
                onChange={(e) => setCoTitle(e.target.value)}
                placeholder="Brief scope change description"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={coDesc}
                onChange={(e) => setCoDesc(e.target.value)}
                placeholder="Optional detail"
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Negative amounts represent credit change orders. Budget is updated only after Admin
              approval.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCoOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCoMut.isPending}>
                {createCoMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject CO */}
      <Dialog
        open={!!rejectCoId}
        onOpenChange={(o) => {
          if (!o) setRejectCoId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Change Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Rejection reason (required)</Label>
            <Textarea value={coReason} onChange={(e) => setCoReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectCoId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!coReason.trim() || rejectCoMut.isPending}
              onClick={async () => {
                if (!rejectCoId) return;
                const r = await rejectCoMut.mutateAsync({ id: rejectCoId, reason: coReason });
                if (r.error) toast.error(r.error.message);
                else {
                  toast.success("Change order rejected.");
                  setRejectCoId(null);
                }
              }}
            >
              {rejectCoMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void CO */}
      <Dialog
        open={!!voidCoId}
        onOpenChange={(o) => {
          if (!o) setVoidCoId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Void Change Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Void reason (required)</Label>
            <Textarea value={coReason} onChange={(e) => setCoReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidCoId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!coReason.trim() || voidCoMut.isPending}
              onClick={async () => {
                if (!voidCoId) return;
                const r = await voidCoMut.mutateAsync({ id: voidCoId, reason: coReason });
                if (r.error) toast.error(r.error.message);
                else {
                  toast.success("Change order voided.");
                  setVoidCoId(null);
                }
              }}
            >
              {voidCoMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateInvoice} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Project</Label>
                <Select value={invProjectId} onValueChange={setInvProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Invoice #</Label>
                <Input
                  value={invNumber}
                  onChange={(e) => setInvNumber(e.target.value)}
                  placeholder="INV-2026-001"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Client Name</Label>
                <Input
                  value={invClient}
                  onChange={(e) => setInvClient(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={invTitle}
                onChange={(e) => setInvTitle(e.target.value)}
                placeholder="e.g. Milestone 2 — Design Complete"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  value={invIssueDate}
                  onChange={(e) => setInvIssueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={invDueDate}
                  onChange={(e) => setInvDueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Tax Rate %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={invTaxRate}
                  onChange={(e) => setInvTaxRate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" size="sm" variant="outline" onClick={addInvItem}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {invItems.map((item, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-end">
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Description</Label>}
                    <Input
                      value={item.description}
                      onChange={(e) => {
                        const next = [...invItems];
                        next[i] = { ...next[i], description: e.target.value };
                        setInvItems(next);
                      }}
                      placeholder="Service description"
                    />
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => {
                        const next = [...invItems];
                        next[i] = { ...next[i], quantity: e.target.value };
                        setInvItems(next);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Unit Price</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(e) => {
                        const next = [...invItems];
                        next[i] = { ...next[i], unit_price: e.target.value };
                        setInvItems(next);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Total</Label>}
                    <div className="h-9 flex items-center text-sm font-medium">
                      {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                    </div>
                  </div>
                  {invItems.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive self-end"
                      onClick={() => removeInvItem(i)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="text-right text-sm font-medium pt-1">
                Subtotal:{" "}
                {fmt(
                  invItems.reduce(
                    (s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0),
                    0,
                  ),
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInvOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInvMut.isPending}>
                {createInvMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment */}
      <Dialog
        open={!!payInvoiceId}
        onOpenChange={(o) => {
          if (!o) setPayInvoiceId(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {payInvoice && (
            <p className="text-sm text-muted-foreground">
              Invoice {payInvoice.invoice_number} — Outstanding:{" "}
              <span className="font-medium text-foreground">
                {fmt(payInvoice.outstanding_amount)}
              </span>
            </p>
          )}
          <form onSubmit={handleRecordPayment} className="space-y-3">
            <div className="space-y-1">
              <Label>Amount (USD)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference #</Label>
              <Input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Bank transfer ref, check # …"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayInvoiceId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordPayMut.isPending}>
                {recordPayMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Void Invoice confirmation reused for void CO — handled inline above */}
      <Dialog
        open={false /* voidInv handled inline */}
        onOpenChange={() => {
          /* noop */
        }}
      >
        <DialogContent />
      </Dialog>
    </>
  );
}
