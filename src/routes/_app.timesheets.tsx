import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useTimesheets, useTimesheetSummary, useCreateTimesheet } from "@/hooks/api/useTimesheets";
import {
  Clock,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle,
  FileText,
  XCircle,
  TrendingUp,
  Info,
} from "lucide-react";
import { getWeekStart, getWeekEnd, toISODate } from "@/types/timesheet-view";
import type { TimesheetView } from "@/types/timesheet-view";

export const Route = createFileRoute("/_app/timesheets")({
  head: () => ({ meta: [{ title: "Timesheets — ElectraFlow AI" }] }),
  component: TimesheetsPage,
});

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>;
    case "submitted":
      return <Badge className="bg-blue-100 text-blue-700 text-xs">Submitted</Badge>;
    case "rejected":
      return (
        <Badge variant="destructive" className="text-xs">
          Rejected
        </Badge>
      );
    case "archived":
      return (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Archived
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          Draft
        </Badge>
      );
  }
}

function formatWeek(start: string, end: string) {
  const s = new Date(start + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const e = new Date(end + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${s} – ${e}`;
}

function TimesheetRowSkeleton() {
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

function TimesheetsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const normRole = (role ?? "").toLowerCase().replace(/ /g, "_");
  const isAdmin = normRole === "admin";
  const isHR = normRole === "hr";
  const isPM = normRole === "project_manager";
  const canApprove = isAdmin || isHR || isPM;
  const isEngineer = [
    "senior_electrical_engineer",
    "electrical_engineer",
    "qa_qc_engineer",
  ].includes(normRole);
  const canCreate = isEngineer || isAdmin || isHR || isPM;

  const [activeTab, setActiveTab] = useState<"mine" | "pending" | "all">("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [weekStartDate, setWeekStartDate] = useState(toISODate(getWeekStart()));
  const [createError, setCreateError] = useState<string | null>(null);

  const tsQuery = useTimesheets(
    activeTab === "pending" ? { status: "submitted" } : activeTab === "mine" ? {} : {},
  );
  const summary = useTimesheetSummary();
  const createMut = useCreateTimesheet();

  const isMock = tsQuery.data?.isMockData ?? false;

  const filtered = useMemo(() => {
    const allTimesheets = tsQuery.data?.data ?? [];
    let list = allTimesheets;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => (t.employee_name ?? "").toLowerCase().includes(q) || t.week_start_date.includes(q),
      );
    }
    return list;
  }, [tsQuery.data?.data, statusFilter, search]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const sum = summary.data;

  async function handleCreate() {
    setCreateError(null);
    const result = await createMut.mutateAsync({ week_start_date: weekStartDate });
    if (result.error) {
      setCreateError(result.error.message ?? "An error occurred.");
      return;
    }
    setCreateDialogOpen(false);
    if (result.data) {
      navigate({ to: "/timesheets/$id", params: { id: result.data.id } });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timesheets"
        subtitle="Weekly time tracking, approval, and reporting."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Timesheet
            </Button>
          ) : undefined
        }
      />

      {isMock && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 text-sm">
            Demo mode — changes are temporary and disappear after refresh.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary cards */}
      {sum && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Draft</p>
                  <p className="text-xl font-bold">{sum.draft}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Submitted</p>
                  <p className="text-xl font-bold text-blue-600">{sum.submitted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                  <p className="text-xl font-bold text-green-600">{sum.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                  <p className="text-xl font-bold text-destructive">{sum.rejected}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Overtime Weeks</p>
                  <p className="text-xl font-bold text-orange-600">{sum.overtime_weeks}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as typeof activeTab);
          setPage(0);
        }}
      >
        <TabsList>
          <TabsTrigger value="mine">My Timesheets</TabsTrigger>
          {canApprove && (
            <TabsTrigger value="pending">
              Pending Approval
              {sum && sum.submitted > 0 && (
                <Badge className="ml-1.5 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px] bg-blue-600">
                  {sum.submitted}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {(isAdmin || isHR) && <TabsTrigger value="all">All</TabsTrigger>}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee or week…"
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
                setStatusFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {tsQuery.isError && (
                <div className="flex flex-col items-center gap-2 py-16">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">Failed to load timesheets.</p>
                  <Button variant="outline" size="sm" onClick={() => tsQuery.refetch()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              )}

              {!tsQuery.isError && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total Hrs</TableHead>
                      <TableHead>Regular</TableHead>
                      <TableHead>Overtime</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tsQuery.isLoading && [1, 2, 3].map((i) => <TimesheetRowSkeleton key={i} />)}

                    {!tsQuery.isLoading && paginated.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                          {activeTab === "pending"
                            ? "No timesheets pending approval."
                            : "No timesheets found. Start logging time for this week."}
                        </TableCell>
                      </TableRow>
                    )}

                    {paginated.map((ts: TimesheetView) => (
                      <TableRow key={ts.id} className="cursor-pointer hover:bg-muted/40">
                        <TableCell>
                          <Link
                            to="/timesheets/$id"
                            params={{ id: ts.id }}
                            className="font-medium hover:underline"
                          >
                            {ts.employee_name}
                          </Link>
                          {ts.employee_number && (
                            <p className="text-xs text-muted-foreground">{ts.employee_number}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatWeek(ts.week_start_date, ts.week_end_date)}
                        </TableCell>
                        <TableCell>{statusBadge(ts.status)}</TableCell>
                        <TableCell className="font-medium">{ts.total_hours}h</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ts.regular_hours}h
                        </TableCell>
                        <TableCell>
                          {ts.overtime_hours > 0 ? (
                            <Badge className="bg-orange-100 text-orange-700 text-xs">
                              +{ts.overtime_hours}h OT
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}{" "}
                of {filtered.length}
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
        </TabsContent>
      </Tabs>

      {/* Create timesheet dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>New Timesheet</DialogTitle>
            <DialogDescription>
              Select the week you want to log time for. Only one timesheet per week.
            </DialogDescription>
          </DialogHeader>
          {createError && (
            <Alert variant="destructive">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">Week starting (Monday):</p>
            <Input
              type="date"
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
            />
            {weekStartDate && (
              <p className="text-xs text-muted-foreground">
                Week:{" "}
                {formatWeek(
                  weekStartDate,
                  toISODate(getWeekEnd(new Date(weekStartDate + "T00:00:00"))),
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createMut.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
