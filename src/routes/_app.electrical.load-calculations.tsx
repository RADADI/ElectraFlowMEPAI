/**
 * Load calculations list — Phase 15B
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ElectricalStatusBadge } from "@/components/electrical/ElectricalStatusBadge";
import { LoadCalculationFormModal } from "@/components/electrical/LoadCalculationFormModal";
import { useLoadCalculations, useCreateLoadCalculation } from "@/hooks/api/useElectrical";
import type { LoadCalculationFilterInput } from "@/hooks/api/useElectrical";
import type {
  LoadCalculationCreateInput,
  LoadCalculationUpdateInput,
} from "@/types/electrical-view";
import type { ElectricalWorkflowStatus } from "@/types/database";
import { ELECTRICAL_CONFIG } from "@/lib/electrical-calculations";
import { projects } from "@/lib/dummy-data";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, AlertTriangle, RefreshCw, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/electrical/load-calculations")({
  component: LoadCalculationsListPage,
});

function LoadCalculationsListPage() {
  const { role } = useAuth();
  const canCreate =
    role === "Admin" ||
    role === "Project Manager" ||
    role === "Senior Electrical Engineer" ||
    role === "Electrical Engineer";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ElectricalWorkflowStatus | "all">("all");
  const [projectId, setProjectId] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filters: LoadCalculationFilterInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status,
      project_id: projectId === "all" ? undefined : projectId,
    }),
    [search, status, projectId],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLoadCalculations(filters);
  const createMut = useCreateLoadCalculation();

  const items = useMemo(() => data?.pages.flatMap((p) => p.data?.items ?? []) ?? [], [data]);

  async function handleCreate(input: LoadCalculationCreateInput | LoadCalculationUpdateInput) {
    const res = await createMut.mutateAsync(input as LoadCalculationCreateInput);
    if (res.error) toast.error(res.error.message);
    else {
      toast.success("Load calculation created");
      setCreateOpen(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/electrical">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Electrical
        </Link>
      </Button>
      <PageHeader
        title="Load Calculations"
        subtitle={ELECTRICAL_CONFIG.calculationDisclaimer}
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New calculation
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ElectricalWorkflowStatus | "all")}
        >
          <SelectTrigger className="w-full lg:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full lg:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No load calculations" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Connected VA</TableHead>
                  <TableHead>Demand VA</TableHead>
                  <TableHead>Current A</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lc) => (
                  <TableRow key={lc.id}>
                    <TableCell>
                      <Link
                        to="/electrical/load-calculations/$id"
                        params={{ id: lc.id }}
                        className="font-medium hover:underline"
                      >
                        {lc.calculation_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {lc.calculation_type.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <ElectricalStatusBadge status={lc.status} />
                    </TableCell>
                    <TableCell>{lc.total_connected_load_va.toLocaleString()}</TableCell>
                    <TableCell>
                      {(lc.demand_load_va ?? lc.preview_demand_load_va).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                    <TableCell>
                      {(lc.calculated_current_a ?? lc.preview_current_a != null)
                        ? (lc.calculated_current_a ?? lc.preview_current_a)!.toFixed(2)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {hasNextPage && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <LoadCalculationFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isPending={createMut.isPending}
      />
    </>
  );
}
