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
import type { ClientInvoiceView } from "@/types/client-portal-view";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export function ClientInvoiceTable({
  items,
  loading,
}: {
  items: ClientInvoiceView[];
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
        title="No invoices"
        description="Sent and paid invoices for your projects will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {["Invoice", "Project", "Total", "Outstanding", "Due", "Status", ""].map((h) => (
              <TableHead key={h || "link"} className="px-3 font-medium whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="px-3">
                <div className="font-mono text-sm">{inv.invoice_number}</div>
                <div className="text-xs text-muted-foreground">{inv.title}</div>
              </TableCell>
              <TableCell className="px-3 text-sm">{inv.project_name ?? "—"}</TableCell>
              <TableCell className="px-3 font-medium">{formatMoney(inv.total_amount)}</TableCell>
              <TableCell className="px-3">{formatMoney(inv.outstanding_amount)}</TableCell>
              <TableCell className="px-3 text-sm whitespace-nowrap">
                {new Date(inv.due_date).toLocaleDateString()}
              </TableCell>
              <TableCell className="px-3">
                <Badge variant="outline" className={inv.is_overdue ? "bg-red-50 text-red-700" : ""}>
                  {inv.status}
                </Badge>
              </TableCell>
              <TableCell className="px-3 text-right">
                <Link
                  to="/client-portal/invoices/$id"
                  params={{ id: inv.id }}
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
