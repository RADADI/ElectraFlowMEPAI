import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientActivityFeed } from "@/components/client-portal/ClientActivityFeed";
import { useClientActivity } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/activity")({
  head: () => ({ meta: [{ title: "Activity — Client Portal" }] }),
  component: ClientActivityPage,
});

function ClientActivityPage() {
  const query = useClientActivity();
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="Activity"
      subtitle="Updates shared with your organisation."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <ClientActivityFeed items={items} loading={query.isLoading} />
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
