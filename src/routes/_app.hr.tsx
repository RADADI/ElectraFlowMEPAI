import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { employees } from "@/lib/dummy-data";
import { Users, GraduationCap, BadgeCheck, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_app/hr")({
  head: () => ({ meta: [{ title: "HR Dashboard — ElectraFlow AI" }] }),
  component: HR,
});

const skills = [
  "AutoCAD",
  "Revit",
  "ETAP",
  "SKM",
  "Bluebeam",
  "Power BI",
  "Python",
  "AI Tools",
] as const;

function Dot({ level }: { level: number }) {
  const color =
    level >= 4 ? "bg-success" : level >= 3 ? "bg-info" : level >= 2 ? "bg-warning" : "bg-muted";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i <= level ? color : "bg-border"}`} />
      ))}
    </div>
  );
}

function HR() {
  return (
    <>
      <PageHeader
        title="HR Dashboard"
        subtitle="Employees, skills, certifications, training and attendance."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Employees" value={148} icon={Users} />
        <StatCard label="Certifications" value={62} icon={BadgeCheck} intent="success" />
        <StatCard label="Trainings (YTD)" value={34} icon={GraduationCap} intent="info" />
        <StatCard label="Avg Attendance" value="96%" icon={CalendarDays} intent="success" />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Skills Matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3 font-medium">Engineer</TableHead>
                <TableHead className="px-3 font-medium">Role</TableHead>
                {skills.map((s) => (
                  <TableHead key={s} className="px-3 font-medium text-center">
                    {s}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="px-3 font-medium whitespace-nowrap">{e.name}</TableCell>
                  <TableCell className="px-3 text-xs text-muted-foreground">{e.role}</TableCell>
                  {skills.map((s) => (
                    <TableCell key={s} className="px-3">
                      <div className="flex justify-center">
                        <Dot level={(e.skills as Record<string, number>)[s] ?? 0} />
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Trainings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { t: "Revit MEP Advanced", who: "8 engineers", date: "Jun 18" },
              { t: "NFPA 13 Sprinkler Design", who: "5 engineers", date: "Jun 10" },
              { t: "Power BI for PMs", who: "12 staff", date: "May 28" },
            ].map((x, i) => (
              <div key={i} className="flex justify-between p-2 rounded-md border">
                <span>
                  {x.t}
                  <div className="text-xs text-muted-foreground">{x.who}</div>
                </span>
                <Badge variant="outline">{x.date}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave / Time-off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { n: "Maria Lopez", d: "Jul 5 – Jul 12", t: "Annual" },
              { n: "John Doe", d: "Jul 14 – Jul 16", t: "Personal" },
              { n: "Khalid Otaibi", d: "Aug 1 – Aug 10", t: "Annual" },
            ].map((x, i) => (
              <div key={i} className="p-2 rounded-md border flex items-center justify-between">
                <span>
                  {x.n} <span className="text-xs text-muted-foreground">· {x.d}</span>
                </span>
                <Badge variant="outline">{x.t}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Highlights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { n: "Sara Khan", s: "Top reviewer this quarter — 142 items" },
              { n: "John Doe", s: "Completed 3 major design packages on time" },
              { n: "Priya Shah", s: "Mentored 4 junior engineers" },
            ].map((x, i) => (
              <div key={i} className="p-2 rounded-md border">
                <div className="font-medium">{x.n}</div>
                <div className="text-xs text-muted-foreground">{x.s}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
