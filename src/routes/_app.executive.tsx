import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExecutiveDashboardGrid } from "@/components/analytics/ExecutiveDashboardGrid";
import { SystemHealthCards } from "@/components/analytics/SystemHealthCards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { useExecutiveSummary } from "@/hooks/api/useAnalytics";
import { projects, formatMoney } from "@/lib/dummy-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/executive")({
  head: () => ({ meta: [{ title: "Executive Dashboard — ElectraFlow AI" }] }),
  component: () => (
    <RoleGuard allowedRoles={["Admin", "Executive"]}>
      <ExecutivePage />
    </RoleGuard>
  ),
});

function ExecutivePage() {
  const { role } = useAuth();
  const { data } = useExecutiveSummary();
  const isAdmin = role === "Admin";

  const topProjects = [...projects].sort((a, b) => b.contract - a.contract).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Live analytics across projects, workforce, financials, and compliance."
      />

      <ExecutiveDashboardGrid />

      {isAdmin && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">System Visibility</CardTitle>
          </CardHeader>
          <CardContent>
            <SystemHealthCards />
          </CardContent>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Top Projects by Contract Value</CardTitle>
        </CardHeader>
        <CardContent>
          {topProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No projects yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Contract</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProjects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.client}</TableCell>
                      <TableCell>{p.status}</TableCell>
                      <TableCell className="text-right">{formatMoney(p.contract)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {data?.isMockData && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Project list from demo data
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
