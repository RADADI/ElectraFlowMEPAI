import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submittals, DISCIPLINES, ACTION_CODES, statusColor } from "@/lib/dummy-data";
import {
  Upload, FileCheck2, CheckCircle2, AlertTriangle, RefreshCw, XCircle,
  Archive, Layers, Printer, FileText, ZoomIn, ZoomOut, ChevronLeft,
  ChevronRight, MessageSquarePlus, Highlighter, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/submittals")({
  head: () => ({ meta: [{ title: "Submittal Reviewer — MEPFlow AI" }] }),
  component: SubmittalsPage,
});

function SubmittalsPage() {
  const [disciplines, setDisciplines] = useState<string[]>(["Division 26 - Electrical"]);
  const [discOpen, setDiscOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [items, setItems] = useState(submittals);

  const counts = {
    total: items.length,
    none: items.filter(i => i.status === "No Exception").length,
    nc: items.filter(i => i.status === "Need Corrections").length,
    res: items.filter(i => i.status === "Resubmittal Required").length,
    rej: items.filter(i => i.status === "Rejected").length,
    rec: items.filter(i => i.status === "For Record Only").length,
  };

  return (
    <>
      <PageHeader
        title="Submittal Reviewer"
        subtitle="AI-assisted comparison of contractor submittals against specifications."
        actions={
          <>
            <Button variant="outline" onClick={() => setCompareOpen(true)}><Layers className="h-4 w-4 mr-2" />Side-by-side</Button>
            <Button onClick={() => setPrintOpen(true)}><Printer className="h-4 w-4 mr-2" />Print Report</Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-4 mb-4">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader><CardTitle className="text-base">Project Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label>Project Name</Label><Input defaultValue="Riyadh Metro Phase 3 - Substation" /></div>
            <div className="space-y-1.5"><Label>Project Location</Label><Input defaultValue="Riyadh, KSA" /></div>
            <div className="space-y-1.5"><Label>Contractor</Label><Input defaultValue="ALEC Engineering" /></div>
            <div className="space-y-1.5"><Label>Submittal Number</Label><Input defaultValue="SUB-2025-0148" /></div>
            <div className="space-y-1.5"><Label>Reviewed By</Label><Input defaultValue="Ahmed Hassan, PE" /></div>
            <div className="space-y-1.5"><Label>Submission Date</Label><Input type="date" defaultValue="2025-06-20" /></div>
            <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" defaultValue="2025-06-30" /></div>
            <div className="space-y-1.5 col-span-2">
              <Label>Disciplines</Label>
              <Dialog open={discOpen} onOpenChange={setDiscOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {disciplines.length} selected
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Select Disciplines</DialogTitle><DialogDescription>Choose the divisions the AI should review against.</DialogDescription></DialogHeader>
                  <div className="space-y-2 py-2">
                    {DISCIPLINES.map(d => {
                      const on = disciplines.includes(d);
                      return (
                        <label key={d} className="flex items-center gap-3 p-2 rounded-md border hover:bg-muted cursor-pointer">
                          <Checkbox checked={on} onCheckedChange={() => setDisciplines(p => on ? p.filter(x => x !== d) : [...p, d])} />
                          <span className="text-sm">{d}</span>
                        </label>
                      );
                    })}
                  </div>
                  <DialogFooter><Button onClick={() => setDiscOpen(false)}>Confirm</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <div className="flex flex-wrap gap-1.5 mt-1">{disciplines.map(d => <Badge key={d} variant="outline">{d}</Badge>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader><CardTitle className="text-base">Upload Files</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {[
              { label: "Specification", req: true },
              { label: "Submittal", req: true },
              { label: "Drawings", req: false },
              { label: "Custom Instructions", req: false },
            ].map(f => (
              <div key={f.label} className="border-2 border-dashed rounded-md p-4 text-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                <div className="text-sm font-medium mt-2">{f.label} {f.req && <span className="text-destructive">*</span>}</div>
                <div className="text-xs text-muted-foreground">PDF, DOCX</div>
              </div>
            ))}
            <Button className="col-span-2" onClick={() => toast.success("AI review started…")}>
              <Sparkles className="h-4 w-4 mr-2" />Run AI Review
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <StatCard label="Total Items" value={counts.total} icon={FileCheck2} />
        <StatCard label="No Exceptions" value={counts.none} icon={CheckCircle2} intent="success" />
        <StatCard label="Need Corrections" value={counts.nc} icon={AlertTriangle} intent="warning" />
        <StatCard label="Resubmittal Req." value={counts.res} icon={RefreshCw} intent="warning" />
        <StatCard label="Rejected" value={counts.rej} icon={XCircle} intent="destructive" />
        <StatCard label="For Record Only" value={counts.rec} icon={Archive} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Submittal Review Items</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Search…" className="h-9 w-56" />
            <Button variant="outline" size="sm">Export Excel</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground"><tr>
              {["Section","Paragraph","Mark","Product","Notes","Status","Action","Assigned To","Due Date",""].map(h => <th key={h} className="py-2.5 px-3 font-medium whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map((s, idx) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="py-2 px-3 font-mono text-xs">{s.section}</td>
                  <td className="py-2 px-3 font-mono text-xs">{s.paragraph}</td>
                  <td className="py-2 px-3">{s.mark}</td>
                  <td className="py-2 px-3 font-medium">{s.product}</td>
                  <td className="py-2 px-3 text-muted-foreground max-w-sm truncate">{s.notes}</td>
                  <td className="py-2 px-3"><Badge variant="outline" className={statusColor[s.status]}>{s.status}</Badge></td>
                  <td className="py-2 px-3 w-44">
                    <Select value={s.action} onValueChange={v => setItems(prev => prev.map((x, i) => i === idx ? { ...x, action: v } : x))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ACTION_CODES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 px-3">{s.assignedTo}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{s.due}</td>
                  <td className="py-2 px-3"><Button size="sm" variant="ghost" onClick={() => setCompareOpen(true)}>Compare</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Side-by-side comparison */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="!max-w-7xl !w-[95vw] h-[88vh] p-0 flex flex-col">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center justify-between">
              <span>Document Comparison · LV-CBL-01</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline"><ZoomOut className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline"><ZoomIn className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline"><Highlighter className="h-4 w-4 mr-1" />Highlight</Button>
                <Button size="sm" variant="outline"><MessageSquarePlus className="h-4 w-4 mr-1" />Note</Button>
                <Select defaultValue="REV,RNR"><SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTION_CODES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 flex-1 overflow-hidden">
            {[
              { title: "Design Documents (Specification)", subtitle: "Section 26 05 19 — Page 3 of 12", color: "bg-info/5" },
              { title: "Contractor Submittal", subtitle: "ALEC — Submittal 0148 — Page 1 of 8", color: "bg-success/5" },
            ].map((p, i) => (
              <div key={i} className="border-r last:border-0 flex flex-col">
                <div className={`px-4 py-2 border-b ${p.color}`}>
                  <div className="text-sm font-semibold">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.subtitle}</div>
                </div>
                <div className="flex-1 p-6 overflow-auto bg-muted/20">
                  <div className="mx-auto max-w-md aspect-[3/4] bg-card border rounded shadow-sm p-6 text-xs leading-relaxed">
                    <FileText className="h-5 w-5 text-muted-foreground mb-3" />
                    <h3 className="font-semibold text-sm mb-2">{i === 0 ? "2.1 Power Cables" : "Cable Datasheet — XLPE 4C×95mm²"}</h3>
                    <p className="text-muted-foreground">A. Conductors shall be copper, Class 2 stranded per IEC 60228.</p>
                    <p className={`mt-2 ${i === 1 ? "bg-warning/30 px-1" : "text-muted-foreground"}`}>B. Insulation: XLPE rated 600/1000V, operating temp 90°C.</p>
                    <p className="mt-2 text-muted-foreground">C. Sheath: PVC, flame retardant per IEC 60332-3.</p>
                    <p className={`mt-2 ${i === 0 ? "bg-success/30 px-1" : "text-muted-foreground"}`}>D. Short-circuit rating ≥ 13.5 kA for 1 second.</p>
                    <p className="mt-2 text-muted-foreground">E. Color coding per project standard.</p>
                  </div>
                </div>
                <div className="border-t p-2 flex items-center justify-center gap-2 text-xs">
                  <Button size="icon" variant="ghost" className="h-7 w-7"><ChevronLeft className="h-4 w-4" /></Button>
                  <span>Page 1 / {i === 0 ? 12 : 8}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Report Modal */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Print Submittal Review Report</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Review Action (overall)</Label>
              <Select defaultValue="REV,RNR"><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTION_CODES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {["Include project details","Include comments","Include action codes","Include reviewer name & date","Include signature section"].map(o =>
                <label key={o} className="flex items-center gap-2"><Checkbox defaultChecked /><span className="text-sm">{o}</span></label>
              )}
            </div>
            <div><Label>Additional notes</Label><Textarea placeholder="Optional cover letter…" /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => toast.success("DOCX exported")}>Export DOCX</Button>
            <Button onClick={() => toast.success("PDF exported")}>Export PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
