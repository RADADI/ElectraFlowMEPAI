/**
 * Panel schedule detail — Phase 15B
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import { ElectricalStatusBadge } from "@/components/electrical/ElectricalStatusBadge";
import { ElectricalWarningBadge } from "@/components/electrical/ElectricalWarningBadge";
import { PanelFormModal } from "@/components/electrical/PanelFormModal";
import { CircuitFormModal } from "@/components/electrical/CircuitFormModal";
import { PanelLoadSummary } from "@/components/electrical/PanelLoadSummary";
import {
  usePanel,
  usePanelCircuits,
  usePanelLoadSummary,
  useElectricalTimeline,
  useUpdatePanel,
  useSubmitPanel,
  useApprovePanel,
  useRejectPanel,
  useArchivePanel,
  useRestorePanel,
  useReopenPanel,
  useAddCircuit,
  useUpdateCircuit,
  useRemoveCircuit,
} from "@/hooks/api/useElectrical";
import type { CircuitView, PanelUpdateInput, CircuitCreateInput } from "@/types/electrical-view";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/electrical/panels/$id")({
  component: PanelDetailPage,
});

function PanelDetailPage() {
  const { id } = Route.useParams();
  const panelQuery = usePanel(id);
  const circuitsQuery = usePanelCircuits(id);
  const summaryQuery = usePanelLoadSummary(id);
  const timelineQuery = useElectricalTimeline("panel_schedule", id);

  const updateMut = useUpdatePanel(id);
  const submitMut = useSubmitPanel(id);
  const approveMut = useApprovePanel(id);
  const rejectMut = useRejectPanel(id);
  const archiveMut = useArchivePanel(id);
  const restoreMut = useRestorePanel(id);
  const reopenMut = useReopenPanel(id);
  const addCircuitMut = useAddCircuit(id);
  const updateCircuitMut = useUpdateCircuit(id);
  const removeCircuitMut = useRemoveCircuit(id);

  const [editOpen, setEditOpen] = useState(false);
  const [circuitOpen, setCircuitOpen] = useState(false);
  const [editCircuit, setEditCircuit] = useState<CircuitView | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const panel = panelQuery.data?.data;

  if (panelQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (panelQuery.isError || !panel) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Panel not found"
        action={
          <Button variant="outline" asChild>
            <Link to="/electrical/panels">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to panels
            </Link>
          </Button>
        }
      />
    );
  }

  const circuits = circuitsQuery.data ?? [];
  const summary = summaryQuery.data;
  const timeline = timelineQuery.data ?? [];

  async function handleEdit(input: PanelUpdateInput) {
    const res = await updateMut.mutateAsync(input);
    if (res.error) toast.error(res.error.message);
    else {
      toast.success("Panel updated");
      setEditOpen(false);
    }
  }

  async function runAction(
    fn: () => Promise<{ error?: { message: string; code?: string } | null }>,
    success: string,
  ) {
    const res = await fn();
    if (res.error) {
      if (res.error.code === "SELF_APPROVAL_BLOCKED") {
        toast.error("You cannot approve your own submission.");
      } else toast.error(res.error.message);
    } else toast.success(success);
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/electrical/panels">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to panels
        </Link>
      </Button>

      <PageHeader
        title={panel.panel_name}
        subtitle={`${panel.project_name ?? "Project"} · Rev ${panel.revision_number}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {panel.can_edit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
            {panel.can_submit && (
              <Button
                size="sm"
                onClick={() => runAction(() => submitMut.mutateAsync(), "Submitted for review")}
              >
                <Send className="h-4 w-4 mr-1" />
                Submit
              </Button>
            )}
            {panel.can_approve && (
              <Button
                size="sm"
                onClick={() => runAction(() => approveMut.mutateAsync(), "Panel approved")}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            )}
            {panel.can_reject && (
              <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            )}
            {panel.can_reopen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => runAction(() => reopenMut.mutateAsync(), "Panel reopened")}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reopen
              </Button>
            )}
            {panel.can_archive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => runAction(() => archiveMut.mutateAsync(), "Panel archived")}
              >
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            )}
            {panel.can_restore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => runAction(() => restoreMut.mutateAsync(), "Panel restored")}
              >
                Restore
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <ElectricalStatusBadge status={panel.status} />
        <Badge variant="outline">
          {panel.voltage}V · {panel.phase}
        </Badge>
        {panel.location && <Badge variant="outline">{panel.location}</Badge>}
        {panel.is_read_only && <Badge variant="secondary">Read-only</Badge>}
      </div>

      {panel.status === "rejected" && panel.rejection_reason && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Rejected: {panel.rejection_reason}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="circuits" className="space-y-4">
        <TabsList>
          <TabsTrigger value="circuits">Circuits</TabsTrigger>
          <TabsTrigger value="summary">Load summary</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="circuits" className="space-y-3">
          {panel.can_edit && (
            <Button
              size="sm"
              onClick={() => {
                setEditCircuit(null);
                setCircuitOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add circuit
            </Button>
          )}
          {circuits.length === 0 ? (
            <EmptyState title="No circuits" description="Add circuits to this panel schedule." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Load VA</TableHead>
                    <TableHead>Breaker</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Warnings</TableHead>
                    {panel.can_edit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circuits.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.circuit_number}</TableCell>
                      <TableCell>{c.description ?? "—"}</TableCell>
                      <TableCell>{c.load_va.toLocaleString()}</TableCell>
                      <TableCell>{c.breaker_size ?? "—"}</TableCell>
                      <TableCell>{c.phase ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.warnings.map((w) => (
                            <ElectricalWarningBadge key={w.code} warning={w} />
                          ))}
                        </div>
                      </TableCell>
                      {panel.can_edit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditCircuit(c);
                                setCircuitOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                const res = await removeCircuitMut.mutateAsync(c.id);
                                if (res.error) toast.error(res.error.message);
                                else toast.success("Circuit removed");
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="summary">
          {summary ? <PanelLoadSummary summary={summary} /> : <Skeleton className="h-32" />}
        </TabsContent>

        <TabsContent value="timeline">
          {timeline.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="space-y-2">
              {timeline.map((t) => (
                <li key={t.id} className="p-3 border rounded-md text-sm">
                  <div className="font-medium">{t.title}</div>
                  {t.message && <p className="text-muted-foreground text-xs mt-1">{t.message}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{t.created_at}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <PanelFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        panel={panel}
        onSubmit={handleEdit}
        isPending={updateMut.isPending}
      />

      <CircuitFormModal
        open={circuitOpen}
        onOpenChange={setCircuitOpen}
        circuit={editCircuit}
        isPending={addCircuitMut.isPending || updateCircuitMut.isPending}
        onSubmit={async (input) => {
          if (editCircuit) {
            const res = await updateCircuitMut.mutateAsync({ id: editCircuit.id, input });
            if (res.error) toast.error(res.error.message);
            else {
              toast.success("Circuit updated");
              setCircuitOpen(false);
            }
          } else {
            const res = await addCircuitMut.mutateAsync(input as CircuitCreateInput);
            if (res.error) toast.error(res.error.message);
            else {
              toast.success("Circuit added");
              setCircuitOpen(false);
            }
          }
        }}
      />

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject panel schedule?</AlertDialogTitle>
            <AlertDialogDescription>A rejection reason is required.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!rejectReason.trim()}
              onClick={() =>
                runAction(() => rejectMut.mutateAsync(rejectReason.trim()), "Panel rejected").then(
                  () => setRejectOpen(false),
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
