import { Link } from "@tanstack/react-router";
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
import type { ClientRFIView } from "@/types/client-portal-view";

export function ClientRFITable({ items, loading }: { items: ClientRFIView[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ClientEmptyState
        title="No RFIs shared"
        description="RFIs marked visible to your organisation will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Number", "Subject", "Project", "Status", "Due", ""].map((h) => (
              <TableHead key={h || "link"} className="px-3 font-medium whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="px-3 font-mono text-sm">{r.rfi_number}</TableCell>
              <TableCell className="px-3">
                <div className="font-medium">{r.title}</div>
                {r.latest_response_excerpt && (
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {r.latest_response_excerpt}
                  </div>
                )}
              </TableCell>
              <TableCell className="px-3 text-sm">{r.project_name ?? "—"}</TableCell>
              <TableCell className="px-3">
                <Badge variant="outline">{r.status}</Badge>
              </TableCell>
              <TableCell className="px-3 text-sm whitespace-nowrap">
                {r.required_date ? new Date(r.required_date).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell className="px-3 text-right">
                <Link
                  to="/client-portal/rfi/$id"
                  params={{ id: r.id }}
                  className="text-sm text-primary hover:underline"
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
