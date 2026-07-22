/**
 * Meeting create/edit modal — Phase 15A
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { projects } from "@/lib/dummy-data";
import type { MeetingView, MeetingCreateInput, MeetingUpdateInput } from "@/types/meeting-view";
import type { MeetingType, MeetingVisibility } from "@/types/database";

const MEETING_TYPES: { value: MeetingType; label: string }[] = [
  { value: "coordination", label: "Coordination" },
  { value: "standup", label: "Standup" },
  { value: "design_review", label: "Design Review" },
  { value: "client", label: "Client" },
  { value: "kickoff", label: "Kickoff" },
  { value: "closeout", label: "Closeout" },
  { value: "other", label: "Other" },
];

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetime(local: string): string {
  return new Date(local).toISOString();
}

interface MeetingFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: MeetingView | null;
  onSubmit: (input: MeetingCreateInput | MeetingUpdateInput) => Promise<void>;
  isPending?: boolean;
}

export function MeetingFormModal({
  open,
  onOpenChange,
  meeting,
  onSubmit,
  isPending,
}: MeetingFormModalProps) {
  const isEdit = !!meeting;

  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>("coordination");
  const [visibility, setVisibility] = useState<MeetingVisibility>("internal");
  const [projectId, setProjectId] = useState<string>("none");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [agenda, setAgenda] = useState("");

  useEffect(() => {
    if (!open) return;
    if (meeting) {
      setTitle(meeting.title);
      setMeetingType(meeting.meeting_type);
      setVisibility(meeting.visibility);
      setProjectId(meeting.project_id ?? "none");
      setStart(toLocalDatetime(meeting.scheduled_start));
      setEnd(toLocalDatetime(meeting.scheduled_end));
      setLocation(meeting.location ?? "");
      setVideoLink(meeting.video_link ?? "");
      setAgenda(meeting.agenda ?? "");
    } else {
      setTitle("");
      setMeetingType("coordination");
      setVisibility("internal");
      setProjectId("none");
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const later = new Date(now.getTime() + 60 * 60 * 1000);
      setStart(toLocalDatetime(now.toISOString()));
      setEnd(toLocalDatetime(later.toISOString()));
      setLocation("");
      setVideoLink("");
      setAgenda("");
    }
  }, [open, meeting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !start || !end) return;

    const payload = {
      title: title.trim(),
      meeting_type: meetingType,
      visibility,
      project_id: projectId === "none" ? null : projectId,
      scheduled_start: fromLocalDatetime(start),
      scheduled_end: fromLocalDatetime(end),
      location: location.trim() || null,
      video_link: videoLink.trim() || null,
      agenda: agenda.trim() || null,
    };

    await onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit meeting" : "Schedule meeting"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly coordination…"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={meetingType} onValueChange={(v) => setMeetingType(v as MeetingType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as MeetingVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="client_visible">Client visible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-start">Start</Label>
              <Input
                id="meeting-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-end">End</Label>
              <Input
                id="meeting-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-location">Location</Label>
            <Input
              id="meeting-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Conference room or site"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-video">Video link</Label>
            <Input
              id="meeting-video"
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-agenda">Agenda</Label>
            <Textarea
              id="meeting-agenda"
              rows={4}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="One item per line…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Create meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
