import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Eye, Pencil, Archive, Search, Filter } from "lucide-react";
import { projects, formatMoney, statusColor, riskColor, DISCIPLINES } from "@/lib/dummy-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({ meta: [{ title: "Projects — MEPFlow AI" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = useMemo(() => projects.filter(p =>
    (status === "all" || p.status === status) &&
    (q === "" || `${p.name} ${p.client} ${p.number} ${p.pm}`.toLowerCase().includes(q.toLowerCase()))
  ), [q, status]);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${filtered.length} of ${projects.length} projects`}
        actions={
          <Dialog>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Create Project</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create new project</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="space-y-1.5 col-span-2"><Label>Project Name</Label><Input placeholder="Acme Tower MEP" /></div>
                <div className="space-y-1.5"><Label>Client</Label><Input placeholder="Acme Corp" /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input placeholder="Riyadh, KSA" /></div>
                <div className="space-y-1.5"><Label>Discipline</Label>
                  <Select><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Project Manager</Label><Input placeholder="Ahmed Hassan" /></div>
                <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" /></div>
                <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" /></div>
                <div className="space-y-1.5 col-span-2"><Label>Budget (USD)</Label><Input type="number" placeholder="0" /></div>
              </div>
              <DialogFooter><Button onClick={() => toast.success("Project created (demo)")}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, client, number, PM…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="On Track">On Track</SelectItem>
              <SelectItem value="Delayed">Delayed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => toast.message("Export started")}>Export CSV</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                {["#", "Project", "Client", "Location", "PM", "Discipline", "Start", "Due", "Progress", "Status", "Budget", "Risk", "Actions"].map(h =>
                  <th key={h} className="py-2.5 px-3 font-medium whitespace-nowrap">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="py-2.5 px-3 font-mono text-xs">{p.number}</td>
                  <td className="py-2.5 px-3 font-medium">{p.name}</td>
                  <td className="py-2.5 px-3">{p.client}</td>
                  <td className="py-2.5 px-3">{p.location}</td>
                  <td className="py-2.5 px-3">{p.pm}</td>
                  <td className="py-2.5 px-3">{p.discipline}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{p.start}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{p.due}</td>
                  <td className="py-2.5 px-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${p.progress}%` }} /></div>
                      <span className="text-xs">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[p.status]}>{p.status}</Badge></td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{formatMoney(p.budget)}</td>
                  <td className="py-2.5 px-3"><Badge variant="outline" className={riskColor[p.risk]}>{p.risk}</Badge></td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1">
                      <Button asChild size="icon" variant="ghost" className="h-7 w-7"><Link to="/projects/$id" params={{ id: p.id }}><Eye className="h-3.5 w-3.5" /></Link></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toast.info("Edit (demo)")}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toast.success("Archived (demo)")}><Archive className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 text-xs text-muted-foreground border-t">
            <div>Showing {filtered.length} rows</div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm">Previous</Button>
              <Button variant="outline" size="sm">Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
