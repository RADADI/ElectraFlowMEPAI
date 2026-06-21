import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { employees, statusColor, workloadByMonth } from "@/lib/dummy-data";
import { Users, UserCheck, AlertTriangle, UserPlus } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({ meta: [{ title: "Resource Allocation — ElectraFlow AI" }] }),
  component: Resources,
});

const months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const heatmap = employees.map((e) => ({
  name: e.name,
  vals: months.map((_, i) => Math.min(100, e.util + (i - 2) * 5 + (e.id.charCodeAt(1) % 7))),
}));

function cellColor(v: number) {
  if (v >= 95) return "bg-destructive text-destructive-foreground";
  if (v >= 80) return "bg-warning text-warning-foreground";
  if (v >= 60) return "bg-info text-info-foreground";
  return "bg-success text-success-foreground";
}

function Resources() {
  return (
    <>
      <PageHeader
        title="Resource Allocation"
        subtitle="Engineer utilization, availability and hiring recommendations."
        actions={
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Hire request
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Engineers" value={employees.length} icon={Users} />
        <StatCard
          label="Available"
          value={employees.filter((e) => e.status === "Available").length}
          icon={UserCheck}
          intent="success"
        />
        <StatCard
          label="Overallocated"
          value={employees.filter((e) => e.status === "Overallocated").length}
          icon={AlertTriangle}
          intent="destructive"
        />
        <StatCard
          label="Avg Utilization"
          value={`${Math.round(employees.reduce((a, e) => a + e.util, 0) / employees.length)}%`}
          icon={Users}
          intent="info"
        />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Employee Utilization Heatmap (next 6 months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left p-2">Engineer</th>
                  {months.map((m) => (
                    <th key={m} className="p-2 text-center">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row) => (
                  <tr key={row.name} className="border-t">
                    <td className="p-2 font-medium whitespace-nowrap">{row.name}</td>
                    {row.vals.map((v, j) => (
                      <td key={j} className="p-1">
                        <div className={`rounded ${cellColor(v)} text-center py-1.5 font-medium`}>
                          {v}%
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-success" /> &lt;60%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-info" /> 60–80%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-warning" /> 80–95%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> ≥95% Overallocated
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Engineer Allocation Table</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {[
                  "Employee",
                  "Role",
                  "Current Project",
                  "Next Project",
                  "Available",
                  "Assigned",
                  "Utilization",
                  "Status",
                ].map((h) => (
                  <TableHead key={h} className="px-3 font-medium whitespace-nowrap">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="px-3 font-medium">{e.name}</TableCell>
                  <TableCell className="px-3">{e.role}</TableCell>
                  <TableCell className="px-3">{e.current}</TableCell>
                  <TableCell className="px-3">{e.next}</TableCell>
                  <TableCell className="px-3">{e.available} h/wk</TableCell>
                  <TableCell className="px-3">{e.assigned} h/wk</TableCell>
                  <TableCell className="px-3 w-44">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${e.util}%` }}
                        />
                      </div>
                      <span className="text-xs">{e.util}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3">
                    <Badge variant="outline" className={statusColor[e.status]}>
                      {e.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Capacity Forecast</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadByMonth}>
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
                <Bar
                  dataKey="required"
                  fill="var(--color-chart-5)"
                  name="Required"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="available"
                  fill="var(--color-chart-1)"
                  name="Available"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hiring Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="p-3 rounded-md border bg-destructive/5 border-destructive/30">
              <b>+2 Senior Electrical Engineers</b>
              <div className="text-xs text-muted-foreground mt-1">
                Required by Sep — Riyadh Metro & Aramco peak.
              </div>
            </div>
            <div className="p-3 rounded-md border bg-warning/5 border-warning/30">
              <b>+1 HVAC Engineer</b>
              <div className="text-xs text-muted-foreground mt-1">
                Cover Dubai Mall recovery plan.
              </div>
            </div>
            <div className="p-3 rounded-md border bg-info/5 border-info/30">
              <b>+1 QA/QC Engineer</b>
              <div className="text-xs text-muted-foreground mt-1">For Q4 commissioning surge.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
