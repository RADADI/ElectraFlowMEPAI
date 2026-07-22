import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";
import {
  useEmployees,
  useCapacityWarnings,
  useWorkloadSummary,
  useDeactivateEmployee,
  useReactivateEmployee,
} from "@/hooks/api/useEmployees";
import { EmployeeFormModal } from "@/components/resources/EmployeeFormModal";
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  AlertTriangle,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { EmployeeView, CapacityHealth } from "@/types/employee-view";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({ meta: [{ title: "Resource Allocation — ElectraFlow AI" }] }),
  component: Resources,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function utilColor(pct: number, active: boolean) {
  if (!active) return "bg-gray-100 text-gray-500";
  if (pct > 100) return "bg-red-100 text-red-700";
  if (pct >= 80) return "bg-green-100 text-green-700";
  if (pct >= 50) return "bg-yellow-100 text-yellow-700";
  return "bg-blue-100 text-blue-700";
}

function capacityHealthProps(health: CapacityHealth): {
  label: string;
  color: string;
  icon: React.ReactNode;
} {
  switch (health) {
    case "overbooked":
      return {
        label: "Overbooked",
        color: "border-red-200 bg-red-50 text-red-700",
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      };
    case "underutilized":
      return {
        label: "Underutilized",
        color: "border-yellow-200 bg-yellow-50 text-yellow-700",
        icon: <TrendingDown className="h-4 w-4 text-yellow-500" />,
      };
    case "unavailable":
      return {
        label: "Unavailable",
        color: "border-gray-200 bg-gray-50 text-gray-500",
        icon: <UserX className="h-4 w-4 text-gray-400" />,
      };
    default:
      return {
        label: "Healthy",
        color: "border-green-200 bg-green-50 text-green-700",
        icon: <TrendingUp className="h-4 w-4 text-green-500" />,
      };
  }
}

