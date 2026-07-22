/**
 * Equipment create/edit modal — Phase 15B
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
import type {
  EquipmentView,
  EquipmentCreateInput,
  EquipmentUpdateInput,
} from "@/types/electrical-view";

const EQUIPMENT_TYPES = [
  "AHU",
  "Transformer",
  "Motor",
  "Panel",
  "Generator",
  "UPS",
  "Chiller",
  "Pump",
  "Other",
];

interface EquipmentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment?: EquipmentView | null;
  onSubmit: (input: EquipmentCreateInput | EquipmentUpdateInput) => Promise<void>;
  isPending?: boolean;
}

export function EquipmentFormModal({
  open,
  onOpenChange,
  equipment,
  onSubmit,
  isPending,
}: EquipmentFormModalProps) {
  const isEdit = !!equipment;

  const [projectId, setProjectId] = useState("");
  const [tag, setTag] = useState("");
  const [equipmentType, setEquipmentType] = useState("Other");
  const [description, setDescription] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [voltage, setVoltage] = useState("");
  const [phase, setPhase] = useState<string>("none");
  const [loadVa, setLoadVa] = useState("0");
  const [location, setLocation] = useState("");

  useEffect(() => {
    if (!open) return;
    if (equipment) {
      setProjectId(equipment.project_id);
      setTag(equipment.tag);
      setEquipmentType(equipment.equipment_type);
      setDescription(equipment.description ?? "");
      setManufacturer(equipment.manufacturer ?? "");
      setModel(equipment.model ?? "");
      setVoltage(equipment.voltage != null ? String(equipment.voltage) : "");
      setPhase(equipment.phase ?? "none");
      setLoadVa(String(equipment.load_va));
      setLocation(equipment.location ?? "");
    } else {
      setProjectId(projects[0]?.id ?? "");
      setTag("");
      setEquipmentType("Other");
      setDescription("");
      setManufacturer("");
      setModel("");
      setVoltage("");
      setPhase("none");
      setLoadVa("0");
      setLocation("");
    }
  }, [open, equipment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tag.trim() || (!isEdit && !projectId)) return;

    const payload: EquipmentCreateInput | EquipmentUpdateInput = {
      tag: tag.trim(),
      equipment_type: equipmentType,
      description: description.trim() || null,
      manufacturer: manufacturer.trim() || null,
      model: model.trim() || null,
      voltage: voltage ? Number(voltage) : null,
      phase: phase === "none" ? null : (phase as "single" | "three"),
      load_va: Number(loadVa) || 0,
      location: location.trim() || null,
    };

    if (!isEdit) {
      (payload as EquipmentCreateInput).project_id = projectId;
    }

    await onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit equipment" : "Add equipment"}</DialogTitle>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eq-tag">Tag</Label>
              <Input
                id="eq-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="AHU-12"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={equipmentType} onValueChange={setEquipmentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-description">Description</Label>
            <Textarea
              id="eq-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Air handling unit - lobby"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eq-manufacturer">Manufacturer</Label>
              <Input
                id="eq-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Carrier"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-model">Model</Label>
              <Input
                id="eq-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="39M"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="eq-voltage">Voltage (V)</Label>
              <Input
                id="eq-voltage"
                type="number"
                min={0}
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger>
                  <SelectValue placeholder="Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="three">Three</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-load">Load (VA)</Label>
              <Input
                id="eq-load"
                type="number"
                min={0}
                value={loadVa}
                onChange={(e) => setLoadVa(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-location">Location</Label>
            <Input
              id="eq-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Roof Level 1"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Add equipment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
