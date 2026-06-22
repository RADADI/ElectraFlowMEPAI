/**
 * Submittal view types — Phase 7
 *
 * These are the shapes consumed by UI components.  They extend the raw
 * database rows with denormalised names and computed badge flags so the
 * service layer is the only place that knows about join aliases.
 *
 * Rule: UI pages import from here, never from database.ts directly.
 */

import type { SubmittalStatus, ReviewAction } from "./database";

// ─── Primary views ────────────────────────────────────────────────────────────

export interface SubmittalView {
  // Raw DB columns
  id: string;
  organization_id: string;
  project_id: string;
  submittal_number: string;
  title: string;
  discipline: string | null;
  spec_section: string | null;
  status: SubmittalStatus;
  revision_number: number;
  submitted_date: string | null;
  required_date: string | null;
  review_due_date: string | null;
  returned_date: string | null;
  approved_at: string | null;
  submitted_by: string | null;
  reviewer_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;

  // Denormalised for display
  submitter_name: string | null;
  reviewer_name: string | null;
  project_name: string | null;
  item_count: number;
}

export interface SubmittalItemView {
  id: string;
  organization_id: string;
  submittal_id: string;
  description: string;
  spec_section: string | null;
  equipment_name: string | null;
  quantity: number | null;
  unit: string | null;
  manufacturer: string | null;
  model_number: string | null;
  notes: string | null;
  status: SubmittalStatus;
  revision_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;

  // Denormalised
  attached_document_ids: string[];
}

export interface SubmittalReviewView {
  id: string;
  organization_id: string;
  submittal_id: string;
  reviewer_id: string;
  action: ReviewAction;
  comments: string | null;
  reviewed_at: string;
  created_at: string;

  // Denormalised
  reviewer_name: string | null;
}

export interface ItemDocumentView {
  id: string;
  submittal_item_id: string;
  document_id: string;
  document_title: string;
  document_status: string;
  attached_by: string | null;
  created_at: string;
  deleted_at: string | null;
  is_archived: boolean;
}

// ─── Input / mutation types ───────────────────────────────────────────────────

export interface SubmittalCreateInput {
  project_id: string;
  submittal_number: string;
  title: string;
  discipline?: string;
  spec_section?: string;
  description?: string;
  required_date?: string;
  review_due_date?: string;
}

export interface SubmittalUpdateInput {
  title?: string;
  discipline?: string;
  spec_section?: string;
  description?: string;
  required_date?: string;
  review_due_date?: string;
}

export interface SubmittalItemInput {
  equipment_name: string;
  spec_section?: string;
  manufacturer?: string;
  model_number?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

/**
 * Input for revise-and-resubmit workflow action.
 * Both fields are required by Phase 7 spec.
 * expected_revision_number enables optimistic-lock concurrency control.
 */
export interface ReviseInput {
  change_summary: string;
  revision_notes: string;
  expected_revision_number: number;
}

export interface ReviewActionInput {
  action: "approved" | "approved_as_noted" | "rejected" | "revise_and_resubmit";
  comments?: string;
}

export interface SubmittalFilterInput {
  projectId?: string;
  status?: SubmittalStatus | "all";
  discipline?: string;
  search?: string;
  includeArchived?: boolean;
}

// ─── Due-date badge helpers ───────────────────────────────────────────────────

export type DueBadge = "overdue" | "due_soon" | "approved_late" | null;

const RESOLVED_STATUSES: SubmittalStatus[] = [
  "approved",
  "approved_as_noted",
  "rejected",
  "archived",
];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Returns the highest-priority due-date badge for the given submittal.
 *   overdue      — review_due_date is in the past and submittal is not resolved.
 *   due_soon     — review_due_date is within 3 days and submittal is not resolved.
 *   approved_late — submittal was approved after its required_date.
 */
export function getDueBadge(s: SubmittalView): DueBadge {
  const now = new Date().getTime();
  const isResolved = RESOLVED_STATUSES.includes(s.status);

  if (!isResolved && s.review_due_date) {
    const due = new Date(s.review_due_date).getTime();
    if (due < now) return "overdue";
    if (due - now <= THREE_DAYS_MS) return "due_soon";
  }

  if (s.approved_at && s.required_date) {
    const approvedMs = new Date(s.approved_at).getTime();
    const requiredMs = new Date(s.required_date).getTime();
    if (approvedMs > requiredMs) return "approved_late";
  }

  return null;
}
