import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientSubmittalTable } from "@/components/client-portal/ClientSubmittalTable";
import { useClientSubmittals } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/submittals")({
  head: () => ({ meta: [{ title: "Submittals — Client Portal" }] }),
  component: ClientSubmittalsPage,
});

function ClientSubmittalsPage() {
  const [search, setSearch] = useState("");
  const query = useClientSubmittals({ search: search || undefined });
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="Submittals"
      subtitle="Approved submittal outcomes — read-only."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search submittals…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <ClientSubmittalTable items={items} loading={query.isLoading} />
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
