/**
 * Load calculation detail — Phase 15B
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EmptyState } from "@/components/shared/EmptyState";
import { ElectricalStatusBadge } from "@/components/electrical/ElectricalStatusBadge";
import { LoadCalculationFormModal } from "@/components/electrical/LoadCalculationFormModal";
import {
  useLoadCalculation,
  useUpdateLoadCalculation,
  useSubmitLoadCalculation,
  useApproveLoadCalculation,
  useRejectLoadCalculation,
} from "@/hooks/api/useElectrical";
import { ELECTRICAL_CONFIG } from "@/lib/electrical-calculations";
import type { LoadCalculationUpdateInput } from "@/types/electrical-view";
import { ArrowLeft, AlertTriangle, Pencil, Send, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/electrical/load-calculations/$id")({
  component: LoadCalculationDetailPage,
});

function LoadCalculationDetailPage() {
  const { id } = Route.useParams();
  const lcQuery = useLoadCalculation(id);
  const updateMut = useUpdateLoadCalculation(id);
  const submitMut = useSubmitLoadCalculation(id);
  const approveMut = useApproveLoadCalculation(id);
  const rejectMut = useRejectLoadCalculation(id);

  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const lc = lcQuery.data?.data;

  if (lcQuery.isLoading) return <Skeleton className="h-64 w-full" />;

  if (lcQuery.isError || !lc) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Calculation not found"
        action={
          <Button variant="outline" asChild>
            <Link to="/electrical/load-calculations">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
        }
      />
    );
  }

  const demandVa = lc.demand_load_va ?? lc.preview_demand_load_va;
  const currentA = lc.calculated_current_a ?? lc.preview_current_a;

  async function runAction(
    fn: () => Promise<{ error?: { message: string; code?: string } | null }>,
    success: string,
  ) {
    const res = await fn();
    if (res.error) {
      if (res.error.code === "SELF_APPROVAL_BLOCKED")
        toast.error("You cannot approve your own submission.");
      else toast.error(res.error.message);
    } else toast.success(success);
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/electrical/load-calculations">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Link>
      </Button>

      <PageHeader
        title={lc.calculation_name}
        subtitle={`${lc.project_name ?? "Project"} · ${lc.calculation_type.replace(/_/g, " ")}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {lc.can_edit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
            {lc.can_submit && (
              <Button
                size="sm"
                onClick={() => runAction(() => submitMut.mutateAsync(), "Submitted")}
              >
                <Send className="h-4 w-4 mr-1" />
                Submit
              </Button>
            )}
            {lc.can_approve && (
              <Button
                size="sm"
                onClick={() => runAction(() => approveMut.mutateAsync(), "Approved")}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            )}
            {lc.can_reject && (
              <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <ElectricalStatusBadge status={lc.status} />
        {lc.is_read_only && <Badge variant="secondary">Read-only</Badge>}
        {lc.is_stale_panel_snapshot && <Badge variant="destructive">Stale panel snapshot</Badge>}
      </div>

      <Alert className="mb-4">
        <AlertDescription>{ELECTRICAL_CONFIG.calculationDisclaimer}</AlertDescription>
      </Alert>

      {lc.status === "rejected" && lc.rejection_reason && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Rejected: {lc.rejection_reason}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inputs</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>Connected load: {lc.total_connected_load_va.toLocaleString()} VA</div>
            <div>Demand factor: {(lc.demand_factor * 100).toFixed(0)}%</div>
            <div>
              Voltage: {lc.voltage}V · {lc.phase}
            </div>
            {lc.source_panel_name && (
              <div>
                Source panel: {lc.source_panel_name}
                {lc.source_panel_revision != null && ` (rev ${lc.source_panel_revision})`}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="text-lg font-semibold">
              Demand: {demandVa.toLocaleString(undefined, { maximumFractionDigits: 1 })} VA
            </div>
            <div className="text-lg font-semibold">
              Current: {currentA != null ? `${currentA.toFixed(2)} A` : "—"}
            </div>
            {lc.status !== "approved" && (
              <p className="text-xs text-muted-foreground">Preview only until approved.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <LoadCalculationFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        loadCalc={lc}
        onSubmit={async (input) => {
          const res = await updateMut.mutateAsync(input as LoadCalculationUpdateInput);
          if (res.error) toast.error(res.error.message);
          else {
            toast.success("Updated");
            setEditOpen(false);
          }
        }}
        isPending={updateMut.isPending}
      />

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject calculation?</AlertDialogTitle>
            <AlertDialogDescription>Reason required.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>Reason</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!rejectReason.trim()}
              onClick={() =>
                runAction(() => rejectMut.mutateAsync(rejectReason.trim()), "Rejected").then(() =>
                  setRejectOpen(false),
                )
              }
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
