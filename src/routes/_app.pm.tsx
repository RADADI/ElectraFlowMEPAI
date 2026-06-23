import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  FolderKanban,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  TrendingUp,
  Users,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { useProjects } from "@/hooks/api/useProjects";

export const Route = createFileRoute("/_app/pm")({
  head: () => ({ meta: [{ title: "PM Dashboard — ElectraFlow AI" }] }),
  component: PMDashboard,
});

// ── Static demo chart data (no financial service yet) ──────────────────────
const DEMO_REVENUE = [
  { m: "Jan", revenue: 3.2 },
  { m: "Feb", revenue: 3.8 },
  { m: "Mar", revenue: 4.1 },
  { m: "Apr", revenue: 4.6 },
  { m: "May", revenue: 5.0 },
  { m: "Jun", revenue: 5.4 },
  { m: "Jul", revenue: 5.7 },
  { m: "Aug", revenue: 6.1 },
  { m: "Sep", revenue: 6.3 },
  { m: "Oct", revenue: 6.8 },
  { m: "Nov", revenue: 7.2 },
  { m: "Dec", revenue: 7.8 },
];

const DEMO_COST_BREAKDOWN = [
  { name: "Labour", value: 11.2, color: "var(--color-chart-1)" },
  { name: "Subcontractors", value: 5.4, color: "var(--color-chart-2)" },
  { name: "Software", value: 0.9, color: "var(--color-chart-3)" },
  { name: "Travel", value: 0.6, color: "var(--color-chart-4)" },
];

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  on_hold: "bg-yellow-50 text-yellow-700",
  completed: "bg-slate-50 text-slate-700",
  cancelled: "bg-red-50 text-red-700",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-50 text-green-700",
  medium: "bg-yellow-50 text-yellow-700",
  high: "bg-red-50 text-red-700",
};

function formatMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}

function PMDashboard() {
  const projectsQuery = useProjects();
  const loading = projectsQuery.isLoading;

  const { projects, stats, progressData } = useMemo(() => {
    const ps = projectsQuery.data ?? [];
    const total = ps.length;
    const active = ps.filter((p) => p.status === "active").length;
    const onHold = ps.filter((p) => p.status === "on_hold").length;
    const completed = ps.filter((p) => p.status === "completed").length;
    const pd = ps.slice(0, 10).map((p) => ({
      name: p.project_number,
      progress: p.progress_percent ?? 0,
    }));
    return {
      projects: ps,
      stats: { total, active, onHold, completed },
      progressData: pd,
    };
  }, [projectsQuery.data]);

  if (projectsQuery.isError) {
    return (
      <>
        <PageHeader
          title="Project Management Dashboard"
          subtitle="Live cost, schedule and risk view across your portfolio."
        />
        <Alert variant="destructive" className="max-w-lg mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load project data. Check your connection and try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => projectsQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Project Management Dashboard"
        subtitle="Live cost, schedule and risk view across your portfolio."
      />

      {/* Stat cards — project counts are live; financial KPIs not configured yet */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Projects" value={stats.total} icon={FolderKanban} />
            <StatCard label="Active" value={stats.active} icon={Activity} intent="info" />
            <StatCard label="On Hold" value={stats.onHold} icon={AlertTriangle} intent="warning" />
            <StatCard
              label="Completed"
              value={stats.completed}
              icon={CheckCircle2}
              intent="success"
            />
            <StatCard label="Budget Used" value="—" hint="Not configured yet" icon={Wallet} />
            <StatCard label="Profit Margin" value="—" hint="Not configured yet" icon={TrendingUp} />
            <StatCard label="Risk" value="—" hint="Not configured yet" icon={ShieldAlert} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        {!loading && (
          <>
            <StatCard
              label="Revenue"
              value="—"
              hint="Not configured yet"
              icon={TrendingUp}
              intent="success"
            />
            <StatCard
              label="Outstanding AR"
              value="—"
              hint="Not configured yet"
              icon={AlertTriangle}
              intent="warning"
            />
            <StatCard
              label="Utilisation"
              value="—"
              hint="Not configured yet"
              icon={Users}
              intent="info"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        {/* Monthly revenue — demo until financial module is configured */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Monthly Revenue</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">
              Demo data
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={DEMO_REVENUE}>
                <defs>
                  <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-chart-1)"
                  fill="url(#rev2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cost breakdown — demo */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Cost Breakdown</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">
              Demo data
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={DEMO_COST_BREAKDOWN}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {DEMO_COST_BREAKDOWN.map((c, i) => (
                    <Cell key={i} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Project progress bar chart — live data */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Project Progress</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : progressData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No projects to display.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="progress" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Key metrics summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Portfolio Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))
            ) : (
              <>
                <div className="flex items-center justify-between text-sm border-b pb-2">
                  <span className="text-muted-foreground">Total projects</span>
                  <span className="font-semibold">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-b pb-2">
                  <span className="text-muted-foreground">Active</span>
                  <span className="font-semibold text-green-600">{stats.active}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-b pb-2">
                  <span className="text-muted-foreground">On hold</span>
                  <span className="font-semibold text-yellow-600">{stats.onHold}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-semibold text-slate-600">{stats.completed}</span>
                </div>
                <Alert className="mt-4 border-blue-200 bg-blue-50 p-3">
                  <AlertDescription className="text-blue-700 text-xs">
                    Budget, cost and margin data available once the financial module is configured.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Portfolio table — live project data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Portfolio Overview</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <FolderKanban className="h-10 w-10 opacity-30" />
              <p className="text-sm">No projects yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {["Project", "Client", "Budget", "Progress", "Status", "Risk"].map((h) => (
                      <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-3">
                        <Link
                          to="/projects/$id"
                          params={{ id: p.id }}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{p.project_number}</div>
                      </TableCell>
                      <TableCell className="px-3">{p.client_name ?? "—"}</TableCell>
                      <TableCell className="px-3 font-medium">{formatMoney(p.budget)}</TableCell>
                      <TableCell className="px-3 w-40">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${p.progress_percent ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs w-9 text-right">{p.progress_percent ?? 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3">
                        <Badge variant="outline" className={STATUS_COLORS[p.status] ?? ""}>
                          {p.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3">
                        <Badge
                          variant="outline"
                          className={RISK_COLORS[p.risk_level ?? "low"] ?? ""}
                        >
                          {p.risk_level ?? "—"}
                        </Badge>
                      </TableCell>
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
