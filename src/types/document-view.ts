/**
 * Document view types — Phase 6
 *
 * DocumentView is the primary type consumed by all document UI components.
 * It extends the raw Document with denormalized helper fields and version info.
 * Services return DocumentView[], never raw Document[] directly to the UI.
 */

import type { DocumentStatus, UserRole } from "@/types/database";

// ─── Core view types ──────────────────────────────────────────────────────────

export interface DocumentView {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  document_number: string | null;
  discipline: string | null;
  document_type: string | null;
  revision: string;
  status: DocumentStatus;
  storage_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  description: string | null;
  current_version_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  // Denormalized
  uploader_name: string | null;
  project_name: string | null;
  version_count: number;
}

export interface DocumentVersionView {
  id: string;
  organization_id: string;
  document_id: string;
  version_number: number;
  revision: string;
  storage_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
  uploader_name: string | null;
}

export interface DocumentApprovalView {
  id: string;
  organization_id: string;
  document_id: string;
  approver_id: string;
  action: "approved" | "rejected" | "requested_changes";
  comments: string | null;
  approved_at: string;
  created_at: string;
  approver_name: string | null;
  approver_role: UserRole | null;
}

export interface DocumentShareView {
  id: string;
  document_id: string;
  shared_with_profile_id: string;
  shared_by: string;
  expires_at: string | null;
  created_at: string;
  shared_with_name: string | null;
  shared_with_email: string | null;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface DocumentUploadInput {
  title: string;
  document_number?: string;
  discipline?: string;
  document_type?: string;
  revision?: string;
  description?: string;
  project_id?: string;
}

export interface DocumentVersionInput {
  change_summary?: string;
  revision?: string;
  /** Optimistic-lock check — must equal documents.current_version_number at upload time. */
  expected_version_number: number;
}

export interface DocumentFilterInput {
  projectId?: string;
  status?: DocumentStatus | "all";
  discipline?: string;
  search?: string;
  includeArchived?: boolean;
}
