import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientPortalShell } from "@/components/client-portal/ClientPortalShell";
import { ClientAccessDeniedState } from "@/components/client-portal/ClientEmptyState";
import { useClientInvoice } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/invoices/$id")({
  head: () => ({ meta: [{ title: "Invoice Detail — Client Portal" }] }),
  component: ClientInvoiceDetailPage,
});

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function ClientInvoiceDetailPage() {
  const { id } = Route.useParams();
  const { data: inv, isLoading, isError, refetch } = useClientInvoice(id);

  return (
    <ClientPortalShell
      title={inv?.invoice_number ?? "Invoice Detail"}
      subtitle={inv?.title}
      error={isError}
      onRetry={() => refetch()}
    >
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !inv ? (
        <ClientAccessDeniedState />
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="outline">{inv.status}</Badge>
            {inv.is_overdue && <Badge variant="destructive">Overdue</Badge>}
            {inv.project_name && <Badge variant="secondary">{inv.project_name}</Badge>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="font-semibold">{formatMoney(inv.total_amount)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="font-semibold">{formatMoney(inv.paid_amount)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Outstanding</div>
              <div className="font-semibold">{formatMoney(inv.outstanding_amount)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Due date</div>
              <div className="font-semibold">{new Date(inv.due_date).toLocaleDateString()}</div>
            </div>
          </div>

          <Button variant="outline" disabled title="Online payment not configured">
            Pay online — not configured yet
          </Button>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Description", "Qty", "Unit", "Amount"].map((h) => (
                      <TableHead key={h} className="px-3">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="px-3">{it.description}</TableCell>
                      <TableCell className="px-3">{it.quantity}</TableCell>
                      <TableCell className="px-3">{formatMoney(it.unit_price)}</TableCell>
                      <TableCell className="px-3 font-medium">{formatMoney(it.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {inv.payments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {inv.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm border rounded-md p-3">
                    <span>
                      {new Date(p.payment_date).toLocaleDateString()} — {p.method}
                      {p.reference_number ? ` (${p.reference_number})` : ""}
                    </span>
                    <span className="font-medium">{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </ClientPortalShell>
  );
}
