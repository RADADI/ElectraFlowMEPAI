import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClientAnnouncementBanner } from "@/components/client-portal/ClientAnnouncementBanner";
import { ClientPortalPreviewBanner } from "@/components/client-portal/ClientPortalPreviewBanner";
import { ClientPortalTabs } from "@/components/client-portal/ClientPortalTabs";
import { ClientDashboardCards } from "@/components/client-portal/ClientDashboardCards";
import { ClientDocumentTable } from "@/components/client-portal/ClientDocumentTable";
import { ClientRFITable } from "@/components/client-portal/ClientRFITable";
import { ClientSubmittalTable } from "@/components/client-portal/ClientSubmittalTable";
import { ClientInvoiceTable } from "@/components/client-portal/ClientInvoiceTable";
import { ClientActivityFeed } from "@/components/client-portal/ClientActivityFeed";
import { useClientDashboard } from "@/hooks/api/useClientPortal";
import { useAuth } from "@/contexts/auth-context";
import { AlertTriangle, RefreshCw, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/client-portal")({
  head: () => ({ meta: [{ title: "Client Portal — ElectraFlow AI" }] }),
  component: ClientPortalHub,
});

function ClientPortalHub() {
  const { company } = useAuth();
  const dashboard = useClientDashboard();
  const data = dashboard.data?.data;

  return (
    <RoleGuard allowedRoles={["Admin", "Client"]}>
      <ClientAnnouncementBanner />
      <ClientPortalPreviewBanner />
      <PageHeader
        title="Client Portal"
        subtitle={data?.client_name ?? company ?? "Your project workspace"}
        actions={<Badge variant="outline">Read-only</Badge>}
      />
      <ClientPortalTabs />

      {dashboard.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>Failed to load portal dashboard.</span>
            <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <ClientDashboardCards counts={data?.counts} loading={dashboard.isLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Documents</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/client-portal/documents">
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ClientDocumentTable
              items={data?.recent_documents ?? []}
              loading={dashboard.isLoading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent RFIs</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/client-portal/rfi">
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ClientRFITable items={data?.recent_rfis ?? []} loading={dashboard.isLoading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Submittals</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/client-portal/submittals">
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ClientSubmittalTable
              items={data?.recent_submittals ?? []}
              loading={dashboard.isLoading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Invoices</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/client-portal/invoices">
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ClientInvoiceTable items={data?.recent_invoices ?? []} loading={dashboard.isLoading} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/client-portal/activity">
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ClientActivityFeed
            items={data?.recent_activity ?? []}
            loading={dashboard.isLoading}
            compact
          />
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
