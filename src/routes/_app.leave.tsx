import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import {
  useLeaveRequests,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useCancelLeaveRequest,
} from "@/hooks/api/useLeave";
import { LeaveRequestModal } from "@/components/leave/LeaveRequestModal";
import {
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Info,
  Loader2,
} from "lucide-react";
import type { LeaveRequestView, LeaveConflict } from "@/types/timesheet-view";

export const Route = createFileRoute("/_app/leave")({
  head: () => ({ meta: [{ title: "Leave Management — ElectraFlow AI" }] }),
  component: LeavePage,
});

const LEAVE_TYPE_LABELS: Record<string, string> = {
  pto: "PTO",
  sick: "Sick Leave",
  unpaid: "Unpaid",
  holiday: "Public Holiday",
  bereavement: "Bereavement",
  other: "Other",
};

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-100 text-green-700 text-xs">Approved</Badge>;
    case "rejected":
      return (
        <Badge variant="destructive" className="text-xs">
          Rejected
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Cancelled
        </Badge>
      );
    default:
      return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Pending</Badge>;
  }
}

function conflictBadge(c: LeaveConflict) {
  switch (c.severity) {
    case "critical_path_conflict":
      return (
        <Badge key={c.severity} title={c.message} className="bg-red-100 text-red-700 text-xs">
          Critical Path Conflict
        </Badge>
      );
    case "allocation_conflict":
      return (
        <Badge key={c.severity} title={c.message} className="bg-orange-100 text-orange-700 text-xs">
          Allocation Conflict
        </Badge>
      );
    case "overlapping_leave":
      return (
        <Badge key={c.severity} title={c.message} className="bg-yellow-100 text-yellow-700 text-xs">
          Overlapping Leave
        </Badge>
      );
    default:
      return (
        <Badge key={c.severity} className="bg-green-50 text-green-700 text-xs">
          No Conflict
        </Badge>
      );
  }
}

function LeaveRowSkeleton() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}

