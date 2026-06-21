import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { meetings } from "@/lib/dummy-data";
import { Plus, FileDown, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/meetings")({
  head: () => ({ meta: [{ title: "Meeting Minutes — ElectraFlow AI" }] }),
  component: MeetingsPage,
});

function MeetingsPage() {
  return (
    <>
      <PageHeader
        title="Meeting Minutes"
        subtitle="Agendas, notes, and action items."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Meeting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule meeting</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input placeholder="Weekly coordination…" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time</Label>
                    <Input type="time" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Agenda</Label>
                  <Textarea rows={3} placeholder="One item per line…" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => toast.success("Meeting created")}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {meetings.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle className="text-base">{m.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-3 text-xs">
                <Badge variant="outline">{m.date}</Badge>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {m.attendees}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5" />
                  {m.actions} actions
                </span>
              </div>
              <Button variant="outline" size="sm" className="w-full">
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{meetings[0].title} · Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <div className="font-semibold mb-1">Agenda</div>
            <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
              <li>Submittals status</li>
              <li>Schedule recovery for SS-01</li>
              <li>Open RFIs review</li>
              <li>NCR-003 closeout</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-1">Discussion notes</div>
            <p className="text-muted-foreground">
              Reviewed AHU-12 corrective submittal; consultant agrees on revised motor model. ALEC
              committed to 7-day re-submission turnaround. Coordination required between Electrical
              and HVAC for tray-duct clash zone B.
            </p>
          </div>
          <div>
            <div className="font-semibold mb-2">Action items</div>
            <div className="space-y-1.5">
              {[
                { a: "Issue RFI-006 on Zone B tray routing", who: "Sara Khan", due: "2025-07-02" },
                { a: "Re-issue AHU-12 submittal package", who: "ALEC / Omar", due: "2025-07-05" },
                {
                  a: "Confirm closeout of NCR-003 with QA/QC",
                  who: "Mohammed Iqbal",
                  due: "2025-07-04",
                },
              ].map((x, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md border">
                  <input type="checkbox" className="h-4 w-4" />
                  <span className="flex-1">{x.a}</span>
                  <Badge variant="outline">{x.who}</Badge>
                  <Badge variant="outline">{x.due}</Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
