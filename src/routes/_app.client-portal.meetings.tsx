import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClientPortalShell, flattenPages } from "@/components/client-portal/ClientPortalShell";
import { ClientMeetingTable } from "@/components/client-portal/ClientMeetingTable";
import { useClientMeetings } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/meetings")({
  head: () => ({ meta: [{ title: "Meetings — Client Portal" }] }),
  component: ClientMeetingsPage,
});

function ClientMeetingsPage() {
  const query = useClientMeetings();
  const items = flattenPages(query.data?.pages);

  return (
    <ClientPortalShell
      title="Meetings"
      subtitle="Client-visible meetings you are invited to — read-only."
      error={query.isError}
      onRetry={() => query.refetch()}
    >
      <ClientMeetingTable items={items} loading={query.isLoading} />
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
