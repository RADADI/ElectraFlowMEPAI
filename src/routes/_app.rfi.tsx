import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { rfis, statusColor, projects } from "@/lib/dummy-data";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/rfi")({
  head: () => ({ meta: [{ title: "RFIs — MEPFlow AI" }] }),
  component: RFI,
});

function RFI() {
  return (
    <>
      <PageHeader title="Requests for Information" subtitle="Track RFIs across projects." actions={
        <Dialog>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New RFI</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create RFI</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="col-span-2 space-y-1.5"><Label>Subject</Label><Input placeholder="Brief title…" /></div>
              <div className="space-y-1.5"><Label>Project</Label>
                <Select><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Assigned To</Label><Input placeholder="Consultant / Contractor" /></div>
              <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" /></div>
              <div className="space-y-1.5"><Label>Priority</Label>
                <Select defaultValue="Medium"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low","Medium","High"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Question</Label><Textarea rows={4} placeholder="Describe the request…" /></div>
            </div>
            <DialogFooter><Button onClick={() => toast.success("RFI created")}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["RFI #","Project","Subject","Assigned To","Due","Status","Priority"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rfis.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="py-2.5 px-3 font-mono text-xs">{r.number}</td>
                <td className="py-2.5 px-3">{r.project}</td>
                <td className="py-2.5 px-3 font-medium">{r.subject}</td>
                <td className="py-2.5 px-3">{r.assignedTo}</td>
                <td className="py-2.5 px-3 whitespace-nowrap">{r.due}</td>
                <td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[r.status]}>{r.status}</Badge></td>
                <td className="py-2.5 px-3"><Badge variant="outline">{r.priority}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </>
  );
}
