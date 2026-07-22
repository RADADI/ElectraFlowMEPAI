/**
 * Meetings List — Phase 15A
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { MeetingFormModal } from "@/components/meetings/MeetingFormModal";
import { useMeetings, useCreateMeeting } from "@/hooks/api/useMeetings";
import { MEETING_STATUS_LABEL, MEETING_STATUS_CLASS } from "@/types/meeting-view";
import type {
  MeetingFilterInput,
  MeetingCreateInput,
  MeetingUpdateInput,
} from "@/types/meeting-view";
import type { MeetingStatus } from "@/types/database";
import { projects } from "@/lib/dummy-data";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/contexts/auth-context";
import {
  Plus,
  Search,
  Calendar,
  ClipboardList,
  Users,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/meetings")({
  head: () => ({ meta: [{ title: "Meetings — ElectraFlow AI" }] }),
  component: MeetingsPage,
});

function MeetingsPage() {
  const { role } = useAuth();
  const canCreate =
    role === "Admin" || role === "Project Manager" || role === "Senior Electrical Engineer";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MeetingStatus | "all">("all");
  const [projectId, setProjectId] = useState<string>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const filters: MeetingFilterInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status,
      project_id: projectId === "all" ? undefined : projectId,
      mine_only: mineOnly || undefined,
    }),
    [search, status, projectId, mineOnly],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMeetings(filters);

  const createMut = useCreateMeeting();

  const items = useMemo(() => data?.pages.flatMap((p) => p.data?.items ?? []) ?? [], [data]);

  const isMock = data?.pages[0]?.isMockData ?? false;

  async function handleCreate(input: MeetingCreateInput | MeetingUpdateInput) {
    const res = await createMut.mutateAsync(input as MeetingCreateInput);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Meeting created");
    setCreateOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Meetings"
        subtitle="Agendas, minutes, attendees, and action items."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Meeting
            </Button>
          ) : undefined
        }
      />

      {isMock && (
        <p className="text-xs text-muted-foreground mb-3">Demo mode — showing mock meeting data.</p>
      )}

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search meetings…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as MeetingStatus | "all")}>
              <SelectTrigger className="w-full lg:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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
            <Button
              variant={mineOnly ? "default" : "outline"}
              onClick={() => setMineOnly((v) => !v)}
              className="whitespace-nowrap"
            >
              My meetings
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load meetings"
          description="Check your connection and try again."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No meetings scheduled"
          description="Create a meeting to track agendas, minutes, and action items."
          action={
            canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Meeting
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <Users className="h-4 w-4 inline" />
                  </TableHead>
                  <TableHead className="text-center">
                    <ClipboardList className="h-4 w-4 inline" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        to="/meetings/$id"
                        params={{ id: m.id }}
                        className="font-medium hover:underline flex items-center gap-2"
                      >
                        {m.title}
                        {m.has_today_badge && (
                          <Badge variant="secondary" className="text-xs">
                            Today
                          </Badge>
                        )}
                        {m.overdue_actions_count > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {m.overdue_actions_count} overdue
                          </Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[140px] truncate">
                      {m.project_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDateTime(m.scheduled_start)}
                    </TableCell>
                    <TableCell>
                      <Badge className={MEETING_STATUS_CLASS[m.status]}>
                        {MEETING_STATUS_LABEL[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{m.attendee_count}</TableCell>
                    <TableCell className="text-center text-sm">{m.open_actions_count}</TableCell>
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
                {isFetchingNextPage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <MeetingFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isPending={createMut.isPending}
      />
    </>
  );
}
