import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ncrs, statusColor } from "@/lib/dummy-data";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ncr")({
  head: () => ({ meta: [{ title: "NCR / Issues — ElectraFlow AI" }] }),
  component: NCR,
});

function NCR() {
  return (
    <>
      <PageHeader
        title="NCRs & Issue Tracking"
        subtitle="Track non-conformance reports and corrective actions."
        actions={
          <Button onClick={() => toast.success("Create NCR (demo)")}>
            <Plus className="h-4 w-4 mr-2" />
            New Issue
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {[
                  "Issue #",
                  "Project",
                  "Type",
                  "Root Cause",
                  "Corrective Action",
                  "Assigned To",
                  "Status",
                  "Due",
                ].map((h) => (
                  <TableHead key={h} className="px-3 font-medium">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ncrs.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="px-3 font-mono text-xs">{n.number}</TableCell>
                  <TableCell className="px-3">{n.project}</TableCell>
                  <TableCell className="px-3">{n.type}</TableCell>
                  <TableCell className="px-3 text-muted-foreground max-w-[200px] truncate">
                    {n.root}
                  </TableCell>
                  <TableCell className="px-3 max-w-[200px] truncate">{n.action}</TableCell>
                  <TableCell className="px-3">{n.assignedTo}</TableCell>
                  <TableCell className="px-3">
                    <Badge variant="outline" className={statusColor[n.status]}>
                      {n.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 whitespace-nowrap">{n.due}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
