import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { rfis, statusColor, projects } from "@/lib/dummy-data";
import { Plus, Search, MessageSquareOff } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/rfi")({
  head: () => ({ meta: [{ title: "RFIs — ElectraFlow AI" }] }),
  component: RFI,
});

function RFI() {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      rfis.filter(
        (r) =>
          q === "" ||
          `${r.subject} ${r.project} ${r.number}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );

  return (
    <>
      <PageHeader
        title="Requests for Information"
        subtitle="Track RFIs across projects."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New RFI
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create RFI</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="col-span-2 space-y-1.5">
                  <Label>Subject</Label>
                  <Input placeholder="Brief title…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Assigned To</Label>
                  <Input placeholder="Consultant / Contractor" />
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select defaultValue="Medium">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Low", "Medium", "High"].map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Question</Label>
                  <Textarea rows={4} placeholder="Describe the request…" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => toast.success("RFI created")}>Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by subject, project, number…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={MessageSquareOff}
              title="No RFIs found"
              description="No RFIs match your search. Try a different term."
              action={
                <Button variant="outline" onClick={() => setQ("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {["RFI #", "Project", "Subject", "Assigned To", "Due", "Status", "Priority"].map(
                    (h) => (
                      <TableHead key={h} className="px-3 font-medium">
                        {h}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="px-3 font-mono text-xs">{r.number}</TableCell>
                    <TableCell className="px-3">{r.project}</TableCell>
                    <TableCell className="px-3 font-medium">{r.subject}</TableCell>
                    <TableCell className="px-3">{r.assignedTo}</TableCell>
                    <TableCell className="px-3 whitespace-nowrap">{r.due}</TableCell>
                    <TableCell className="px-3">
                      <Badge variant="outline" className={statusColor[r.status]}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3">
                      <Badge variant="outline">{r.priority}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
