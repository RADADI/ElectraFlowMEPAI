/**
 * Panel schedules list — Phase 15B
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
import { PanelFormModal } from "@/components/electrical/PanelFormModal";
import { usePanels, useCreatePanel } from "@/hooks/api/useElectrical";
import type { PanelFilterInput, PanelCreateInput, PanelUpdateInput } from "@/types/electrical-view";
import type { ElectricalWorkflowStatus } from "@/types/database";
import { projects } from "@/lib/dummy-data";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Search, AlertTriangle, RefreshCw, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/electrical/panels")({
  component: PanelsListPage,
});

function PanelsListPage() {
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

  const filters: PanelFilterInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status,
      project_id: projectId === "all" ? undefined : projectId,
    }),
    [search, status, projectId],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePanels(filters);
  const createMut = useCreatePanel();

  const items = useMemo(() => data?.pages.flatMap((p) => p.data?.items ?? []) ?? [], [data]);

  async function handleCreate(input: PanelCreateInput | PanelUpdateInput) {
    const res = await createMut.mutateAsync(input as PanelCreateInput);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Panel schedule created");
    setCreateOpen(false);
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
        title="Panel Schedules"
        subtitle="Distribution panels and circuit schedules."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create panel
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search panels…"
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
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full lg:w-[200px]">
            <SelectValue placeholder="Project" />
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
          title="Failed to load panels"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No panel schedules"
          description="Create a panel schedule to get started."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Panel</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Voltage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Circuits</TableHead>
                  <TableHead>Total VA</TableHead>
                  <TableHead>Rev</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/electrical/panels/$id"
                        params={{ id: p.id }}
                        className="font-medium hover:underline"
                      >
                        {p.panel_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                      {p.project_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.voltage}V {p.phase}
                    </TableCell>
                    <TableCell>
                      <ElectricalStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell>{p.circuit_count}</TableCell>
                    <TableCell>{p.total_connected_load_va.toLocaleString()}</TableCell>
                    <TableCell>{p.revision_number}</TableCell>
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

      <PanelFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isPending={createMut.isPending}
      />
    </>
  );
}
