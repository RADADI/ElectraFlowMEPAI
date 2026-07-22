/**
 * Meeting attendees list — Phase 15A
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Loader2, Plus, Trash2, Users, Mail } from "lucide-react";
import type { MeetingAttendeeView } from "@/types/meeting-view";
import { useAddAttendee, useRemoveAttendee } from "@/hooks/api/useMeetings";
import { toast } from "sonner";

interface AttendeeListProps {
  meetingId: string;
  attendees: MeetingAttendeeView[];
  canManage: boolean;
  isLoading?: boolean;
}

export function AttendeeList({ meetingId, attendees, canManage, isLoading }: AttendeeListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [profileId, setProfileId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");

  const addMut = useAddAttendee(meetingId);
  const removeMut = useRemoveAttendee(meetingId);

  async function handleAdd() {
    try {
      if (mode === "internal") {
        if (!profileId.trim()) {
          toast.error("Enter a profile ID for demo mode, or use Supabase profiles picker.");
          return;
        }
        const res = await addMut.mutateAsync({ profile_id: profileId.trim() });
        if (res.error) {
          toast.error(res.error.message);
          return;
        }
      } else {
        if (!externalName.trim() || !externalEmail.trim()) {
          toast.error("Name and email required for external attendees.");
          return;
        }
        const res = await addMut.mutateAsync({
          external_name: externalName.trim(),
          external_email: externalEmail.trim(),
        });
        if (res.error) {
          toast.error(res.error.message);
          return;
        }
      }
      toast.success("Attendee added");
      setAddOpen(false);
      setProfileId("");
      setExternalName("");
      setExternalEmail("");
    } catch {
      toast.error("Failed to add attendee");
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await removeMut.mutateAsync(id);
      if (res.error) toast.error(res.error.message);
      else toast.success("Attendee removed");
    } catch {
      toast.error("Failed to remove attendee");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add attendee
        </Button>
      )}

      {attendees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No attendees yet"
          description="Add internal team members or external guests."
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {attendees.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.display_name}</div>
                {a.display_email && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {a.display_email}
                  </div>
                )}
              </div>
              <Badge variant="outline">{a.role}</Badge>
              {a.is_external && <Badge variant="secondary">External</Badge>}
              {a.is_deactivated && <Badge variant="destructive">Former User</Badge>}
              <Badge variant="outline">{a.response_status}</Badge>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={removeMut.isPending}
                  onClick={() => handleRemove(a.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add attendee</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "internal" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("internal")}
              >
                Internal
              </Button>
              <Button
                type="button"
                variant={mode === "external" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("external")}
              >
                External
              </Button>
            </div>
            {mode === "internal" ? (
              <div className="space-y-1.5">
                <Label>Profile ID</Label>
                <Input
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  placeholder="mock-prof-sara"
                />
                <p className="text-xs text-muted-foreground">
                  Demo: mock-prof-pm, mock-prof-sara, mock-prof-omar
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={externalEmail}
                    onChange={(e) => setExternalEmail(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMut.isPending}>
              {addMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