function LeavePage() {
  const { role } = useAuth();
  const normRole = (role ?? "").toLowerCase().replace(/ /g, "_");
  const isAdmin = normRole === "admin";
  const isHR = normRole === "hr";
  const isPM = normRole === "project_manager";
  const canApprove = isAdmin || isHR || isPM;
  const canRequest = !["executive"].includes(normRole);

  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  // Modals
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequestView | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const leaveQuery = useLeaveRequests(activeTab === "pending" ? { status: "pending" } : undefined);
  const isMock = leaveQuery.data?.isMockData ?? false;

  const approveMut = useApproveLeaveRequest(selectedLeave?.id ?? "");
  const rejectMut = useRejectLeaveRequest(selectedLeave?.id ?? "");
  const cancelMut = useCancelLeaveRequest(selectedLeave?.id ?? "");

  const anyBusy = approveMut.isPending || rejectMut.isPending || cancelMut.isPending;

  const filtered = useMemo(() => {
    const allLeave = leaveQuery.data?.data ?? [];
    let list = allLeave;
    if (statusFilter !== "all") list = list.filter((l) => l.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((l) => l.leave_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) => (l.employee_name ?? "").toLowerCase().includes(q) || l.start_date.includes(q),
      );
    }
    return list;
  }, [leaveQuery.data?.data, statusFilter, typeFilter, search]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  async function handleApprove() {
    if (!selectedLeave) return;
    setActionError(null);
    const result = await approveMut.mutateAsync();
    if (result.error) {
      setActionError(result.error.message ?? "Approve failed.");
      return;
    }
    setSelectedLeave(null);
  }

  async function handleReject() {
    if (!selectedLeave) return;
    setRejectError(null);
    if (!rejectReason.trim()) {
      setRejectError("A rejection reason is required.");
      return;
    }
    const result = await rejectMut.mutateAsync({ rejection_reason: rejectReason });
    if (result.error) {
      setRejectError(result.error.message ?? "Reject failed.");
      return;
    }
    setSelectedLeave(null);
    setRejectReason("");
  }

  async function handleCancel() {
    if (!selectedLeave) return;
    setActionError(null);
    const result = await cancelMut.mutateAsync();
    if (result.error) {
      setActionError(result.error.message ?? "Cancel failed.");
      return;
    }
    setSelectedLeave(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        subtitle="Request and manage employee leave with conflict detection."
        actions={
          canRequest ? (
            <Button onClick={() => setRequestOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Request Leave
            </Button>
          ) : undefined
        }
      />

      {isMock && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 text-sm">
            Demo mode — changes are temporary.
          </AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as typeof activeTab);
          setPage(0);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All Requests</TabsTrigger>
          {canApprove && <TabsTrigger value="pending">Pending Approval</TabsTrigger>}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee or date…"
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
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {leaveQuery.isError && (
                <div className="flex flex-col items-center gap-2 py-16">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">Failed to load leave requests.</p>
                  <Button variant="outline" size="sm" onClick={() => leaveQuery.refetch()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              )}

              {!leaveQuery.isError && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Conflicts</TableHead>
                      <TableHead>Approver</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveQuery.isLoading && [1, 2, 3].map((i) => <LeaveRowSkeleton key={i} />)}

                    {!leaveQuery.isLoading && paginated.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-16 text-center text-muted-foreground">
                          No leave requests found.
                        </TableCell>
                      </TableRow>
                    )}

                    {paginated.map((lr: LeaveRequestView) => (
                      <TableRow key={lr.id}>
                        <TableCell className="font-medium">{lr.employee_name}</TableCell>
                        <TableCell className="text-sm">
                          {LEAVE_TYPE_LABELS[lr.leave_type] ?? lr.leave_type}
                        </TableCell>
                        <TableCell className="text-sm text-nowrap">
                          {new Date(lr.start_date + "T00:00:00").toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                          {" – "}
                          {new Date(lr.end_date + "T00:00:00").toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="text-sm">{lr.total_days}d</TableCell>
                        <TableCell>{statusBadge(lr.status)}</TableCell>
                        <TableCell>
                          {lr.conflicts && lr.conflicts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {lr.conflicts.map((c) => conflictBadge(c))}
                            </div>
                          ) : (
                            <Badge className="bg-green-50 text-green-700 text-xs">
                              No Conflict
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lr.approved_by_name ?? lr.rejected_by_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLeave(lr);
                              setRejectReason("");
                              setRejectError(null);
                              setActionError(null);
                            }}
                          >
                            View
                          </Button>
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

      {/* Request modal */}
      <LeaveRequestModal
        open={requestOpen}
        onOpenChange={setRequestOpen}
        onSuccess={() => leaveQuery.refetch()}
      />

      {/* Detail / action dialog */}
      <Dialog open={!!selectedLeave} onOpenChange={(v) => !v && setSelectedLeave(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Leave Request</DialogTitle>
            <DialogDescription>
              {selectedLeave?.employee_name} —{" "}
              {selectedLeave?.leave_type
                ? (LEAVE_TYPE_LABELS[selectedLeave.leave_type] ?? selectedLeave.leave_type)
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedLeave && (
            <div className="space-y-4">
              {actionError && (
                <Alert variant="destructive">
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Dates</p>
                  <p className="font-medium">
                    {new Date(selectedLeave.start_date + "T00:00:00").toLocaleDateString()} –{" "}
                    {new Date(selectedLeave.end_date + "T00:00:00").toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Working Days</p>
                  <p className="font-medium">{selectedLeave.total_days}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  {statusBadge(selectedLeave.status)}
                </div>
                {selectedLeave.reason && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Reason</p>
                    <p>{selectedLeave.reason}</p>
                  </div>
                )}
                {selectedLeave.rejection_reason && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Rejection reason</p>
                    <p className="text-destructive">{selectedLeave.rejection_reason}</p>
                  </div>
                )}
              </div>

              {/* Conflict badges */}
              {selectedLeave.conflicts && selectedLeave.conflicts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedLeave.conflicts.map((c) => conflictBadge(c))}
                </div>
              )}

              {/* Reject reason input */}
              {canApprove && selectedLeave.status === "pending" && (
                <div className="space-y-1.5">
                  <Label htmlFor="leave-reject-reason">Rejection reason (required to reject)</Label>
                  <Textarea
                    id="leave-reject-reason"
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Optional: required only if rejecting"
                  />
                  {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
                </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                {/* Cancel own pending */}
                {selectedLeave.status === "pending" && !canApprove && (
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive/50 hover:bg-destructive/10"
                    onClick={handleCancel}
                    disabled={anyBusy}
                  >
                    {cancelMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Cancel Request
                  </Button>
                )}

                {/* Approve */}
                {canApprove && selectedLeave.status === "pending" && (
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleApprove}
                    disabled={anyBusy}
                  >
                    {approveMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    <CheckCircle className="mr-1.5 h-4 w-4" />
                    Approve
                  </Button>
                )}

                {/* Reject */}
                {canApprove && selectedLeave.status === "pending" && (
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10"
                    onClick={handleReject}
                    disabled={anyBusy}
                  >
                    {rejectMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Reject
                  </Button>
                )}

                <Button variant="outline" onClick={() => setSelectedLeave(null)} disabled={anyBusy}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