function EmployeeRowSkeleton() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function Resources() {
  const { role } = useAuth();
  const isAdmin = (role ?? "").toLowerCase() === "admin";
  const isHR = (role ?? "").toLowerCase() === "hr";
  const canManage = isAdmin || isHR;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<EmployeeView | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<EmployeeView | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<EmployeeView | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const employeesQuery = useEmployees(
    statusFilter !== "all" ? { is_active: statusFilter === "active" } : undefined,
  );
  const warningsQuery = useCapacityWarnings();
  const workloadQuery = useWorkloadSummary();

  const deactivateMut = useDeactivateEmployee(deactivateTarget?.id ?? "");
  const reactivateMut = useReactivateEmployee(reactivateTarget?.id ?? "");

  const isMock = employeesQuery.data?.isMockData ?? false;

  const filtered = useMemo(() => {
    const employees = employeesQuery.data?.data ?? [];
    let list = employees;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          (e.title ?? "").toLowerCase().includes(q) ||
          (e.employee_number ?? "").toLowerCase().includes(q) ||
          (e.department ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [employeesQuery.data?.data, search]);

  const employees = employeesQuery.data?.data ?? [];

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const warnings = warningsQuery.data ?? [];
  const workload = workloadQuery.data ?? [];

  const totalActive = employees.filter((e) => e.is_active).length;
  const totalInactive = employees.filter((e) => !e.is_active).length;
  const overbooked = warnings.filter((w) => w.health === "overbooked").length;
  const underutilized = warnings.filter((w) => w.health === "underutilized").length;

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    const result = await deactivateMut.mutateAsync();
    if (result.error) {
      setActionMsg(`Error: ${result.error.message}`);
    } else {
      const warning = (result.data as EmployeeView & { warning?: string }).warning;
      setActionMsg(
        warning
          ? `${deactivateTarget.full_name} deactivated. Note: ${warning}`
          : `${deactivateTarget.full_name} has been deactivated.`,
      );
    }
    setDeactivateTarget(null);
  }

  async function handleReactivate() {
    if (!reactivateTarget) return;
    const result = await reactivateMut.mutateAsync();
    if (result.error) {
      setActionMsg(`Error: ${result.error.message}`);
    } else {
      setActionMsg(`${reactivateTarget.full_name} has been reactivated.`);
    }
    setReactivateTarget(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resource Management"
        subtitle="Employee directory, skills, certifications, and project allocations."
        actions={
          canManage ? (
            <Button onClick={() => setShowCreateModal(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Employee
            </Button>
          ) : undefined
        }
      />

      {/* Mock mode banner */}
      {isMock && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 text-sm">
            Demo mode — changes are temporary and disappear after refresh.
          </AlertDescription>
        </Alert>
      )}

      {/* Action feedback */}
      {actionMsg && (
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>{actionMsg}</span>
            <Button size="sm" variant="ghost" onClick={() => setActionMsg(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Staff</p>
                <p className="text-2xl font-bold">{totalActive}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Utilised Now</p>
                <p className="text-2xl font-bold">
                  {employees.filter((e) => e.current_utilization_percent > 0).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overbooked</p>
                <p className="text-2xl font-bold">{overbooked}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-50 p-2">
                <TrendingDown className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Underutilized</p>
                <p className="text-2xl font-bold">{underutilized}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capacity health cards */}
      {warnings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Capacity Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {warnings
                .filter((w) => w.health !== "healthy")
                .slice(0, 10)
                .map((w) => {
                  const props = capacityHealthProps(w.health);
                  return (
                    <div
                      key={w.employee_id}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${props.color}`}
                    >
                      {props.icon}
                      {w.employee_name} — {w.utilization_percent}%
                      <span className="opacity-70">({props.label})</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workload chart */}
      {workload.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">6-Month Workload Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workload} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit=" hrs" />
                <Tooltip formatter={(v: number) => [`${v} hrs`]} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar
                  dataKey="available_hours"
                  name="Available"
                  fill="var(--color-chart-1)"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="required_hours"
                  name="Required"
                  fill="var(--color-chart-2)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, title, department…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as "all" | "active" | "inactive");
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Employee table */}
      <Card>
        <CardContent className="p-0">
          {employeesQuery.isError && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Failed to load employees. Please try again.
              </p>
              <Button variant="outline" size="sm" onClick={() => employeesQuery.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          )}

          {!employeesQuery.isError && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title / Dept</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Current Projects</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeesQuery.isLoading &&
                  [1, 2, 3, 4, 5].map((i) => <EmployeeRowSkeleton key={i} />)}

                {!employeesQuery.isLoading && paginated.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 6 : 5}
                      className="py-16 text-center text-muted-foreground"
                    >
                      {search || statusFilter !== "all"
                        ? "No employees match your filters."
                        : "No employees yet. Add your first team member."}
                    </TableCell>
                  </TableRow>
                )}

                {paginated.map((emp) => (
                  <TableRow key={emp.id} className="group">
                    <TableCell>
                      <Link
                        to="/resources/$id"
                        params={{ id: emp.id }}
                        className="font-medium hover:underline"
                      >
                        {emp.full_name}
                      </Link>
                      {emp.employee_number && (
                        <p className="text-xs text-muted-foreground">{emp.employee_number}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{emp.title ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{emp.department ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          emp.is_active
                            ? "border-green-200 text-green-700"
                            : "border-gray-200 text-gray-500"
                        }
                      >
                        {emp.is_active ? (emp.employment_status ?? "Active") : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${utilColor(emp.current_utilization_percent, emp.is_active)}`}
                      >
                        {emp.current_utilization_percent}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {emp.current_projects.length > 0 ? emp.current_projects.join(", ") : "—"}
                      </p>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to="/resources/$id" params={{ id: emp.id }}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => setEditEmployee(emp)}>
                            Edit
                          </Button>
                          {emp.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeactivateTarget(emp)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => setReactivateTarget(emp)}
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} employees
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Inactive count note */}
      {totalInactive > 0 && statusFilter === "active" && (
        <p className="text-xs text-muted-foreground text-center">
          {totalInactive} inactive employee{totalInactive === 1 ? "" : "s"} hidden.{" "}
          <button className="underline" onClick={() => setStatusFilter("all")}>
            Show all
          </button>
        </p>
      )}

      {/* Modals */}
      <EmployeeFormModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={() => setShowCreateModal(false)}
      />
      <EmployeeFormModal
        open={!!editEmployee}
        onOpenChange={(v) => !v && setEditEmployee(null)}
        initialEmployee={editEmployee ?? undefined}
        onSuccess={() => setEditEmployee(null)}
      />

      {/* Deactivate confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.full_name} will be marked as inactive. Any active allocations will
              remain but will not be counted in utilization calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate confirm */}
      <AlertDialog open={!!reactivateTarget} onOpenChange={(v) => !v && setReactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              {reactivateTarget?.full_name} will be marked as active and their employment status
              will be set to Active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivate}>Reactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
