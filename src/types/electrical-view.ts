/**
 * Phase 15B: Electrical UI view types
 */

import type {
  PanelSchedule,
  ElectricalWorkflowStatus,
  CircuitSide,
  LoadCalculationType,
  EquipmentStatus,
  ElectricalRevision,
  LoadCalculation,
} from "./database";

export type { ElectricalWorkflowStatus, CircuitSide, LoadCalculationType, EquipmentStatus };

export interface PanelListItemView {
  id: string;
  organization_id: string;
  project_id: string;
  project_name: string | null;
  panel_name: string;
  panel_type: string;
  voltage: number;
  phase: "single" | "three";
  location: string | null;
  status: ElectricalWorkflowStatus;
  revision_number: number;
  circuit_count: number;
  total_connected_load_va: number;
  warning_count: number;
  created_by_name: string | null;
  updated_at: string;
}

export interface PanelView extends PanelSchedule {
  project_name: string | null;
  created_by_name: string | null;
  total_connected_load_va: number;
  is_read_only: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_approve: boolean;
  can_reject: boolean;
  can_archive: boolean;
  can_restore: boolean;
  can_reopen: boolean;
}

export interface CircuitView {
  id: string;
  organization_id: string;
  panel_schedule_id: string;
  circuit_number: string;
  circuit_side: CircuitSide;
  description: string | null;
  load_va: number;
  breaker_size: number | null;
  poles: number | null;
  phase: string | null;
  wire_size: string | null;
  conduit_size: string | null;
  voltage: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  warnings: ElectricalWarning[];
}

export interface PanelLoadSummaryView {
  total_connected_load_va: number;
  phase_loads: Record<string, number>;
  warnings: ElectricalWarning[];
  circuit_count: number;
}

export interface LoadCalculationListItemView {
  id: string;
  project_id: string;
  project_name: string | null;
  calculation_name: string;
  calculation_type: LoadCalculationType;
  status: ElectricalWorkflowStatus;
  revision_number: number;
  total_connected_load_va: number;
  demand_factor: number;
  demand_load_va: number | null;
  calculated_current_a: number | null;
  preview_demand_load_va: number;
  preview_current_a: number | null;
  is_stale_panel_snapshot: boolean;
  updated_at: string;
}

export interface LoadCalculationView extends LoadCalculation {
  project_name: string | null;
  source_panel_name: string | null;
  preview_demand_load_va: number;
  preview_current_a: number | null;
  is_read_only: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_approve: boolean;
  can_reject: boolean;
  is_stale_panel_snapshot: boolean;
}

export interface EquipmentView {
  id: string;
  organization_id: string;
  project_id: string;
  project_name: string | null;
  tag: string;
  equipment_type: string;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  voltage: number | null;
  phase: "single" | "three" | null;
  load_va: number;
  location: string | null;
  status: EquipmentStatus;
  created_at: string;
  updated_at: string;
}

export interface ElectricalOverviewStats {
  panel_count: number;
  approved_panel_count: number;
  open_review_count: number;
  total_connected_load_va: number;
  equipment_count: number;
  warning_count: number;
}

export interface ElectricalWarning {
  code: string;
  message: string;
  severity: "info" | "warning";
}

export interface ElectricalRevisionView extends ElectricalRevision {
  changed_by_name: string | null;
}

export interface PanelFilterInput {
  status?: ElectricalWorkflowStatus | "all";
  project_id?: string;
  search?: string;
  include_archived?: boolean;
  cursor?: string;
  limit?: number;
}

export interface PanelCreateInput {
  project_id: string;
  panel_name: string;
  panel_type?: string;
  voltage?: number;
  phase?: "single" | "three";
  location?: string | null;
  fed_from?: string | null;
  main_breaker_size?: number | null;
  bus_rating?: number | null;
  mounting?: string | null;
  enclosure_type?: string | null;
}

export type PanelUpdateInput = Partial<Omit<PanelCreateInput, "project_id">>;

export interface CircuitCreateInput {
  circuit_number: string;
  circuit_side?: CircuitSide;
  description?: string | null;
  load_va?: number;
  breaker_size?: number | null;
  poles?: number | null;
  phase?: string | null;
  wire_size?: string | null;
  conduit_size?: string | null;
  voltage?: number | null;
  remarks?: string | null;
}

export type CircuitUpdateInput = Partial<CircuitCreateInput>;

export interface LoadCalculationCreateInput {
  project_id: string;
  calculation_name: string;
  calculation_type?: LoadCalculationType;
  source_panel_id?: string | null;
  total_connected_load_va?: number;
  demand_factor?: number;
  voltage?: number;
  phase?: "single" | "three";
}

export type LoadCalculationUpdateInput = Partial<Omit<LoadCalculationCreateInput, "project_id">>;

export interface EquipmentCreateInput {
  project_id: string;
  tag: string;
  equipment_type?: string;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  voltage?: number | null;
  phase?: "single" | "three" | null;
  load_va?: number;
  location?: string | null;
}

export type EquipmentUpdateInput = Partial<Omit<EquipmentCreateInput, "project_id">>;

export type ElectricalTimelineItem = {
  id: string;
  source: "audit" | "activity" | "revision";
  created_at: string;
  actor_name: string;
  title: string;
  message: string | null;
};

export const ELECTRICAL_STATUS_LABEL: Record<ElectricalWorkflowStatus, string> = {
  draft: "Draft",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

export const ELECTRICAL_STATUS_CLASS: Record<ElectricalWorkflowStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  under_review: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-600",
};

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export function isPanelEditable(status: ElectricalWorkflowStatus): boolean {
  return status === "draft" || status === "rejected";
}

export function isUnderReviewReadOnly(status: ElectricalWorkflowStatus): boolean {
  return status === "under_review" || status === "approved" || status === "archived";
}
