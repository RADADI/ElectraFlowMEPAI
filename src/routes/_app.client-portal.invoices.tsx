import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientInvoiceTable } from "@/components/client-portal/ClientInvoiceTable";
import { useClientInvoices } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Client Portal" }] }),
  component: ClientInvoicesPage,
});

function ClientInvoicesPage() {
  const [search, setSearch] = useState("");
  const query = useClientInvoices({ search: search || undefined });
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="Invoices"
      subtitle="Sent, paid, and overdue invoices for your projects."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search invoices…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <ClientInvoiceTable items={items} loading={query.isLoading} />
      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      )}
    </ClientPortalShell>
  );
}
