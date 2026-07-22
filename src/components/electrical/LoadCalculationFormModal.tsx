/**
 * Load calculation create/edit modal — Phase 15B
 */

import { useState, useEffect, useMemo } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Download } from "lucide-react";
import { projects } from "@/lib/dummy-data";
import { ELECTRICAL_CONFIG, computeLoadCalculationPreview } from "@/lib/electrical-calculations";
import { usePullConnectedLoadFromPanel } from "@/hooks/api/useElectrical";
import type {
  LoadCalculationView,
  LoadCalculationCreateInput,
  LoadCalculationUpdateInput,
  LoadCalculationType,
  PanelListItemView,
} from "@/types/electrical-view";
import { toast } from "sonner";

const CALC_TYPES: { value: LoadCalculationType; label: string }[] = [
  { value: "service_load", label: "Service Load" },
  { value: "feeder_load", label: "Feeder Load" },
  { value: "panel_load", label: "Panel Load" },
  { value: "equipment_load", label: "Equipment Load" },
  { value: "other", label: "Other" },
];

interface LoadCalculationFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadCalc?: LoadCalculationView | null;
  panels?: PanelListItemView[];
  onSubmit: (input: LoadCalculationCreateInput | LoadCalculationUpdateInput) => Promise<void>;
  isPending?: boolean;
}

export function LoadCalculationFormModal({
  open,
  onOpenChange,
  loadCalc,
  panels = [],
  onSubmit,
  isPending,
}: LoadCalculationFormModalProps) {
  const isEdit = !!loadCalc;
  const pullMut = usePullConnectedLoadFromPanel();

  const [projectId, setProjectId] = useState("");
  const [calcName, setCalcName] = useState("");
  const [calcType, setCalcType] = useState<LoadCalculationType>("panel_load");
  const [sourcePanelId, setSourcePanelId] = useState<string>("none");
  const [connectedLoadVa, setConnectedLoadVa] = useState("0");
  const [demandFactor, setDemandFactor] = useState("1");
  const [voltage, setVoltage] = useState("480");
  const [phase, setPhase] = useState<"single" | "three">("three");

  const projectPanels = useMemo(
    () => panels.filter((p) => p.project_id === projectId),
    [panels, projectId],
  );

  const preview = useMemo(() => {
    const connected = Number(connectedLoadVa) || 0;
    const factor = Number(demandFactor) || 0;
    const v = Number(voltage) || 480;
    return computeLoadCalculationPreview({
      total_connected_load_va: connected,
      demand_factor: factor,
      voltage: v,
      phase,
    });
  }, [connectedLoadVa, demandFactor, voltage, phase]);

  useEffect(() => {
    if (!open) return;
    if (loadCalc) {
      setProjectId(loadCalc.project_id);
      setCalcName(loadCalc.calculation_name);
      setCalcType(loadCalc.calculation_type);
      setSourcePanelId(loadCalc.source_panel_id ?? "none");
      setConnectedLoadVa(String(loadCalc.total_connected_load_va));
      setDemandFactor(String(loadCalc.demand_factor));
      setVoltage(String(loadCalc.voltage));
      setPhase(loadCalc.phase);
    } else {
      setProjectId(projects[0]?.id ?? "");
      setCalcName("");
      setCalcType("panel_load");
      setSourcePanelId("none");
      setConnectedLoadVa("0");
      setDemandFactor("1");
      setVoltage("480");
      setPhase("three");
    }
  }, [open, loadCalc]);

  async function handlePullFromPanel() {
    if (sourcePanelId === "none") {
      toast.error("Select a source panel first");
      return;
    }
    try {
      const res = await pullMut.mutateAsync(sourcePanelId);
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      const va = res.data?.total_connected_load_va;
      if (va != null) {
        setConnectedLoadVa(String(va));
        toast.success("Connected load pulled from panel");
      }
    } catch {
      toast.error("Failed to pull connected load");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!calcName.trim() || (!isEdit && !projectId)) return;

    const factor = Number(demandFactor);
    if (factor < ELECTRICAL_CONFIG.minDemandFactor || factor > ELECTRICAL_CONFIG.maxDemandFactor) {
      toast.error(
        `Demand factor must be between ${ELECTRICAL_CONFIG.minDemandFactor} and ${ELECTRICAL_CONFIG.maxDemandFactor}`,
      );
      return;
    }

    const payload: LoadCalculationCreateInput | LoadCalculationUpdateInput = {
      calculation_name: calcName.trim(),
      calculation_type: calcType,
      source_panel_id: sourcePanelId === "none" ? null : sourcePanelId,
      total_connected_load_va: Number(connectedLoadVa) || 0,
      demand_factor: factor,
      voltage: Number(voltage) || 480,
      phase,
    };

    if (!isEdit) {
      (payload as LoadCalculationCreateInput).project_id = projectId;
    }

    await onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit load calculation" : "Create load calculation"}</DialogTitle>
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
            <Label htmlFor="calc-name">Calculation name</Label>
            <Input
              id="calc-name"
              value={calcName}
              onChange={(e) => setCalcName(e.target.value)}
              placeholder="MDP-1 Service Load"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={calcType} onValueChange={(v) => setCalcType(v as LoadCalculationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source panel (optional)</Label>
            <div className="flex gap-2">
              <Select value={sourcePanelId} onValueChange={setSourcePanelId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="No panel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No panel</SelectItem>
                  {projectPanels.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.panel_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Pull connected load from panel"
                disabled={sourcePanelId === "none" || pullMut.isPending}
                onClick={handlePullFromPanel}
              >
                {pullMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="calc-connected">Connected load (VA)</Label>
              <Input
                id="calc-connected"
                type="number"
                min={0}
                value={connectedLoadVa}
                onChange={(e) => setConnectedLoadVa(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-demand">Demand factor</Label>
              <Input
                id="calc-demand"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={demandFactor}
                onChange={(e) => setDemandFactor(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="calc-voltage">Voltage (V)</Label>
              <Input
                id="calc-voltage"
                type="number"
                min={1}
                value={voltage}
                onChange={(e) => setVoltage(e.target.value)}
              />
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
          <Alert>
            <AlertDescription className="text-xs space-y-1">
              <p>
                Preview demand: <strong>{preview.demand_load_va.toLocaleString()} VA</strong>
                {preview.calculated_current_a != null && (
                  <>
                    {" "}
                    · Preview current: <strong>{preview.calculated_current_a.toFixed(2)} A</strong>
                  </>
                )}
              </p>
              <p className="text-muted-foreground">{ELECTRICAL_CONFIG.calculationDisclaimer}</p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Create calculation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
