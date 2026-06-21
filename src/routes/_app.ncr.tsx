import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ncrs, statusColor } from "@/lib/dummy-data";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ncr")({
  head: () => ({ meta: [{ title: "NCR / Issues — MEPFlow AI" }] }),
  component: NCR,
});

function NCR() {
  return (
    <>
      <PageHeader title="NCRs & Issue Tracking" subtitle="Track non-conformance reports and corrective actions." actions={
        <Button onClick={() => toast.success("Create NCR (demo)")}><Plus className="h-4 w-4 mr-2" />New Issue</Button>
      } />
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground"><tr>{["Issue #","Project","Type","Root Cause","Corrective Action","Assigned To","Status","Due"].map(h => <th key={h} className="py-2.5 px-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {ncrs.map(n => (
              <tr key={n.id} className="border-t hover:bg-muted/30">
                <td className="py-2.5 px-3 font-mono text-xs">{n.number}</td>
                <td className="py-2.5 px-3">{n.project}</td>
                <td className="py-2.5 px-3">{n.type}</td>
                <td className="py-2.5 px-3 text-muted-foreground max-w-sm">{n.root}</td>
                <td className="py-2.5 px-3 max-w-sm">{n.action}</td>
                <td className="py-2.5 px-3">{n.assignedTo}</td>
                <td className="py-2.5 px-3"><Badge variant="outline" className={statusColor[n.status]}>{n.status}</Badge></td>
                <td className="py-2.5 px-3 whitespace-nowrap">{n.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </>
  );
}
