import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { revenueTrend, projects, formatMoney } from "@/lib/dummy-data";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Briefcase,
  Layers,
  Activity,
  ShieldAlert,
  Users,
  ArrowRightLeft,
} from "lucide-react";

export const Route = createFileRoute("/_app/executive")({
  head: () => ({ meta: [{ title: "Executive Dashboard — ElectraFlow AI" }] }),
  component: () => (
    <RoleGuard allowedRoles={["Admin", "Executive"]}>
      <Exec />
    </RoleGuard>
  ),
});

function Exec() {
  return (
    <>
      <PageHeader title="Executive Dashboard" subtitle="Board-level view across the company." />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        <StatCard
          label="Total Revenue (YTD)"
          value="$28.4M"
          trend="+18% YoY"
          icon={DollarSign}
          intent="success"
        />
        <StatCard label="Profit" value="$7.0M" trend="+22%" icon={TrendingUp} intent="success" />
        <StatCard label="Backlog" value="$32M" icon={Layers} intent="info" />
        <StatCard label="Pipeline Revenue" value="$22M" hint="7 proposals" icon={Briefcase} />
        <StatCard label="Active Projects" value={8} icon={Activity} intent="info" />
        <StatCard label="Risk Projects" value={3} icon={ShieldAlert} intent="warning" />
        <StatCard label="Cash Flow" value="$6.4M" icon={ArrowRightLeft} intent="success" />
        <StatCard label="Utilization" value="81%" icon={Users} intent="info" />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">12-Month Revenue & Profit Forecast</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueTrend}>
              <defs>
                <linearGradient id="exr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.55} />
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
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-chart-1)"
                fill="url(#exr)"
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="var(--color-chart-2)"
                fill="url(#exp)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Clients by Revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(
              projects.reduce<Record<string, number>>((a, p) => {
                a[p.client] = (a[p.client] ?? 0) + p.contract;
                return a;
              }, {}),
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([c, v], i) => (
                <div key={c} className="flex items-center gap-3">
                  <span className="text-xs w-5 text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1 font-medium">{c}</span>
                  <div className="w-44 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(v / 12_000_000) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm w-20 text-right">{formatMoney(v)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Strategic KPIs</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {[
              { l: "On-time delivery", v: "92%" },
              { l: "Client satisfaction", v: "4.6 / 5" },
              { l: "Repeat business", v: "68%" },
              { l: "Avg margin", v: "24.6%" },
              { l: "Win rate", v: "41%" },
              { l: "Employee retention", v: "94%" },
            ].map((k) => (
              <div key={k.l} className="p-3 rounded-md border">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="text-xl font-semibold mt-1">{k.v}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
