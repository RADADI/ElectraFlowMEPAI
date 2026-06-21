import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { documents, statusColor } from "@/lib/dummy-data";
import { Download, Check, X, RefreshCw, FileText, FileImage, FileArchive, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/client")({
  head: () => ({ meta: [{ title: "Client Portal — MEPFlow AI" }] }),
  component: Client,
});

const typeIcon = (t: string) => t === "ZIP" ? FileArchive : t === "XLSX" ? FileSpreadsheet : ["JPG","PNG"].includes(t) ? FileImage : FileText;

function Client() {
  return (
    <>
      <PageHeader title="Client Portal" subtitle="Royal Commission — Riyadh Metro Phase 3" actions={<Badge variant="outline">Client view</Badge>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Documents shared with you</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["File","Discipline","Version","Submitted","Status","Actions"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {documents.slice(0, 6).map(d => {
                  const Icon = typeIcon(d.type);
                  return (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="py-2.5 px-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><span className="font-medium">{d.name}</span></div></td>
                      <td className="py-2.5 px-3">{d.discipline}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">{d.version}</td>
                      <td className="py-2.5 px-3">{d.date}</td>
                      <td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[d.status]}>{d.status}</Badge></td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => toast.success("Approved")}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => toast.warning("Revision requested")}><RefreshCw className="h-3.5 w-3.5 mr-1" />Revise</Button>
                          <Button size="sm" variant="outline" onClick={() => toast.error("Rejected")}><X className="h-3.5 w-3.5 mr-1" />Reject</Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toast.success("Downloaded")}><Download className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Comments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { who: "Eng. Faisal (Client)", when: "2d ago", msg: "Please expedite the LV cable submittal." },
              { who: "MEPFlow PM", when: "1d ago", msg: "Acknowledged — re-submission targeted by Friday." },
            ].map((c,i) => <div key={i} className="border rounded-md p-3"><div className="text-sm font-medium">{c.who}</div><div className="text-xs text-muted-foreground mb-1">{c.when}</div><p className="text-sm">{c.msg}</p></div>)}
            <Textarea placeholder="Add a comment…" />
            <Button className="w-full" onClick={() => toast.success("Comment posted")}>Post comment</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
