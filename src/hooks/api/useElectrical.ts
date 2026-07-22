/**
 * Electrical React Query hooks — Phase 15B
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  listPanels,
  getPanel,
  createPanel,
  updatePanel,
  submitPanel,
  approvePanel,
  rejectPanel,
  archivePanel,
  restorePanel,
  reopenPanel,
  listCircuits,
  addCircuit,
  updateCircuit,
  removeCircuit,
  getPanelLoadSummary,
  listLoadCalculations,
  getLoadCalculation,
  createLoadCalculation,
  updateLoadCalculation,
  submitLoadCalculation,
  approveLoadCalculation,
  rejectLoadCalculation,
  archiveLoadCalculation,
  restoreLoadCalculation,
  pullConnectedLoadFromPanel,
  listEquipment,
  createEquipment,
  updateEquipment,
  archiveEquipment,
  restoreEquipment,
  getElectricalOverviewStats,
  getElectricalTimeline,
  listElectricalRevisions,
} from "@/services/electrical.service";
import type { EquipmentStatus } from "@/types/database";
import type {
  PanelFilterInput,
  PanelCreateInput,
  PanelUpdateInput,
  CircuitCreateInput,
  CircuitUpdateInput,
  LoadCalculationCreateInput,
  LoadCalculationUpdateInput,
  EquipmentCreateInput,
  EquipmentUpdateInput,
  ElectricalWorkflowStatus,
} from "@/types/electrical-view";

export interface LoadCalculationFilterInput {
  status?: ElectricalWorkflowStatus | "all";
  project_id?: string;
  search?: string;
  include_archived?: boolean;
  cursor?: string;
  limit?: number;
}

export interface EquipmentFilterInput {
  status?: EquipmentStatus | "all";
  project_id?: string;
  search?: string;
  include_archived?: boolean;
}

export type ElectricalEntityType = "panel_schedule" | "load_calculation";

export const ELECTRICAL_KEYS = {
  all: ["electrical"] as const,
  panels: ["electrical", "panels"] as const,
  panelList: (filters?: PanelFilterInput) => ["electrical", "panels", "list", filters] as const,
  panelDetail: (id: string) => ["electrical", "panels", id] as const,
  circuits: (panelId: string) => ["electrical", "panels", panelId, "circuits"] as const,
  loadSummary: (panelId: string) => ["electrical", "panels", panelId, "load-summary"] as const,
  loadCalcs: ["electrical", "load-calculations"] as const,
  loadCalcList: (filters?: LoadCalculationFilterInput) =>
    ["electrical", "load-calculations", "list", filters] as const,
  loadCalcDetail: (id: string) => ["electrical", "load-calculations", id] as const,
  equipment: ["electrical", "equipment"] as const,
  equipmentList: (filters?: EquipmentFilterInput) =>
    ["electrical", "equipment", "list", filters] as const,
  overview: ["electrical", "overview"] as const,
  timeline: (entityType: ElectricalEntityType, entityId: string) =>
    ["electrical", "timeline", entityType, entityId] as const,
  revisions: (entityType: ElectricalEntityType, entityId: string) =>
    ["electrical", "revisions", entityType, entityId] as const,
};

function invalidatePanels(qc: ReturnType<typeof useQueryClient>, panelId?: string) {
  qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.panels });
  qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.overview });
  if (panelId) {
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.panelDetail(panelId) });
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.circuits(panelId) });
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.loadSummary(panelId) });
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.timeline("panel_schedule", panelId) });
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.revisions("panel_schedule", panelId) });
  }
}

function invalidateLoadCalcs(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.loadCalcs });
  qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.overview });
  if (id) {
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.loadCalcDetail(id) });
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.timeline("load_calculation", id) });
    qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.revisions("load_calculation", id) });
  }
}

function invalidateEquipment(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.equipment });
  qc.invalidateQueries({ queryKey: ELECTRICAL_KEYS.overview });
}

// ─── Panels ───────────────────────────────────────────────────────────────────

export function usePanels(filters?: PanelFilterInput) {
  return useInfiniteQuery({
    queryKey: ELECTRICAL_KEYS.panelList(filters),
    queryFn: ({ pageParam }) => listPanels({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function usePanel(id: string) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.panelDetail(id),
    queryFn: () => getPanel(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function usePanelCircuits(panelId: string) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.circuits(panelId),
    queryFn: () => listCircuits(panelId),
    select: (r) => r.data ?? [],
    enabled: !!panelId,
    staleTime: 60_000,
  });
}

export function usePanelLoadSummary(panelId: string) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.loadSummary(panelId),
    queryFn: () => getPanelLoadSummary(panelId),
    select: (r) => r.data,
    enabled: !!panelId,
    staleTime: 30_000,
  });
}

export function useCreatePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PanelCreateInput) => createPanel(input),
    onSuccess: (res) => invalidatePanels(qc, res.data?.id),
  });
}

export function useUpdatePanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PanelUpdateInput) => updatePanel(id, input),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

export function useSubmitPanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitPanel(id),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

export function useApprovePanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approvePanel(id),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

export function useRejectPanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => rejectPanel(id, reason),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

export function useArchivePanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archivePanel(id),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

export function useRestorePanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restorePanel(id),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

export function useReopenPanel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reopenPanel(id),
    onSuccess: () => invalidatePanels(qc, id),
  });
}

// ─── Circuits ─────────────────────────────────────────────────────────────────

export function useAddCircuit(panelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CircuitCreateInput) => addCircuit(panelId, input),
    onSuccess: () => invalidatePanels(qc, panelId),
  });
}

export function useUpdateCircuit(panelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CircuitUpdateInput }) =>
      updateCircuit(id, input),
    onSuccess: () => invalidatePanels(qc, panelId),
  });
}

export function useRemoveCircuit(panelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (circuitId: string) => removeCircuit(circuitId),
    onSuccess: () => invalidatePanels(qc, panelId),
  });
}

// ─── Load calculations ────────────────────────────────────────────────────────

export function useLoadCalculations(filters?: LoadCalculationFilterInput) {
  return useInfiniteQuery({
    queryKey: ELECTRICAL_KEYS.loadCalcList(filters),
    queryFn: ({ pageParam }) =>
      listLoadCalculations({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data?.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

export function useLoadCalculation(id: string) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.loadCalcDetail(id),
    queryFn: () => getLoadCalculation(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateLoadCalculation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoadCalculationCreateInput) => createLoadCalculation(input),
    onSuccess: (res) => invalidateLoadCalcs(qc, res.data?.id),
  });
}

export function useUpdateLoadCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoadCalculationUpdateInput) => updateLoadCalculation(id, input),
    onSuccess: () => invalidateLoadCalcs(qc, id),
  });
}

export function useSubmitLoadCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => submitLoadCalculation(id),
    onSuccess: () => invalidateLoadCalcs(qc, id),
  });
}

export function useApproveLoadCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveLoadCalculation(id),
    onSuccess: () => invalidateLoadCalcs(qc, id),
  });
}

export function useRejectLoadCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => rejectLoadCalculation(id, reason),
    onSuccess: () => invalidateLoadCalcs(qc, id),
  });
}

export function useArchiveLoadCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => archiveLoadCalculation(id),
    onSuccess: () => invalidateLoadCalcs(qc, id),
  });
}

export function useRestoreLoadCalculation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restoreLoadCalculation(id),
    onSuccess: () => invalidateLoadCalcs(qc, id),
  });
}

export function usePullConnectedLoadFromPanel() {
  return useMutation({
    mutationFn: (panelId: string) => pullConnectedLoadFromPanel(panelId),
  });
}

// ─── Equipment ──────────────────────────────────────────────────────────────────

export function useEquipment(filters?: EquipmentFilterInput) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.equipmentList(filters),
    queryFn: () => listEquipment(filters?.project_id),
    select: (r) => {
      let items = r.data ?? [];
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        items = items.filter(
          (e) =>
            e.tag.toLowerCase().includes(q) ||
            e.equipment_type.toLowerCase().includes(q) ||
            (e.location?.toLowerCase().includes(q) ?? false),
        );
      }
      if (filters?.status && filters.status !== "all") {
        items = items.filter((e) => e.status === filters.status);
      } else if (!filters?.include_archived) {
        items = items.filter((e) => e.status !== "archived");
      }
      return items;
    },
    staleTime: 60_000,
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentCreateInput) => createEquipment(input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EquipmentUpdateInput }) =>
      updateEquipment(id, input),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useArchiveEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveEquipment(id),
    onSuccess: () => invalidateEquipment(qc),
  });
}

export function useRestoreEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreEquipment(id),
    onSuccess: () => invalidateEquipment(qc),
  });
}

// ─── Overview, timeline, revisions ────────────────────────────────────────────

export function useElectricalOverviewStats() {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.overview,
    queryFn: () => getElectricalOverviewStats(),
    select: (r) => r.data,
    staleTime: 60_000,
  });
}

export function useElectricalTimeline(entityType: ElectricalEntityType, entityId: string) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.timeline(entityType, entityId),
    queryFn: () => getElectricalTimeline(entityType, entityId),
    select: (r) => r.data ?? [],
    enabled: !!entityId,
    staleTime: 60_000,
  });
}

export function useElectricalRevisions(entityType: ElectricalEntityType, entityId: string) {
  return useQuery({
    queryKey: ELECTRICAL_KEYS.revisions(entityType, entityId),
    queryFn: () => listElectricalRevisions(entityType, entityId),
    select: (r) => r.data ?? [],
    enabled: !!entityId,
    staleTime: 60_000,
  });
}
