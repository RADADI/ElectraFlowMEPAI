import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { projects, costBreakdown, revenueTrend, milestoneTimeline, statusColor, riskColor, formatMoney } from "@/lib/dummy-data";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { FolderKanban, Activity, AlertTriangle, CheckCircle2, Flag, Wallet, Receipt, PiggyBank, DollarSign, Clock, TrendingUp, ArrowDownRight, Users, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/pm")({
  head: () => ({ meta: [{ title: "PM Dashboard — MEPFlow AI" }] }),
  component: PMDashboard,
});

function PMDashboard() {
  return (
    <>
      <PageHeader title="Project Management Dashboard" subtitle="Live cost, schedule and risk view across your portfolio." />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        <StatCard label="Total Projects" value={24} icon={FolderKanban} />
        <StatCard label="Active" value={8} icon={Activity} intent="info" />
        <StatCard label="Delayed" value={2} icon={AlertTriangle} intent="warning" />
        <StatCard label="Completed" value={14} icon={CheckCircle2} intent="success" />
        <StatCard label="Milestones (30d)" value={11} icon={Flag} />
        <StatCard label="Budget Used" value="$18.4M" icon={Wallet} intent="info" />
        <StatCard label="Actual Cost" value="$15.9M" icon={Receipt} intent="warning" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        <StatCard label="Remaining" value="$2.5M" icon={PiggyBank} intent="success" />
        <StatCard label="Revenue" value="$28.4M" icon={DollarSign} intent="success" />
        <StatCard label="Outstanding" value="$4.1M" icon={Clock} intent="warning" />
        <StatCard label="Profit Margin" value="24.6%" icon={TrendingUp} intent="success" />
        <StatCard label="Cash Flow" value="$6.4M" icon={ArrowDownRight} intent="info" />
        <StatCard label="Utilization" value="81%" icon={Users} intent="info" />
        <StatCard label="Risk" value="Medium" icon={ShieldAlert} intent="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Monthly Revenue</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend}>
                <defs><linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-chart-1)" fill="url(#rev2)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Cost Breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={costBreakdown} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                  {costBreakdown.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Project Progress</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projects.map(p => ({ name: p.number, progress: p.progress }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="progress" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Milestone Timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {milestoneTimeline.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-md border">
                <div className="h-9 w-9 rounded-md bg-primary/10 text-primary grid place-items-center text-xs font-semibold">{m.date.split(" ")[1]}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{m.name}</div><div className="text-xs text-muted-foreground truncate">{m.project}</div></div>
                <Badge variant="outline">{m.date}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Portfolio Overview</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["Project","Client","Contract","Budget","Actual","Margin","Status","Risk","Next Deadline"].map(h => <th key={h} className="py-2.5 px-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {projects.map(p => {
                const margin = Math.round(((p.contract - p.actualCost) / p.contract) * 100);
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-medium">{p.name}</td>
                    <td className="py-2.5 px-3">{p.client}</td>
                    <td className="py-2.5 px-3">{formatMoney(p.contract)}</td>
                    <td className="py-2.5 px-3">{formatMoney(p.budget)}</td>
                    <td className="py-2.5 px-3">{formatMoney(p.actualCost)}</td>
                    <td className="py-2.5 px-3 font-medium">{margin}%</td>
                    <td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[p.status]}>{p.status}</Badge></td>
                    <td className="py-2.5 px-3"><Badge variant="outline" className={riskColor[p.risk]}>{p.risk}</Badge></td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{p.next}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
