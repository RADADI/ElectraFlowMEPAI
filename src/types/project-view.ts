/**
 * ProjectView — the canonical shape consumed by all project UI.
 *
 * Extends the database Project type with denormalized display fields that come
 * from JOINs in Supabase (clients + profiles tables) or from the raw mock
 * dummy-data fields (client, pm, engineers).
 *
 * Rule: pages/components NEVER import from dummy-data directly.
 * They receive ProjectView from the service layer via React Query hooks.
 */

import type { Project } from "@/types/database";

export interface ProjectView extends Project {
  /** Denormalized from clients.name JOIN or mock raw.client */
  client_name: string | null;
  /** Denormalized from profiles.full_name JOIN on pm_id or mock raw.pm */
  pm_name: string | null;
}

// ─── Member & Milestone view types (read-only, Phase 4) ─────────────────────

/** Simplified team member shape for the project detail Team tab. */
export interface ProjectMemberView {
  id: string;
  name: string;
  role: string;
  utilization_percent: number;
  status: string;
}

/** Simplified milestone shape for the project detail Schedule tab. */
export interface ProjectMilestoneView {
  id: string;
  name: string;
  due_date: string | null;
  completed_date: string | null;
  is_done: boolean;
}

// ─── Input types used by the create/edit form ────────────────────────────────

/**
 * Payload accepted by createProject() and updateProject() service methods.
 * Includes human-readable client_name and pm_name so the form can collect
 * them as text in Phase 4 (before client/profile lookup UIs exist in Phase 5).
 */
export interface ProjectCreateInput {
  project_number: string;
  name: string;
  description?: string | null;
  client_name?: string | null;
  pm_name?: string | null;
  location?: string | null;
  discipline?: string | null;
  status?: ProjectView["status"];
  priority?: ProjectView["priority"];
  risk_level?: ProjectView["risk_level"];
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
}

export type ProjectUpdateInput = Partial<ProjectCreateInput>;
