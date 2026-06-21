import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { projects, submittals, documents, employees, formatMoney, statusColor, riskColor } from "@/lib/dummy-data";
import { ArrowLeft, CheckCircle2, Clock, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/projects/$id")({
  head: () => ({ meta: [{ title: "Project Details — MEPFlow AI" }] }),
  component: ProjectDetails,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-sm font-medium mt-0.5">{value}</div></div>;
}

function ProjectDetails() {
  const { id } = useParams({ from: "/_app/projects/$id" });
  const p = projects.find(x => x.id === id) ?? projects[0];

  return (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Link to="/projects" className="hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" />Projects</Link>
        <span>/</span><span className="font-mono">{p.number}</span>
      </div>
      <PageHeader
        title={p.name}
        subtitle={`${p.client} · ${p.location}`}
        actions={
          <>
            <Badge variant="outline" className={statusColor[p.status]}>{p.status}</Badge>
            <Badge variant="outline" className={riskColor[p.risk]}>Risk: {p.risk}</Badge>
            <Button variant="outline">Edit</Button>
            <Button>Generate Report</Button>
          </>
        }
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto">
          {["overview","team","schedule","documents","submittals","financials","tasks","feedback","ai"].map(t => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === "ai" ? "AI Notes" : t === "feedback" ? "Client Feedback" : t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Project Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              <Field label="Project Name" value={p.name} />
              <Field label="Project Number" value={<span className="font-mono">{p.number}</span>} />
              <Field label="Location" value={p.location} />
              <Field label="Client" value={p.client} />
              <Field label="Contractor" value={p.contractor} />
              <Field label="Consultant" value={p.consultant} />
              <Field label="Project Manager" value={p.pm} />
              <Field label="Assigned Engineers" value={p.engineers.join(", ")} />
              <Field label="Start Date" value={p.start} />
              <Field label="End Date" value={p.due} />
              <Field label="Contract Value" value={formatMoney(p.contract)} />
              <Field label="Budget" value={formatMoney(p.budget)} />
              <Field label="Status" value={<Badge variant="outline" className={statusColor[p.status]}>{p.status}</Badge>} />
              <Field label="Priority" value={p.priority} />
              <Field label="Discipline" value={p.discipline} />
              <Field label="Progress" value={`${p.progress}%`} />
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle className="text-base">Overall Progress</CardTitle></CardHeader>
            <CardContent><Progress value={p.progress} className="h-2" /><div className="text-xs text-muted-foreground mt-2">{p.progress}% complete · Next milestone: {p.next}</div></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["Engineer","Role","Utilization","Status"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{employees.slice(0,5).map(e => <tr key={e.id} className="border-t"><td className="py-2.5 px-3 font-medium">{e.name}</td><td className="py-2.5 px-3">{e.role}</td><td className="py-2.5 px-3 w-48"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-muted"><div className="h-full bg-primary rounded-full" style={{ width: `${e.util}%` }} /></div><span className="text-xs">{e.util}%</span></div></td><td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[e.status]}>{e.status}</Badge></td></tr>)}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card><CardHeader><CardTitle className="text-base">Milestone Timeline</CardTitle></CardHeader>
            <CardContent><div className="space-y-3">
              {[
                { name: "Design Development", date: "2024-09-30", done: true },
                { name: "30% Submittals", date: "2025-02-15", done: true },
                { name: "60% Submittals", date: "2025-06-10", done: true },
                { name: "90% Submittals", date: "2025-09-20", done: false },
                { name: "Commissioning", date: "2026-01-15", done: false },
                { name: "Final Handover", date: "2026-03-30", done: false },
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  {m.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                  <div className="flex-1"><div className="font-medium text-sm">{m.name}</div><div className="text-xs text-muted-foreground">{m.date}</div></div>
                  {m.done && <Badge variant="outline" className={statusColor["Approved"]}>Done</Badge>}
                </div>
              ))}
            </div></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["File","Discipline","Version","Uploaded By","Status"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{documents.slice(0,5).map(d => <tr key={d.id} className="border-t"><td className="py-2.5 px-3 font-medium">{d.name}</td><td className="py-2.5 px-3">{d.discipline}</td><td className="py-2.5 px-3 font-mono text-xs">{d.version}</td><td className="py-2.5 px-3">{d.uploader}</td><td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[d.status]}>{d.status}</Badge></td></tr>)}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="submittals">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["Section","Mark","Product","Status","Assigned"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{submittals.slice(0,6).map(s => <tr key={s.id} className="border-t"><td className="py-2.5 px-3 font-mono text-xs">{s.section}</td><td className="py-2.5 px-3">{s.mark}</td><td className="py-2.5 px-3">{s.product}</td><td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[s.status]}>{s.status}</Badge></td><td className="py-2.5 px-3">{s.assignedTo}</td></tr>)}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="financials">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { l: "Contract", v: formatMoney(p.contract) },
              { l: "Budget", v: formatMoney(p.budget) },
              { l: "Actual Cost", v: formatMoney(p.actualCost) },
              { l: "Remaining", v: formatMoney(p.budget - p.actualCost) },
            ].map(s => <Card key={s.l}><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{s.l}</div><div className="text-xl font-semibold mt-1">{s.v}</div></CardContent></Card>)}
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <Card><CardContent className="p-4 space-y-2">
            {["Issue RFI on tray-duct clash","Re-review AHU-12 submittal","Update single-line diagram","Coordinate with QA/QC for ground test"].map((t, i) => (
              <label key={i} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"><input type="checkbox" className="h-4 w-4" defaultChecked={i < 2} /><span className={i < 2 ? "line-through text-muted-foreground" : ""}>{t}</span><Badge variant="outline" className="ml-auto">{i < 2 ? "Done" : "Open"}</Badge></label>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="feedback">
          <Card><CardContent className="p-4 space-y-3">
            {[
              { who: "Client — Royal Commission", when: "3 days ago", msg: "Please expedite the LV cable submittal package." },
              { who: "Consultant — Parsons", when: "1 week ago", msg: "Overall progress is satisfactory; address NCR-003 promptly." },
            ].map((c, i) => <div key={i} className="border rounded-md p-3"><div className="text-sm font-medium">{c.who}</div><div className="text-xs text-muted-foreground mb-1">{c.when}</div><p className="text-sm">{c.msg}</p></div>)}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />AI Insights</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-md border bg-info/5 border-info/30 p-3"><b>Risk:</b> Predicted 8% budget overrun by Q4 due to AHU lead time; suggest pre-ordering long-lead items.</div>
              <div className="rounded-md border bg-warning/5 border-warning/30 p-3"><b>Schedule:</b> 2 milestones at risk if submittal turnaround stays above 14 days. Target ≤ 9 days.</div>
              <div className="rounded-md border bg-success/5 border-success/30 p-3"><b>Quality:</b> No critical NCRs in the last 30 days. Maintain weekly QA/QC walks.</div>
            </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
