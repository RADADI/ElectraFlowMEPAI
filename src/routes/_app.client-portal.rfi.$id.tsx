import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientPortalShell } from "@/components/client-portal/ClientPortalShell";
import { ClientAccessDeniedState } from "@/components/client-portal/ClientEmptyState";
import { useClientRFI } from "@/hooks/api/useClientPortal";

export const Route = createFileRoute("/_app/client-portal/rfi/$id")({
  head: () => ({ meta: [{ title: "RFI Detail — Client Portal" }] }),
  component: ClientRFIDetailPage,
});

function ClientRFIDetailPage() {
  const { id } = Route.useParams();
  const { data: rfi, isLoading, isError, refetch } = useClientRFI(id);

  return (
    <ClientPortalShell
      title={rfi?.rfi_number ?? "RFI Detail"}
      subtitle={rfi?.title}
      error={isError}
      onRetry={() => refetch()}
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !rfi ? (
        <ClientAccessDeniedState />
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{rfi.status}</Badge>
            <Badge variant="outline">{rfi.priority} priority</Badge>
            {rfi.project_name && <Badge variant="secondary">{rfi.project_name}</Badge>}
          </div>

          {rfi.question && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Question</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{rfi.question}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Responses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rfi.responses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No responses yet.</p>
              ) : (
                rfi.responses.map((r) => (
                  <div key={r.id} className="border rounded-md p-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{r.respondent_name ?? "Project team"}</span>
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">{r.response_text}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </ClientPortalShell>
  );
}
