import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientDownloadCenter } from "@/components/client-portal/ClientDownloadCenter";
import { useClientDownloads } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/downloads")({
  head: () => ({ meta: [{ title: "Downloads — Client Portal" }] }),
  component: ClientDownloadsPage,
});

function ClientDownloadsPage() {
  const query = useClientDownloads();
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="Download Center"
      subtitle="Shared files available for download. All downloads are logged."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <ClientDownloadCenter items={items} loading={query.isLoading} />
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
