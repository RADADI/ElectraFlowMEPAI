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
  LineChart,
  Line,
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
  CalendarClock,
  DollarSign,
  TrendingUp,
  Users,
  RefreshCw,
} from "lucide-react";
import { useProjects } from "@/hooks/api/useProjects";
import { ChartSkeleton } from "@/components/shared/TableSkeleton";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — ElectraFlow AI" }] }),
  component: Dashboard,
});

// ── Static demo chart data (no financial service yet) ──────────────────────
// Labelled as demo so users know these are not live figures.
const DEMO_TREND = [
  { m: "Jan", revenue: 3.2, profit: 0.7 },
  { m: "Feb", revenue: 3.8, profit: 0.9 },
  { m: "Mar", revenue: 4.1, profit: 1.0 },
  { m: "Apr", revenue: 4.6, profit: 1.1 },
  { m: "May", revenue: 5.0, profit: 1.3 },
  { m: "Jun", revenue: 5.4, profit: 1.4 },
  { m: "Jul", revenue: 5.7, profit: 1.5 },
  { m: "Aug", revenue: 6.1, profit: 1.6 },
  { m: "Sep", revenue: 6.3, profit: 1.7 },
  { m: "Oct", revenue: 6.8, profit: 1.8 },
  { m: "Nov", revenue: 7.2, profit: 1.9 },
  { m: "Dec", revenue: 7.8, profit: 2.1 },
];

const DEMO_WORKLOAD = [
  { m: "Jan", required: 28, available: 32 },
  { m: "Feb", required: 30, available: 32 },
  { m: "Mar", required: 34, available: 35 },
  { m: "Apr", required: 36, available: 37 },
  { m: "May", required: 38, available: 39 },
  { m: "Jun", required: 41, available: 40 },
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

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Dashboard() {
  const projectsQuery = useProjects();
  const loading = projectsQuery.isLoading;

  // Derived real counts from actual data
  const { projects, stats } = useMemo(() => {
    const ps = projectsQuery.data ?? [];
    const total = ps.length;
    const active = ps.filter((p) => p.status === "active").length;
    const onHold = ps.filter((p) => p.status === "on_hold").length;
    const completed = ps.filter((p) => p.status === "completed").length;
    const planning = ps.filter((p) => p.status === "planning").length;

    // Upcoming: end_date within next 14 days
    const now = Date.now();
    const in14 = now + 14 * 24 * 60 * 60 * 1000;
    const upcoming = ps.filter((p) => {
      if (!p.end_date) return false;
      const d = new Date(p.end_date).getTime();
      return d >= now && d <= in14;
    }).length;

    const pieData = [
      { name: "Active", value: active },
      { name: "Planning", value: planning },
      { name: "On Hold", value: onHold },
      { name: "Completed", value: completed },
    ].filter((s) => s.value > 0);

    return { projects: ps, stats: { total, active, onHold, upcoming, pieData } };
  }, [projectsQuery.data]);

  if (projectsQuery.isError) {
    return (
      <>
        <PageHeader title="Main Dashboard" subtitle="Company-wide operational snapshot." />
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
        title="Main Dashboard"
        subtitle="Company-wide operational snapshot, refreshed live."
      />

      {/* Stat cards — project counts are live; financial stats not configured yet */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Total Projects"
              value={stats.total}
              hint="Across all clients"
              icon={FolderKanban}
            />
            <StatCard label="Active" value={stats.active} icon={Activity} intent="info" />
            <StatCard
              label="On Hold"
              value={stats.onHold}
              hint="Need attention"
              icon={AlertTriangle}
              intent="warning"
            />
            <StatCard
              label="Upcoming Deadlines"
              value={stats.upcoming}
              hint="Next 14 days"
              icon={CalendarClock}
            />
            <StatCard label="Revenue (YTD)" value="—" hint="Not configured yet" icon={DollarSign} />
            <StatCard label="Profit Margin" value="—" hint="Not configured yet" icon={TrendingUp} />
            <StatCard label="Utilisation" value="—" hint="Not configured yet" icon={Users} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        {/* Revenue chart — demo data until financial module is configured */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Revenue & Profit Trend</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">
              Demo data
            </Badge>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <ChartSkeleton className="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={DEMO_TREND}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
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
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-chart-1)"
                    fill="url(#rev)"
                    name="Revenue ($M)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="var(--color-chart-2)"
                    fill="url(#prof)"
                    name="Profit ($M)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Project status donut — real data */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Project Status</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-44 w-44 rounded-full" />
              </div>
            ) : stats.pieData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <FolderKanban className="h-10 w-10 opacity-30" />
                <p className="text-sm">No projects yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {stats.pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* Workload chart — demo data */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Workload Utilisation</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">
              Demo data
            </Badge>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <ChartSkeleton className="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={DEMO_WORKLOAD}>
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
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="required"
                    stroke="var(--color-chart-5)"
                    strokeWidth={2}
                    name="Required Engineers"
                  />
                  <Line
                    type="monotone"
                    dataKey="available"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    name="Available Engineers"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Quick links panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Projects", to: "/projects" as const },
                { label: "Documents", to: "/documents" as const },
                { label: "Submittals", to: "/submittals" as const },
                { label: "RFI", to: "/rfi" as const },
                { label: "Resources", to: "/resources" as const },
                { label: "Timesheets", to: "/timesheets" as const },
                { label: "Leave", to: "/leave" as const },
                { label: "Financials", to: "/financials" as const },
              ].map((item) => (
                <Link key={item.to} to={item.to}>
                  <div className="flex items-center justify-center p-3 rounded-md border hover:bg-muted/50 transition-colors text-sm font-medium text-center cursor-pointer">
                    {item.label}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active projects table — live data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Projects</CardTitle>
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
                  <Skeleton className="h-4 w-16" />
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
                    {["Project", "Client", "PM", "Budget", "Status", "Risk"].map((h) => (
                      <TableHead key={h} className="px-4 font-medium">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.slice(0, 8).map((p) => (
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
                      <TableCell className="px-4">{p.client_name ?? "—"}</TableCell>
                      <TableCell className="px-4">{p.pm_name ?? "—"}</TableCell>
                      <TableCell className="px-4">{formatMoney(p.budget)}</TableCell>
                      <TableCell className="px-4">
                        <Badge variant="outline" className={STATUS_COLORS[p.status] ?? ""}>
                          {p.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4">
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
