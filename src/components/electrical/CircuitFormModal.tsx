/**
 * Circuit add/edit modal — Phase 15B
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
import type {
  CircuitView,
  CircuitCreateInput,
  CircuitUpdateInput,
  CircuitSide,
} from "@/types/electrical-view";

const CIRCUIT_SIDES: { value: CircuitSide; label: string }[] = [
  { value: "na", label: "N/A" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
];

const PHASE_OPTIONS = ["A", "B", "C", "AB", "BC", "CA"];

interface CircuitFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  circuit?: CircuitView | null;
  defaultVoltage?: number;
  onSubmit: (input: CircuitCreateInput | CircuitUpdateInput) => Promise<void>;
  isPending?: boolean;
}

export function CircuitFormModal({
  open,
  onOpenChange,
  circuit,
  defaultVoltage,
  onSubmit,
  isPending,
}: CircuitFormModalProps) {
  const isEdit = !!circuit;

  const [circuitNumber, setCircuitNumber] = useState("");
  const [circuitSide, setCircuitSide] = useState<CircuitSide>("na");
  const [description, setDescription] = useState("");
  const [loadVa, setLoadVa] = useState("0");
  const [breakerSize, setBreakerSize] = useState("");
  const [poles, setPoles] = useState("");
  const [phase, setPhase] = useState<string>("none");
  const [wireSize, setWireSize] = useState("");
  const [conduitSize, setConduitSize] = useState("");
  const [voltage, setVoltage] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) return;
    if (circuit) {
      setCircuitNumber(circuit.circuit_number);
      setCircuitSide(circuit.circuit_side);
      setDescription(circuit.description ?? "");
      setLoadVa(String(circuit.load_va));
      setBreakerSize(circuit.breaker_size != null ? String(circuit.breaker_size) : "");
      setPoles(circuit.poles != null ? String(circuit.poles) : "");
      setPhase(circuit.phase ?? "none");
      setWireSize(circuit.wire_size ?? "");
      setConduitSize(circuit.conduit_size ?? "");
      setVoltage(circuit.voltage != null ? String(circuit.voltage) : "");
      setRemarks(circuit.remarks ?? "");
    } else {
      setCircuitNumber("");
      setCircuitSide("na");
      setDescription("");
      setLoadVa("0");
      setBreakerSize("");
      setPoles("");
      setPhase("none");
      setWireSize("");
      setConduitSize("");
      setVoltage(defaultVoltage != null ? String(defaultVoltage) : "");
      setRemarks("");
    }
  }, [open, circuit, defaultVoltage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!circuitNumber.trim()) return;

    await onSubmit({
      circuit_number: circuitNumber.trim(),
      circuit_side: circuitSide,
      description: description.trim() || null,
      load_va: Number(loadVa) || 0,
      breaker_size: breakerSize ? Number(breakerSize) : null,
      poles: poles ? Number(poles) : null,
      phase: phase === "none" ? null : phase,
      wire_size: wireSize.trim() || null,
      conduit_size: conduitSize.trim() || null,
      voltage: voltage ? Number(voltage) : null,
      remarks: remarks.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit circuit" : "Add circuit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="circuit-number">Circuit #</Label>
              <Input
                id="circuit-number"
                value={circuitNumber}
                onChange={(e) => setCircuitNumber(e.target.value)}
                placeholder="1"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Side</Label>
              <Select value={circuitSide} onValueChange={(v) => setCircuitSide(v as CircuitSide)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CIRCUIT_SIDES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="circuit-description">Description</Label>
            <Input
              id="circuit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lighting - Lobby"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="circuit-load">Load (VA)</Label>
              <Input
                id="circuit-load"
                type="number"
                min={0}
                value={loadVa}
                onChange={(e) => setLoadVa(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="circuit-breaker">Breaker (A)</Label>
              <Input
                id="circuit-breaker"
                type="number"
                min={0}
                value={breakerSize}
                onChange={(e) => setBreakerSize(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="circuit-poles">Poles</Label>
              <Input
                id="circuit-poles"
                type="number"
                min={1}
                max={3}
                value={poles}
                onChange={(e) => setPoles(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger>
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {PHASE_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="circuit-voltage">Voltage (V)</Label>
              <Input
                id="circuit-voltage"
                type="number"
                min={0}
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="circuit-wire">Wire size</Label>
              <Input
                id="circuit-wire"
                value={wireSize}
                onChange={(e) => setWireSize(e.target.value)}
                placeholder="12 AWG"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="circuit-conduit">Conduit size</Label>
              <Input
                id="circuit-conduit"
                value={conduitSize}
                onChange={(e) => setConduitSize(e.target.value)}
                placeholder={'3/4"'}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="circuit-remarks">Remarks</Label>
            <Textarea
              id="circuit-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save circuit" : "Add circuit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
