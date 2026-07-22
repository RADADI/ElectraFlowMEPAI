/**
 * RFI view types — Phase 8
 *
 * These are the shapes consumed by UI components.  They extend raw DB rows
 * with denormalised display names and computed badge flags so the service
 * layer is the only place that knows about join aliases.
 *
 * Rule: UI pages import from here, never from database.ts directly.
 */

import type { RFIStatus, ProjectPriority, RFIResponseType } from "./database";

// ─── Primary views ────────────────────────────────────────────────────────────

export interface RFIView {
  // Raw DB columns
  id: string;
  organization_id: string;
  project_id: string;
  rfi_number: string;
  title: string;
  description: string;
  question: string | null;
  discipline: string | null;
  status: RFIStatus;
  priority: ProjectPriority;
  submitted_by: string | null;
  assigned_to: string | null;
  submitted_date: string | null;
  required_date: string | null;
  answered_date: string | null;
  cost_impact: boolean;
  schedule_impact: boolean;
  revision_number: number;
  previous_status: RFIStatus | null;
  submitted_at: string | null;
  closed_at: string | null;
  reopened_at: string | null;
  void_reason: string | null;
  client_visible: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;

  // Denormalised for display
  submitter_name: string | null;
  assignee_name: string | null;
  project_name: string | null;
  response_count: number;
}

export interface RFIResponseView {
  id: string;
  organization_id: string;
  rfi_id: string;
  respondent_id: string;
  response_text: string;
  response_type: RFIResponseType;
  attachments: string[] | null;
  responded_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;

  // Denormalised — "Former User" if profile deleted/deactivated
  responder_name: string | null;
}

export interface RFIDocumentView {
  id: string;
  rfi_id: string;
  document_id: string;
  document_title: string;
  document_status: string;
  attached_by: string | null;
  attached_by_name: string | null;
  created_at: string;
  deleted_at: string | null;
  /** True when the linked document row has been soft-deleted. */
  is_archived: boolean;
}

// ─── Input / mutation types ───────────────────────────────────────────────────

export interface RFICreateInput {
  project_id: string;
  rfi_number: string;
  title: string;
  question: string;
  discipline?: string;
  priority?: ProjectPriority;
  required_date?: string;
  cost_impact?: boolean;
  schedule_impact?: boolean;
}

export interface RFIUpdateInput {
  title?: string;
  question?: string;
  discipline?: string;
  priority?: ProjectPriority;
  required_date?: string;
  cost_impact?: boolean;
  schedule_impact?: boolean;
}

export interface RFIResponseInput {
  response_text: string;
  response_type: RFIResponseType;
}

export interface VoidRFIInput {
  void_reason: string;
  expected_revision_number: number;
}

export interface AssignRFIInput {
  profile_id: string;
  profile_name?: string;
}

export interface RFIFilterInput {
  projectId?: string;
  status?: RFIStatus | "all";
  priority?: ProjectPriority | "all";
  search?: string;
  includeArchived?: boolean;
}

// ─── Due-date / badge helpers ─────────────────────────────────────────────────

export type RFIDueBadge = "overdue" | "due_soon" | "answered_late" | "closed_late" | null;

const RESOLVED_STATUSES: RFIStatus[] = ["answered", "closed", "voided", "archived"];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Returns the highest-priority due-date badge for the given RFI.
 *   overdue       — required_date is in the past and RFI is not resolved.
 *   due_soon      — required_date is within 3 days and RFI is not resolved.
 *   answered_late — RFI was answered after its required_date.
 *   closed_late   — RFI was closed after its required_date.
 */
export function getRFIDueBadge(rfi: RFIView): RFIDueBadge {
  const now = new Date().getTime();
  const isResolved = RESOLVED_STATUSES.includes(rfi.status);
  const requiredMs = rfi.required_date ? new Date(rfi.required_date).getTime() : null;

  if (!isResolved && requiredMs !== null) {
    if (requiredMs < now) return "overdue";
    if (requiredMs - now <= THREE_DAYS_MS) return "due_soon";
  }

  if (requiredMs !== null) {
    if (rfi.answered_date) {
      const answeredMs = new Date(rfi.answered_date).getTime();
      if (answeredMs > requiredMs) {
        if (rfi.status === "closed" || rfi.closed_at) return "closed_late";
        return "answered_late";
      }
    }
    if (rfi.closed_at) {
      const closedMs = new Date(rfi.closed_at).getTime();
      if (closedMs > requiredMs) return "closed_late";
    }
  }

  return null;
}
