import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  FolderKanban, Activity, AlertTriangle, FileCheck2, CalendarClock,
  DollarSign, TrendingUp, Users, ShieldAlert,
} from "lucide-react";
import {
  stats, revenueTrend, projectStatus, workloadByMonth, upcomingSubmissions,
  formatMoney, projects, statusColor, riskColor,
} from "@/lib/dummy-data";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — MEPFlow AI" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <>
      <PageHeader title="Main Dashboard" subtitle="Company-wide operational snapshot, refreshed live." />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Projects" value={stats.totalProjects} hint="Across all clients" icon={FolderKanban} />
        <StatCard label="Active" value={stats.activeProjects} trend="+2 this month" icon={Activity} intent="info" />
        <StatCard label="Delayed" value={stats.delayedProjects} hint="Need attention" icon={AlertTriangle} intent="warning" />
        <StatCard label="Pending Submittals" value={stats.pendingSubmittals} icon={FileCheck2} intent="info" />
        <StatCard label="Upcoming Deadlines" value={stats.upcomingDeadlines} hint="Next 14 days" icon={CalendarClock} />
        <StatCard label="Revenue (YTD)" value={`$${stats.revenue}M`} trend="+18% YoY" icon={DollarSign} intent="success" />
        <StatCard label="Profit Margin" value={`${stats.profitMargin}%`} trend="+1.4 pp" icon={TrendingUp} intent="success" />
        <StatCard label="Utilization" value={`${stats.utilization}%`} hint="Engineering team" icon={Users} intent="info" />
        <StatCard label="Risk Level" value={stats.riskLevel} hint="3 high-risk items" icon={ShieldAlert} intent="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Revenue & Profit Trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-chart-1)" fill="url(#rev)" name="Revenue ($M)" />
                <Area type="monotone" dataKey="profit" stroke="var(--color-chart-2)" fill="url(#prof)" name="Profit ($M)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Project Status</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={projectStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {projectStatus.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Workload Utilization</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workloadByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="required" stroke="var(--color-chart-5)" strokeWidth={2} name="Required Engineers" />
                <Line type="monotone" dataKey="available" stroke="var(--color-chart-1)" strokeWidth={2} name="Available Engineers" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming Submissions</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={upcomingSubmissions}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active Projects</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">PM</th>
                  <th className="py-2 pr-4 font-medium">Progress</th>
                  <th className="py-2 pr-4 font-medium">Budget</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 6).map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 pr-4"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.number}</div></td>
                    <td className="py-2 pr-4">{p.client}</td>
                    <td className="py-2 pr-4">{p.pm}</td>
                    <td className="py-2 pr-4 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${p.progress}%` }} /></div>
                        <span className="text-xs w-9 text-right">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4">{formatMoney(p.budget)}</td>
                    <td className="py-2 pr-4"><Badge variant="outline" className={statusColor[p.status]}>{p.status}</Badge></td>
                    <td className="py-2 pr-4"><Badge variant="outline" className={riskColor[p.risk]}>{p.risk}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
