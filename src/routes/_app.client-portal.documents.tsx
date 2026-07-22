import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientDocumentTable } from "@/components/client-portal/ClientDocumentTable";
import { useClientDocuments } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/documents")({
  head: () => ({ meta: [{ title: "Documents — Client Portal" }] }),
  component: ClientDocumentsPage,
});

function ClientDocumentsPage() {
  const [search, setSearch] = useState("");
  const query = useClientDocuments({ search: search || undefined });
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="Shared Documents"
      subtitle="Approved documents shared with your account."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <ClientDocumentTable items={items} loading={query.isLoading} />
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
