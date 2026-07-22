/**
 * Electrical calculation helpers — Phase 15B
 *
 * Preliminary calculations only. NOT electrical code compliance.
 */

import type { CircuitView, ElectricalWarning } from "@/types/electrical-view";

export const ELECTRICAL_CONFIG = {
  /** Phase imbalance ratio threshold (max/min non-zero phases). */
  phaseImbalanceRatio: 1.25,
  /** Heuristic VA per amp for breaker sizing review (not code compliance). */
  breakerSizingVaPerAmp: 80,
  /** Minimum demand factor. */
  minDemandFactor: 0,
  /** Maximum demand factor. */
  maxDemandFactor: 1,
  sqrt3: Math.sqrt(3),
  calculationDisclaimer:
    "Preliminary calculation only. Final design must be verified by a licensed engineer and applicable electrical code.",
} as const;

export function computeDemandLoadVa(connectedVa: number, demandFactor: number): number {
  return connectedVa * demandFactor;
}

export function computeCurrentAmps(
  loadVa: number,
  voltage: number,
  phase: "single" | "three",
): number | null {
  if (voltage <= 0 || loadVa < 0) return null;
  if (phase === "single") return loadVa / voltage;
  return loadVa / (ELECTRICAL_CONFIG.sqrt3 * voltage);
}

export function computePanelTotalLoadVa(circuits: Pick<CircuitView, "load_va">[]): number {
  return circuits.reduce((sum, c) => sum + Number(c.load_va ?? 0), 0);
}

const PHASE_KEYS = ["A", "B", "C"] as const;

export function computePhaseLoads(
  circuits: Pick<CircuitView, "load_va" | "phase">[],
): Record<string, number> {
  const loads: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (const c of circuits) {
    const p = (c.phase ?? "").toUpperCase();
    if (p === "A" || p === "B" || p === "C") {
      loads[p] += Number(c.load_va ?? 0);
    } else if (p === "AB" || p === "BC" || p === "CA") {
      const half = Number(c.load_va ?? 0) / 2;
      const [a, b] = p === "AB" ? ["A", "B"] : p === "BC" ? ["B", "C"] : ["C", "A"];
      loads[a] += half;
      loads[b] += half;
    }
  }
  return loads;
}

export function buildCircuitWarnings(circuit: CircuitView): ElectricalWarning[] {
  const warnings: ElectricalWarning[] = [];
  const loadVa = Number(circuit.load_va ?? 0);

  if (!circuit.breaker_size) {
    warnings.push({
      code: "MISSING_BREAKER",
      message: "Breaker size not specified",
      severity: "warning",
    });
  }
  if (!circuit.wire_size) {
    warnings.push({
      code: "MISSING_WIRE",
      message: "Wire size not specified",
      severity: "warning",
    });
  }
  if (
    loadVa > 0 &&
    circuit.breaker_size &&
    loadVa > circuit.breaker_size * ELECTRICAL_CONFIG.breakerSizingVaPerAmp
  ) {
    warnings.push({
      code: "BREAKER_SIZING_REVIEW",
      message: "Load exceeds heuristic breaker sizing — verify manually",
      severity: "warning",
    });
  }
  return warnings;
}

export function buildPanelWarnings(circuits: CircuitView[]): ElectricalWarning[] {
  const warnings: ElectricalWarning[] = [];
  const phaseLoads = computePhaseLoads(circuits);
  const nonZero = PHASE_KEYS.map((k) => phaseLoads[k]).filter((v) => v > 0);

  if (nonZero.length >= 2) {
    const max = Math.max(...nonZero);
    const min = Math.min(...nonZero);
    if (min > 0 && max / min > ELECTRICAL_CONFIG.phaseImbalanceRatio) {
      warnings.push({
        code: "UNBALANCED_PHASE",
        message: `Phase loads may be unbalanced (ratio ${(max / min).toFixed(2)})`,
        severity: "warning",
      });
    }
  }

  for (const c of circuits) {
    warnings.push(...buildCircuitWarnings(c));
  }

  return warnings;
}

export function computeLoadCalculationPreview(input: {
  total_connected_load_va: number;
  demand_factor: number;
  voltage: number;
  phase: "single" | "three";
}): { demand_load_va: number; calculated_current_a: number | null } {
  const demand_load_va = computeDemandLoadVa(input.total_connected_load_va, input.demand_factor);
  return {
    demand_load_va,
    calculated_current_a: computeCurrentAmps(demand_load_va, input.voltage, input.phase),
  };
}
