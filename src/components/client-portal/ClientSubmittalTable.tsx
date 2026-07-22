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
import type { ClientSubmittalView } from "@/types/client-portal-view";

export function ClientSubmittalTable({
  items,
  loading,
}: {
  items: ClientSubmittalView[];
  loading?: boolean;
}) {
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
        title="No approved submittals"
        description="Approved submittals shared with your organisation will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Number", "Title", "Project", "Outcome", "Approved"].map((h) => (
              <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="px-3 font-mono text-sm">{s.submittal_number}</TableCell>
              <TableCell className="px-3 font-medium">{s.title}</TableCell>
              <TableCell className="px-3 text-sm">{s.project_name ?? "—"}</TableCell>
              <TableCell className="px-3">
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {s.outcome_label}
                </Badge>
              </TableCell>
              <TableCell className="px-3 text-sm whitespace-nowrap">
                {s.approved_at ? new Date(s.approved_at).toLocaleDateString() : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
