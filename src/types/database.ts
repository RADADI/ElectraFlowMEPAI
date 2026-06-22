/**
 * TypeScript types for the ElectraFlow AI database — Phase 3
 *
 * These types mirror the schema in src/database/schema.sql.
 * The `Database` interface is the generic parameter consumed by the Supabase
 * client so every query is fully typed end-to-end.
 *
 * Naming convention:
 *   Row   — the shape of a SELECT result row
 *   Insert — fields accepted by INSERT (generated columns omitted)
 *   Update — all Insert fields made optional for PATCH-style updates
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole =
  | "admin"
  | "project_manager"
  | "senior_electrical_engineer"
  | "electrical_engineer"
  | "qa_qc_engineer"
  | "hr"
  | "executive"
  | "client";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

export type ProjectPriority = "low" | "medium" | "high" | "critical";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type DocumentStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "rejected"
  | "superseded"
  | "archived";

export type SubmittalStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "approved_as_noted"
  | "revise_and_resubmit"
  | "rejected";

export type ReviewAction =
  | "approved"
  | "approved_as_noted"
  | "revise_and_resubmit"
  | "rejected"
  | "for_record_only";

export type RFIStatus = "open" | "under_review" | "answered" | "closed" | "cancelled";

export type NCRStatus =
  | "open"
  | "under_review"
  | "action_required"
  | "resolved"
  | "closed"
  | "voided";

export type MilestoneStatus = "pending" | "in_progress" | "completed" | "delayed";

export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export type ApprovalAction = "approved" | "rejected" | "requested_changes";

// ─── Core SaaS ────────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  logo_url: string | null;
  website: string | null;
  industry: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type OrganizationInsert = Omit<Organization, "id" | "created_at" | "updated_at">;
export type OrganizationUpdate = Partial<OrganizationInsert>;

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  title: string | null;
  department: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  onboarding_done: boolean;
  /** Added by Phase 5 migration — links Clerk identity to this profile row. */
  clerk_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ProfileInsert = Omit<Profile, "id" | "created_at" | "updated_at">;
export type ProfileUpdate = Partial<ProfileInsert>;

export interface OrganizationMember {
  id: string;
  organization_id: string;
  profile_id: string;
  role: UserRole;
  joined_at: string;
  invited_by: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  /** SHA-256 hex hash of the raw invite token.  Raw token is NEVER stored. */
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  /** Clerk user ID of whoever accepted the invite. */
  accepted_by_clerk_id: string | null;
  created_at: string;
  updated_at: string;
}

export type InvitationInsert = Omit<
  Invitation,
  "id" | "created_at" | "updated_at" | "accepted_at" | "accepted_by_clerk_id"
>;

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export type AuditLogInsert = Omit<AuditLog, "id" | "created_at">;

// ─── Clients & Projects ───────────────────────────────────────────────────────

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type ClientInsert = Omit<Client, "id" | "created_at" | "updated_at">;
export type ClientUpdate = Partial<ClientInsert>;

