import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientRFITable } from "@/components/client-portal/ClientRFITable";
import { useClientRFIs } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/rfi")({
  head: () => ({ meta: [{ title: "RFI — Client Portal" }] }),
  component: ClientRFIPage,
});

function ClientRFIPage() {
  const [search, setSearch] = useState("");
  const query = useClientRFIs({ search: search || undefined });
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="RFIs"
      subtitle="Read-only view of RFIs shared with your organisation."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search RFIs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <ClientRFITable items={items} loading={query.isLoading} />
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
