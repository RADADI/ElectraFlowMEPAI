/**
 * Equipment list — Phase 15B
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { EquipmentFormModal } from "@/components/electrical/EquipmentFormModal";
import {
  useEquipment,
  useCreateEquipment,
  useUpdateEquipment,
  useArchiveEquipment,
  useRestoreEquipment,
} from "@/hooks/api/useElectrical";
import type { EquipmentFilterInput } from "@/hooks/api/useElectrical";
import type {
  EquipmentView,
  EquipmentCreateInput,
  EquipmentUpdateInput,
} from "@/types/electrical-view";
import type { EquipmentStatus } from "@/types/database";
import { EQUIPMENT_STATUS_LABEL } from "@/types/electrical-view";
import { projects } from "@/lib/dummy-data";
import { useAuth } from "@/contexts/auth-context";
import {
  Plus,
  Search,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Archive,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/electrical/equipment")({
  component: EquipmentListPage,
});

function EquipmentListPage() {
  const { role } = useAuth();
  const canManage =
    role === "Admin" ||
    role === "Project Manager" ||
    role === "Senior Electrical Engineer" ||
    role === "Electrical Engineer";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "all">("all");
  const [projectId, setProjectId] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<EquipmentView | null>(null);

  const filters: EquipmentFilterInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status,
      project_id: projectId === "all" ? undefined : projectId,
      include_archived: includeArchived || undefined,
    }),
    [search, status, projectId, includeArchived],
  );

  const { data, isLoading, isError, refetch } = useEquipment(filters);
  const createMut = useCreateEquipment();
  const updateMut = useUpdateEquipment();
  const archiveMut = useArchiveEquipment();
  const restoreMut = useRestoreEquipment();

  const items = data ?? [];

  async function handleSubmit(input: EquipmentCreateInput | EquipmentUpdateInput) {
    if (editItem) {
      const res = await updateMut.mutateAsync({
        id: editItem.id,
        input: input as EquipmentUpdateInput,
      });
      if (res.error) toast.error(res.error.message);
      else {
        toast.success("Equipment updated");
        setModalOpen(false);
        setEditItem(null);
      }
    } else {
      const res = await createMut.mutateAsync(input as EquipmentCreateInput);
      if (res.error) toast.error(res.error.message);
      else {
        toast.success("Equipment created");
        setModalOpen(false);
      }
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
        title="Equipment Lists"
        subtitle="Project equipment tags and loads."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditItem(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add equipment
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as EquipmentStatus | "all")}>
          <SelectTrigger className="w-full lg:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
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
        <Button
          variant={includeArchived ? "default" : "outline"}
          onClick={() => setIncludeArchived((v) => !v)}
        >
          Show archived
        </Button>
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
        <EmptyState title="No equipment" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Load VA</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((eq) => (
                <TableRow key={eq.id}>
                  <TableCell className="font-medium">{eq.tag}</TableCell>
                  <TableCell>{eq.equipment_type}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                    {eq.project_name ?? "—"}
                  </TableCell>
                  <TableCell>{eq.location ?? "—"}</TableCell>
                  <TableCell>{eq.load_va.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{EQUIPMENT_STATUS_LABEL[eq.status]}</Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditItem(eq);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        {eq.status !== "archived" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              const res = await archiveMut.mutateAsync(eq.id);
                              if (res.error) toast.error(res.error.message);
                              else toast.success("Archived");
                            }}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              const res = await restoreMut.mutateAsync(eq.id);
                              if (res.error) toast.error(res.error.message);
                              else toast.success("Restored");
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EquipmentFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        equipment={editItem}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending}
      />
    </>
  );
}
