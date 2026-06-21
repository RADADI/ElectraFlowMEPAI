import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { documents, statusColor } from "@/lib/dummy-data";
import {
  Download,
  Check,
  X,
  RefreshCw,
  FileText,
  FileImage,
  FileArchive,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/client")({
  head: () => ({ meta: [{ title: "Client Portal — ElectraFlow AI" }] }),
  component: Client,
});

const typeIcon = (t: string) =>
  t === "ZIP"
    ? FileArchive
    : t === "XLSX"
      ? FileSpreadsheet
      : ["JPG", "PNG"].includes(t)
        ? FileImage
        : FileText;

function Client() {
  return (
    <>
      <PageHeader
        title="Client Portal"
        subtitle="Royal Commission — Riyadh Metro Phase 3"
        actions={<Badge variant="outline">Client view</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Documents shared with you</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {["File", "Discipline", "Version", "Submitted", "Status", "Actions"].map((h) => (
                    <TableHead key={h} className="px-3 font-medium">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.slice(0, 6).map((d) => {
                  const Icon = typeIcon(d.type);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="px-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium">{d.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3">{d.discipline}</TableCell>
                      <TableCell className="px-3 font-mono text-xs">{d.version}</TableCell>
                      <TableCell className="px-3">{d.date}</TableCell>
                      <TableCell className="px-3">
                        <Badge variant="outline" className={statusColor[d.status]}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toast.success("Approved")}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toast.warning("Revision requested")}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Revise
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toast.error("Rejected")}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => toast.success("Downloaded")}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                who: "Eng. Faisal (Client)",
                when: "2d ago",
                msg: "Please expedite the LV cable submittal.",
              },
              {
                who: "ElectraFlow PM",
                when: "1d ago",
                msg: "Acknowledged — re-submission targeted by Friday.",
              },
            ].map((c, i) => (
              <div key={i} className="border rounded-md p-3">
                <div className="text-sm font-medium">{c.who}</div>
                <div className="text-xs text-muted-foreground mb-1">{c.when}</div>
                <p className="text-sm">{c.msg}</p>
              </div>
            ))}
            <Textarea placeholder="Add a comment…" />
            <Button className="w-full" onClick={() => toast.success("Comment posted")}>
              Post comment
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