export interface Project {
  id: string;
  organization_id: string;
  project_number: string;
  name: string;
  description: string | null;
  client_id: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  risk_level: RiskLevel;
  location: string | null;
  discipline: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  progress_percent: number;
  pm_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type ProjectInsert = Omit<Project, "id" | "created_at" | "updated_at">;
export type ProjectUpdate = Partial<ProjectInsert>;

export interface ProjectMember {
  id: string;
  organization_id: string;
  project_id: string;
  profile_id: string;
  role: UserRole;
  assigned_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectMilestone {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  completed_date: string | null;
  status: MilestoneStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type ProjectMilestoneInsert = Omit<ProjectMilestone, "id" | "created_at" | "updated_at">;

// ─── Documents ────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  organization_id: string;
  project_id: string | null;
  title: string;
  document_number: string | null;
  discipline: string | null;
  document_type: string | null;
  revision: string;
  status: DocumentStatus;
  /** @deprecated Use storage_path. Kept for Phase 3 backwards compat. */
  file_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  description: string | null;
  /** Supabase Storage path — use storage.service to generate signed URLs. */
  storage_path: string | null;
  /** Original sanitized filename at upload time. */
  file_name: string | null;
  /** Optimistic-lock counter incremented on each new version upload. */
  current_version_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type DocumentInsert = Omit<Document, "id" | "created_at" | "updated_at">;
export type DocumentUpdate = Partial<DocumentInsert>;

export interface DocumentVersion {
  id: string;
  organization_id: string;
  document_id: string;
  version_number: number;
  revision: string;
  /** @deprecated Use storage_path. */
  file_url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface DocumentApproval {
  id: string;
  organization_id: string;
  document_id: string;
  approver_id: string;
  action: ApprovalAction;
  comments: string | null;
  approved_at: string;
  created_at: string;
}

// ─── Submittals ───────────────────────────────────────────────────────────────

export interface Submittal {
  id: string;
  organization_id: string;
  project_id: string;
  submittal_number: string;
  title: string;
  discipline: string | null;
  spec_section: string | null;
  status: SubmittalStatus;
  submitted_date: string | null;
  required_date: string | null;
  returned_date: string | null;
  submitted_by: string | null;
  reviewer_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type SubmittalInsert = Omit<Submittal, "id" | "created_at" | "updated_at">;
export type SubmittalUpdate = Partial<SubmittalInsert>;

export interface SubmittalItem {
  id: string;
  organization_id: string;
  submittal_id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  manufacturer: string | null;
  model_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SubmittalReview {
  id: string;
  organization_id: string;
  submittal_id: string;
  reviewer_id: string;
  action: ReviewAction;
  comments: string | null;
  reviewed_at: string;
  created_at: string;
}

// ─── RFI ─────────────────────────────────────────────────────────────────────

export interface RFI {
  id: string;
  organization_id: string;
  project_id: string;
  rfi_number: string;
  title: string;
  description: string;
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
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type RFIInsert = Omit<RFI, "id" | "created_at" | "updated_at">;
export type RFIUpdate = Partial<RFIInsert>;

export interface RFIResponse {
  id: string;
  organization_id: string;
  rfi_id: string;
  respondent_id: string;
  response_text: string;
  attachments: string[] | null;
  responded_at: string;
  created_at: string;
  deleted_at: string | null;
}

// ─── NCR ─────────────────────────────────────────────────────────────────────

export interface NCR {
  id: string;
  organization_id: string;
  project_id: string;
  ncr_number: string;
  title: string;
  description: string;
  discipline: string | null;
  status: NCRStatus;
  severity: RiskLevel;
  raised_by: string | null;
  assigned_to: string | null;
  raised_date: string | null;
  due_date: string | null;
  closed_date: string | null;
  root_cause: string | null;
  corrective_action: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type NCRInsert = Omit<NCR, "id" | "created_at" | "updated_at">;
export type NCRUpdate = Partial<NCRInsert>;

export interface NCRAction {
  id: string;
  organization_id: string;
  ncr_id: string;
  action_type: "corrective" | "preventive" | "observation";
  description: string;
  assigned_to: string | null;
  due_date: string | null;
  completed_date: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

// ─── Document Shares ──────────────────────────────────────────────────────────

export interface DocumentShare {
  id: string;
  organization_id: string;
  document_id: string;
  shared_with_profile_id: string;
  shared_by: string;
  expires_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type DocumentShareInsert = Omit<DocumentShare, "id" | "created_at">;

// ─── Upload Sessions ──────────────────────────────────────────────────────────

export type UploadSessionStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface UploadSession {
  id: string;
  organization_id: string;
  user_id: string;
  document_id: string | null;
  status: UploadSessionStatus;
  progress_percent: number;
  storage_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Employees / Resources ────────────────────────────────────────────────────

export interface Employee {
  id: string;
  organization_id: string;
  profile_id: string | null;
  employee_number: string | null;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  title: string | null;
  phone: string | null;
  hire_date: string | null;
  employment_type: "full_time" | "part_time" | "contractor" | "consultant";
  is_active: boolean;
  hourly_rate: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type EmployeeInsert = Omit<Employee, "id" | "created_at" | "updated_at">;
export type EmployeeUpdate = Partial<EmployeeInsert>;

export interface EmployeeSkill {
  id: string;
  organization_id: string;
  employee_id: string;
  skill_name: string;
  proficiency_level: "beginner" | "intermediate" | "advanced" | "expert";
  years_experience: number | null;
  certified: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface ResourceAllocation {
  id: string;
  organization_id: string;
  employee_id: string;
  project_id: string;
  role_on_project: string | null;
  allocation_percent: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type ResourceAllocationInsert = Omit<ResourceAllocation, "id" | "created_at" | "updated_at">;

// ─── Supabase Database interface ──────────────────────────────────────────────
// This is the generic type parameter for createClient<Database>().
// Each table maps to its Row / Insert / Update tuple.

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: OrganizationInsert;
        Update: OrganizationUpdate;
      };
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Omit<OrganizationMember, "id" | "created_at">;
        Update: Partial<Omit<OrganizationMember, "id" | "created_at">>;
      };
      invitations: {
        Row: Invitation;
        Insert: InvitationInsert;
        Update: Partial<InvitationInsert>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: AuditLogInsert;
        Update: never;
      };
      clients: {
        Row: Client;
        Insert: ClientInsert;
        Update: ClientUpdate;
      };
      projects: {
        Row: Project;
        Insert: ProjectInsert;
        Update: ProjectUpdate;
      };
      project_members: {
        Row: ProjectMember;
        Insert: Omit<ProjectMember, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ProjectMember, "id" | "created_at">>;
      };
      project_milestones: {
        Row: ProjectMilestone;
        Insert: ProjectMilestoneInsert;
        Update: Partial<ProjectMilestoneInsert>;
      };
      documents: {
        Row: Document;
        Insert: DocumentInsert;
        Update: DocumentUpdate;
      };
      document_versions: {
        Row: DocumentVersion;
        Insert: Omit<DocumentVersion, "id" | "created_at">;
        Update: never;
      };
      document_approvals: {
        Row: DocumentApproval;
        Insert: Omit<DocumentApproval, "id" | "created_at">;
        Update: never;
      };
      document_shares: {
        Row: DocumentShare;
        Insert: DocumentShareInsert;
        Update: Partial<DocumentShareInsert>;
      };
      upload_sessions: {
        Row: UploadSession;
        Insert: Omit<UploadSession, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<UploadSession, "id" | "created_at">>;
      };
      submittals: {
        Row: Submittal;
        Insert: SubmittalInsert;
        Update: SubmittalUpdate;
      };
      submittal_items: {
        Row: SubmittalItem;
        Insert: Omit<SubmittalItem, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<SubmittalItem, "id" | "created_at">>;
      };
      submittal_reviews: {
        Row: SubmittalReview;
        Insert: Omit<SubmittalReview, "id" | "created_at">;
        Update: never;
      };
      rfi: {
        Row: RFI;
        Insert: RFIInsert;
        Update: RFIUpdate;
      };
      rfi_responses: {
        Row: RFIResponse;
        Insert: Omit<RFIResponse, "id" | "created_at">;
        Update: never;
      };
      ncr: {
        Row: NCR;
        Insert: NCRInsert;
        Update: NCRUpdate;
      };
      ncr_actions: {
        Row: NCRAction;
        Insert: Omit<NCRAction, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<NCRAction, "id" | "created_at">>;
      };
      employees: {
        Row: Employee;
        Insert: EmployeeInsert;
        Update: EmployeeUpdate;
      };
      employee_skills: {
        Row: EmployeeSkill;
        Insert: Omit<EmployeeSkill, "id" | "created_at">;
        Update: Partial<Omit<EmployeeSkill, "id" | "created_at">>;
      };
      resource_allocations: {
        Row: ResourceAllocation;
        Insert: ResourceAllocationInsert;
        Update: Partial<ResourceAllocationInsert>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      project_status: ProjectStatus;
      project_priority: ProjectPriority;
      risk_level: RiskLevel;
      document_status: DocumentStatus;
      submittal_status: SubmittalStatus;
      review_action: ReviewAction;
      rfi_status: RFIStatus;
      ncr_status: NCRStatus;
    };
  };
}
