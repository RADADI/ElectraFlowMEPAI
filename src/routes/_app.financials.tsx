import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { revenueTrend, cashFlow, stats } from "@/lib/dummy-data";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, Receipt, Banknote, ClockAlert, ShieldCheck, Users, Briefcase, Plane, Hammer, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_app/financials")({
  head: () => ({ meta: [{ title: "Financials — MEPFlow AI" }] }),
  component: Financials,
});

const horizons = ["3 months", "6 months", "12 months", "24 months"];

function Financials() {
  const [h, setH] = useState("12 months");
  return (
    <>
      <PageHeader title="Financial Dashboard" subtitle="Revenue, billing, cost and forecast for the company." actions={
        <Button variant="outline">Export to Excel</Button>
      } />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
        <StatCard label="Total Revenue" value={`$${stats.revenue}M`} icon={DollarSign} intent="success" trend="+18%" />
        <StatCard label="Billed" value={`$${stats.billed}M`} icon={Receipt} intent="info" />
        <StatCard label="Collected" value={`$${stats.collected}M`} icon={Banknote} intent="success" />
        <StatCard label="Outstanding" value={`$${stats.outstanding}M`} icon={ClockAlert} intent="warning" />
        <StatCard label="Retention" value={`$${stats.retention}M`} icon={ShieldCheck} />
        <StatCard label="Cash Flow" value={`$${stats.cash}M`} icon={ArrowRightLeft} intent="info" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard label="Labor Cost" value="$11.2M" icon={Users} />
        <StatCard label="Software" value="$0.9M" icon={Briefcase} />
        <StatCard label="Travel" value="$0.6M" icon={Plane} />
        <StatCard label="Subcontractors" value="$5.4M" icon={Hammer} />
        <StatCard label="Profit" value="$7.0M" icon={TrendingUp} intent="success" />
        <StatCard label="Loss" value="$0.3M" icon={TrendingDown} intent="destructive" />
      </div>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Forecast Horizon</CardTitle>
          <div className="flex gap-1 p-1 bg-muted rounded-md">
            {horizons.map(x => (
              <button key={x} onClick={() => setH(x)} className={`px-3 py-1 text-xs rounded ${h === x ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}>{x}</button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueTrend}>
              <defs>
                <linearGradient id="rfc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient>
                <linearGradient id="pfc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="revenue" stroke="var(--color-chart-1)" fill="url(#rfc)" name="Revenue Forecast" />
              <Area type="monotone" dataKey="profit" stroke="var(--color-chart-2)" fill="url(#pfc)" name="Profit Forecast" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Expense Forecast</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueTrend.map(r => ({ m: r.m, expense: +(r.revenue - r.profit).toFixed(2) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="expense" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Cash Flow Forecast</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="inflow" stroke="var(--color-chart-2)" strokeWidth={2} name="Inflow" />
                <Line type="monotone" dataKey="outflow" stroke="var(--color-chart-5)" strokeWidth={2} name="Outflow" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
