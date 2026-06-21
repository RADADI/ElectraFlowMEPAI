import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { workloadByMonth } from "@/lib/dummy-data";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/workload")({
  head: () => ({ meta: [{ title: "Workload Projection — MEPFlow AI" }] }),
  component: Workload,
});

const data = workloadByMonth.map(d => ({ ...d, util: Math.round((d.required / d.available) * 100) }));

function Workload() {
  return (
    <>
      <PageHeader title="Workload Projection" subtitle="Forecast resource demand vs availability for the next 10 months." />

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Required vs Available Engineers</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis yAxisId="left" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Legend />
              <Bar yAxisId="left" dataKey="required" fill="var(--color-chart-5)" name="Required" radius={[4,4,0,0]} />
              <Bar yAxisId="left" dataKey="available" fill="var(--color-chart-1)" name="Available" radius={[4,4,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="util" stroke="var(--color-chart-3)" strokeWidth={2} name="Utilization %" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Project Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { n: "Backlog", v: "$32M", t: "12 awarded" },
              { n: "Awarded (next 90d)", v: "$8.4M", t: "3 projects" },
              { n: "Pipeline (proposals)", v: "$22M", t: "7 projects" },
            ].map(x => <div key={x.n} className="flex items-center justify-between p-3 rounded-md border"><span className="font-medium">{x.n}</span><div className="text-right"><div className="font-semibold">{x.v}</div><div className="text-xs text-muted-foreground">{x.t}</div></div></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" />Overload Warnings</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.filter(d => d.util > 100).map(d => <div key={d.m} className="p-3 rounded-md border bg-destructive/5 border-destructive/30 flex items-center justify-between"><span><b>{d.m}</b> — capacity exceeded</span><Badge variant="outline" className="text-destructive border-destructive/40">{d.util}%</Badge></div>)}
            <div className="text-xs text-muted-foreground">Months over 100% utilization need hiring or reallocation.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Hiring Suggestions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              "Hire 2 Senior Electrical Engineers by August",
              "Add 1 HVAC Engineer for Dubai Mall recovery",
              "Contract 1 QA/QC inspector for Q4 commissioning",
              "Plan 1 BIM Coordinator for NEOM ramp-up",
            ].map((t, i) => <div key={i} className="p-3 rounded-md border">{t}</div>)}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
