import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientEmptyState } from "./ClientEmptyState";
import type { ClientMeetingView } from "@/types/client-portal-view";

export function ClientMeetingTable({
  items,
  loading,
}: {
  items: ClientMeetingView[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ClientEmptyState
        title="No meetings scheduled"
        description="Meetings you are invited to will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Meeting", "Project", "When", "Location", "Status"].map((h) => (
              <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="px-3">
                <div className="font-medium">{m.title}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {m.meeting_type.replace(/_/g, " ")}
                </div>
              </TableCell>
              <TableCell className="px-3 text-sm">{m.project_name ?? "—"}</TableCell>
              <TableCell className="px-3 text-sm whitespace-nowrap">
                {m.scheduled_start
                  ? new Date(m.scheduled_start).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </TableCell>
              <TableCell className="px-3 text-sm">
                {m.location ?? (m.video_link ? "Video call" : "—")}
              </TableCell>
              <TableCell className="px-3">
                <Badge variant="outline">{m.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
