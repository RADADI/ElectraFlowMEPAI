/**
 * Electrical hub — Phase 15B
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useElectricalOverviewStats } from "@/hooks/api/useElectrical";
import { AlertTriangle, Cpu, Layers, Wrench, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/electrical")({
  head: () => ({ meta: [{ title: "Electrical — ElectraFlow AI" }] }),
  component: ElectricalHubPage,
});

function ElectricalHubPage() {
  const { data: stats, isLoading, isError, refetch } = useElectricalOverviewStats();

  return (
    <>
      <PageHeader
        title="Electrical Engineering"
        subtitle="Panel schedules, load calculations, and equipment lists."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Failed to load overview"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Panel Schedules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.panel_count ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.approved_panel_count ?? 0} approved · {stats?.open_review_count ?? 0} in
                  review
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Connected Load
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(stats?.total_connected_load_va ?? 0).toLocaleString()} VA
                </div>
                <p className="text-xs text-muted-foreground mt-1">Computed from circuits</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Equipment & Warnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.equipment_count ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.warning_count ?? 0} open warnings
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Panel Schedules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link to="/electrical/panels">View panels</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Load Calculations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/electrical/load-calculations">View calculations</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Equipment Lists
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/electrical/equipment">View equipment</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
