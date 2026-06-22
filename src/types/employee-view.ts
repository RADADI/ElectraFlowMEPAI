/**
 * Employee / Resource view types — Phase 10
 *
 * These shapes are consumed by UI components. They extend raw DB rows with
 * denormalised display names, computed badges, and aggregated utilization data.
 *
 * Rule: UI pages import from here, never from database.ts directly.
 */

import type { UserRole, AllocationStatus, EmploymentStatus } from "./database";

// ─── Employee ─────────────────────────────────────────────────────────────────

export interface EmployeeView {
  // Raw DB columns
  id: string;
  organization_id: string;
  profile_id: string | null;
  employee_number: string | null;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  discipline: string | null;
  title: string | null;
  phone: string | null;
  hire_date: string | null;
  employment_type: "full_time" | "part_time" | "contractor" | "consultant";
  employment_status: EmploymentStatus;
  default_weekly_capacity_hours: number;
  billable_target_percent: number | null;
  location: string | null;
  manager_id: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  hourly_rate: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;

  // Denormalised / computed
  /** Full name of direct manager. "Former Manager" if profile deleted. */
  manager_name: string | null;
  /** Sum of active allocation_percent for the current date. */
  current_utilization_percent: number;
  /** Active project names (comma-separated for list view). */
  current_projects: string[];
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export interface EmployeeSkillView {
  id: string;
  organization_id: string;
  employee_id: string;
  skill_name: string;
  skill_category: string | null;
  proficiency_level: "beginner" | "intermediate" | "advanced" | "expert";
  years_experience: number | null;
  certified: boolean;
  last_used_date: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
}

// ─── Certifications ───────────────────────────────────────────────────────────

export type CertBadge = "expired" | "expiring_7d" | "expiring_30d" | "healthy";

export interface EmployeeCertificationView {
  id: string;
  organization_id: string;
  employee_id: string;
  certification_name: string;
  issuing_body: string | null;
  certification_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Computed from expiry_date vs today. */
  cert_badge: CertBadge;
}

/**
 * Returns the certification health badge.
 *   expired       — expiry_date < today
 *   expiring_7d   — expiry within 7 days
 *   expiring_30d  — expiry within 30 days
 *   healthy       — valid or no expiry
 */
export function getCertBadge(expiryDate: string | null): CertBadge {
  if (!expiryDate) return "healthy";
  const now = Date.now();
  const exp = new Date(expiryDate).getTime();
  const diffDays = (exp - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "expiring_7d";
  if (diffDays <= 30) return "expiring_30d";
  return "healthy";
}

// ─── Allocations ──────────────────────────────────────────────────────────────

export type AllocationOverlapWarning = "none" | "overlap" | "overbook";

export interface AllocationView {
  id: string;
  organization_id: string;
  employee_id: string;
  project_id: string;
  role_on_project: string | null;
  allocation_percent: number;
  weekly_hours: number | null;
  start_date: string;
  end_date: string | null;
  status: AllocationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;

  // Denormalised
  employee_name: string;
  project_name: string;
  /** True when the linked project row has been soft-deleted. */
  project_archived: boolean;
}

// ─── Capacity / Workload ──────────────────────────────────────────────────────

export type CapacityHealth = "healthy" | "overbooked" | "underutilized" | "unavailable";

export interface CapacityWarning {
  employee_id: string;
  employee_name: string;
  health: CapacityHealth;
  utilization_percent: number;
  billable_target_percent: number;
}

export interface WorkloadMonth {
  month: string; // e.g. "Jul 2026"
  required_hours: number; // sum of weekly_hours or derived from allocation_percent
  available_hours: number; // sum of default_weekly_capacity_hours for active employees
  utilization_pct: number; // required / available * 100
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

export interface HeatmapRow {
  employee_id: string;
  employee_name: string;
  /** Values for the next 6 months (index 0 = current month). */
  months: { label: string; percent: number }[];
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface EmployeeCreateInput {
  full_name: string;
  email: string;
  employee_number?: string;
  title?: string;
  department?: string;
  discipline?: string;
  role: UserRole;
  employment_type: "full_time" | "part_time" | "contractor" | "consultant";
  employment_status?: EmploymentStatus;
  default_weekly_capacity_hours?: number;
  billable_target_percent?: number;
  location?: string;
  manager_id?: string;
  start_date?: string;
  hire_date?: string;
  phone?: string;
  hourly_rate?: number;
  profile_id?: string;
}

export type EmployeeUpdateInput = Partial<EmployeeCreateInput>;

export interface SkillCreateInput {
  skill_name: string;
  skill_category?: string;
  proficiency_level: "beginner" | "intermediate" | "advanced" | "expert";
  years_experience?: number;
  certified?: boolean;
  last_used_date?: string;
  notes?: string;
}

export interface CertificationCreateInput {
  certification_name: string;
  issuing_body?: string;
  certification_number?: string;
  issue_date?: string;
  expiry_date?: string;
  attachment_url?: string;
}

export interface AllocationCreateInput {
  employee_id: string;
  project_id: string;
  role_on_project?: string;
  allocation_percent: number;
  weekly_hours?: number;
  start_date: string;
  end_date?: string;
  notes?: string;
  /** Admin-only override to bypass the overbooking check. */
  force?: boolean;
}

export interface AllocationUpdateInput {
  role_on_project?: string;
  allocation_percent?: number;
  weekly_hours?: number;
  start_date?: string;
  end_date?: string;
  notes?: string;
  status?: AllocationStatus;
  force?: boolean;
}

export interface EmployeeFilterInput {
  search?: string;
  department?: string;
  is_active?: boolean;
  employment_status?: EmploymentStatus;
}
