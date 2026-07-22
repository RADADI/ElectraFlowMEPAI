/**
 * Panel schedule create/edit modal — Phase 15B
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { projects } from "@/lib/dummy-data";
import type { PanelView, PanelCreateInput, PanelUpdateInput } from "@/types/electrical-view";

const PANEL_TYPES = [
  { value: "main_distribution", label: "Main Distribution" },
  { value: "distribution", label: "Distribution" },
  { value: "lighting_panel", label: "Lighting Panel" },
  { value: "power_panel", label: "Power Panel" },
  { value: "other", label: "Other" },
];

const MOUNTING_OPTIONS = [
  { value: "surface", label: "Surface" },
  { value: "recessed", label: "Recessed" },
  { value: "free_standing", label: "Free Standing" },
];

interface PanelFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel?: PanelView | null;
  onSubmit: (input: PanelCreateInput | PanelUpdateInput) => Promise<void>;
  isPending?: boolean;
}

export function PanelFormModal({
  open,
  onOpenChange,
  panel,
  onSubmit,
  isPending,
}: PanelFormModalProps) {
  const isEdit = !!panel;

  const [projectId, setProjectId] = useState("");
  const [panelName, setPanelName] = useState("");
  const [panelType, setPanelType] = useState("distribution");
  const [voltage, setVoltage] = useState("480");
  const [phase, setPhase] = useState<"single" | "three">("three");
  const [location, setLocation] = useState("");
  const [fedFrom, setFedFrom] = useState("");
  const [mainBreakerSize, setMainBreakerSize] = useState("");
  const [busRating, setBusRating] = useState("");
  const [mounting, setMounting] = useState("surface");
  const [enclosureType, setEnclosureType] = useState("");

  useEffect(() => {
    if (!open) return;
    if (panel) {
      setProjectId(panel.project_id);
      setPanelName(panel.panel_name);
      setPanelType(panel.panel_type);
      setVoltage(String(panel.voltage));
      setPhase(panel.phase);
      setLocation(panel.location ?? "");
      setFedFrom(panel.fed_from ?? "");
      setMainBreakerSize(panel.main_breaker_size != null ? String(panel.main_breaker_size) : "");
      setBusRating(panel.bus_rating != null ? String(panel.bus_rating) : "");
      setMounting(panel.mounting ?? "surface");
      setEnclosureType(panel.enclosure_type ?? "");
    } else {
      setProjectId(projects[0]?.id ?? "");
      setPanelName("");
      setPanelType("distribution");
      setVoltage("480");
      setPhase("three");
      setLocation("");
      setFedFrom("");
      setMainBreakerSize("");
      setBusRating("");
      setMounting("surface");
      setEnclosureType("");
    }
  }, [open, panel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!panelName.trim() || (!isEdit && !projectId)) return;

    const payload: PanelCreateInput | PanelUpdateInput = {
      panel_name: panelName.trim(),
      panel_type: panelType,
      voltage: Number(voltage) || 480,
      phase,
      location: location.trim() || null,
      fed_from: fedFrom.trim() || null,
      main_breaker_size: mainBreakerSize ? Number(mainBreakerSize) : null,
      bus_rating: busRating ? Number(busRating) : null,
      mounting: mounting || null,
      enclosure_type: enclosureType.trim() || null,
    };

    if (!isEdit) {
      (payload as PanelCreateInput).project_id = projectId;
    }

    await onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit panel schedule" : "Create panel schedule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
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
          )}
          <div className="space-y-1.5">
            <Label htmlFor="panel-name">Panel name</Label>
            <Input
              id="panel-name"
              value={panelName}
              onChange={(e) => setPanelName(e.target.value)}
              placeholder="MDP-1"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Panel type</Label>
              <Select value={panelType} onValueChange={setPanelType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PANEL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={(v) => setPhase(v as "single" | "three")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="three">Three</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="panel-voltage">Voltage (V)</Label>
              <Input
                id="panel-voltage"
                type="number"
                min={1}
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-location">Location</Label>
              <Input
                id="panel-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Electrical Room 101"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="panel-fed-from">Fed from</Label>
            <Input
              id="panel-fed-from"
              value={fedFrom}
              onChange={(e) => setFedFrom(e.target.value)}
              placeholder="Utility service or upstream panel"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="panel-main-breaker">Main breaker (A)</Label>
              <Input
                id="panel-main-breaker"
                type="number"
                min={0}
                value={mainBreakerSize}
                onChange={(e) => setMainBreakerSize(e.target.value)}
                placeholder="800"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-bus-rating">Bus rating (A)</Label>
              <Input
                id="panel-bus-rating"
                type="number"
                min={0}
                value={busRating}
                onChange={(e) => setBusRating(e.target.value)}
                placeholder="800"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mounting</Label>
              <Select value={mounting} onValueChange={setMounting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOUNTING_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-enclosure">Enclosure type</Label>
              <Input
                id="panel-enclosure"
                value={enclosureType}
                onChange={(e) => setEnclosureType(e.target.value)}
                placeholder="NEMA 1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Create panel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
