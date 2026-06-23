import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjects } from "@/hooks/api/useProjects";
import {
  DollarSign,
  Receipt,
  Banknote,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  FolderKanban,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/financials")({
  head: () => ({ meta: [{ title: "Financials — ElectraFlow AI" }] }),
  component: Financials,
});

function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  on_hold: "bg-yellow-50 text-yellow-700",
  completed: "bg-slate-50 text-slate-700",
  cancelled: "bg-red-50 text-red-700",
};

function Financials() {
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];

  const loading = projectsQuery.isLoading;
  const hasError = projectsQuery.isError;

  // Derived project-level financial totals (real data)
  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const activeCount = projects.filter((p) => p.status === "active").length;
  const onHoldCount = projects.filter((p) => p.status === "on_hold").length;

  // Loading skeleton
  if (loading) {
    return (
      <>
        <PageHeader title="Financial Dashboard" subtitle="Budget, billing and cost overview." />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </>
    );
  }

  // Error state
  if (hasError) {
    return (
      <>
        <PageHeader title="Financial Dashboard" subtitle="Budget, billing and cost overview." />
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load project data. Check your connection and try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-3" onClick={() => projectsQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Financial Dashboard"
        subtitle="Budget, billing and cost overview."
        actions={
          <Button variant="outline" size="sm" disabled>
            Export — not configured yet
          </Button>
        }
      />

      {/* Stat cards — project budgets are real; billing/AR requires financial module */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Projects"
          value={projects.length}
          hint={`${activeCount} active, ${onHoldCount} on hold`}
          icon={FolderKanban}
        />
        <StatCard
          label="Combined Budget"
          value={formatMoney(totalBudget)}
          hint="Sum of all project budgets"
          icon={DollarSign}
          intent="info"
        />
        <StatCard label="Billed / Invoiced" value="—" hint="Not configured yet" icon={Receipt} />
        <StatCard label="Collected" value="—" hint="Not configured yet" icon={Banknote} />
        <StatCard label="Outstanding AR" value="—" hint="Not configured yet" icon={ShieldCheck} />
        <StatCard label="Profit Margin" value="—" hint="Not configured yet" icon={TrendingUp} />
      </div>

      {/* Forecasting notice */}
      <Alert className="mb-6 border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-700 text-sm">
          Revenue forecasting, cash flow charts, and expense tracking require the financial module
          to be configured. Only project-level budget data is available now.
        </AlertDescription>
      </Alert>

      {/* Project budget table — live from Supabase */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Budgets</CardTitle>
          <CardDescription>
            Live from the Projects module. Budget vs. cost data available once the financial module
            is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <FolderKanban className="h-10 w-10 opacity-30" />
              <p className="text-sm">No projects found.</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/projects">Go to Projects</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {["Project", "Client", "Status", "Budget", "Actual Cost", "Margin"].map((h) => (
                      <TableHead key={h} className="px-4 font-medium whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4">
                        <Link
                          to="/projects/$id"
                          params={{ id: p.id }}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{p.project_number}</div>
                      </TableCell>
                      <TableCell className="px-4 text-sm">{p.client_name ?? "—"}</TableCell>
                      <TableCell className="px-4">
                        <Badge variant="outline" className={STATUS_COLORS[p.status] ?? ""}>
                          {p.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 font-medium">{formatMoney(p.budget)}</TableCell>
                      <TableCell className="px-4 text-muted-foreground text-sm">—</TableCell>
                      <TableCell className="px-4 text-muted-foreground text-sm">—</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
