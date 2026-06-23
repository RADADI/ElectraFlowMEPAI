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
  | "rejected"
  | "archived";

export type ReviewAction =
  | "approved"
  | "approved_as_noted"
  | "revise_and_resubmit"
  | "rejected"
  | "for_record_only";

export type RFIStatus =
  | "draft"
  | "submitted"
  | "open"
  | "under_review"
  | "answered"
  | "closed"
  | "reopened"
  | "voided"
  | "archived"
  | "cancelled";

export type RFIResponseType = "clarification" | "answer" | "request_more_info" | "internal_note";

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
  /** Phase 7: revision counter — incremented on every revise-and-resubmit. */
  revision_number: number;
  submitted_date: string | null;
  required_date: string | null;
  /** Phase 7: date the review must be returned to the submitter. */
  review_due_date: string | null;
  returned_date: string | null;
  /** Phase 7: timestamp when the submittal reached approved / approved_as_noted. */
  approved_at: string | null;
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
  /** Legacy field kept for backward compat. New code uses equipment_name. */
  description: string;
  /** Phase 7: specification section number (e.g. "26 05 19"). */
  spec_section: string | null;
  /** Phase 7: human-readable equipment / product name. */
  equipment_name: string | null;
  quantity: number | null;
  unit: string | null;
  manufacturer: string | null;
  model_number: string | null;
  notes: string | null;
  /** Phase 7: per-item status tracking. */
  status: SubmittalStatus;
  /** Phase 7: per-item revision counter. */
  revision_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type SubmittalItemInsert = Omit<SubmittalItem, "id" | "created_at" | "updated_at">;
export type SubmittalItemUpdate = Partial<SubmittalItemInsert>;

/** Phase 7: links a submittal item to an existing project document (no file duplication). */
export interface SubmittalItemDocument {
  id: string;
  organization_id: string;
  submittal_id: string;
  submittal_item_id: string;
  document_id: string;
  attached_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type SubmittalItemDocumentInsert = Omit<SubmittalItemDocument, "id" | "created_at">;

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
  /** Legacy field; Phase 8 uses question for the actual question text. */
  description: string;
  /** Phase 8: the RFI question (backfilled from description for existing rows). */
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
  /** Phase 8: incremented on workflow mutations — optimistic-lock key. */
  revision_number: number;
  /** Phase 8: saved before archive/void so restore can return to original status. */
  previous_status: RFIStatus | null;
  submitted_at: string | null;
  closed_at: string | null;
  reopened_at: string | null;
  /** Phase 8: required when Admin voids an RFI. */
  void_reason: string | null;
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
  /** Phase 8: clarification | answer | request_more_info | internal_note */
  response_type: RFIResponseType;
  attachments: string[] | null;
  responded_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Phase 8: links an RFI to an existing project document (no file duplication). */
export interface RFIDocument {
  id: string;
  organization_id: string;
  rfi_id: string;
  document_id: string;
  attached_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type RFIDocumentInsert = Omit<RFIDocument, "id" | "created_at">;

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

export type AllocationStatus = "pending" | "active" | "on_hold" | "ended";
export type EmploymentStatus = "active" | "on_leave" | "terminated" | "contractor";

export interface Employee {
  id: string;
  organization_id: string;
  profile_id: string | null;
  employee_number: string | null;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  /** Phase 10: engineering discipline (e.g. Electrical, HVAC, Civil). */
  discipline: string | null;
  title: string | null;
  phone: string | null;
  hire_date: string | null;
  employment_type: "full_time" | "part_time" | "contractor" | "consultant";
  /** Phase 10: lifecycle status — active | on_leave | terminated | contractor. */
  employment_status: EmploymentStatus;
  /** Phase 10: standard weekly working hours for capacity calculations. */
  default_weekly_capacity_hours: number;
  /** Phase 10: target billable utilization as a percentage (0–100). */
  billable_target_percent: number | null;
  /** Phase 10: office/site location. */
  location: string | null;
  /** Phase 10: direct manager employee id. */
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
}

export type EmployeeInsert = Omit<Employee, "id" | "created_at" | "updated_at">;
export type EmployeeUpdate = Partial<EmployeeInsert>;

export interface EmployeeSkill {
  id: string;
  organization_id: string;
  employee_id: string;
  skill_name: string;
  /** Phase 10: grouping label e.g. Software, Standards, Leadership. */
  skill_category: string | null;
  proficiency_level: "beginner" | "intermediate" | "advanced" | "expert";
  years_experience: number | null;
  certified: boolean;
  last_used_date: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
}

/** Phase 10: professional certifications held by an employee. */
export interface EmployeeCertification {
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
  created_by: string | null;
  deleted_at: string | null;
}

export type EmployeeCertificationInsert = Omit<
  EmployeeCertification,
  "id" | "created_at" | "updated_at"
>;

export interface ResourceAllocation {
  id: string;
  organization_id: string;
  employee_id: string;
  project_id: string;
  role_on_project: string | null;
  allocation_percent: number;
  /** Phase 10: explicit weekly hours override (otherwise derived from allocation_percent × capacity). */
  weekly_hours: number | null;
  start_date: string;
  end_date: string | null;
  /** Phase 10: lifecycle status. */
  status: AllocationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type ResourceAllocationInsert = Omit<ResourceAllocation, "id" | "created_at" | "updated_at">;

// ─── Phase 11: Timesheets & Leave ─────────────────────────────────────────────

export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";
export type TimesheetWorkType = "regular" | "overtime" | "travel" | "training" | "admin";
export type LeaveType = "pto" | "sick" | "unpaid" | "holiday" | "bereavement" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface Timesheet {
  id: string;
  organization_id: string;
  employee_id: string;
  week_start_date: string;
  week_end_date: string;
  status: TimesheetStatus;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  unlock_reason: string | null;
  revision_number: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface TimesheetEntry {
  id: string;
  organization_id: string;
  timesheet_id: string;
  project_id: string;
  entry_date: string;
  hours: number;
  work_type: TimesheetWorkType;
  description: string | null;
  billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LeaveRequest {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

export interface Holiday {
  id: string;
  organization_id: string;
  name: string;
  holiday_date: string;
  recurring: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
}

// ─── Phase 12: Financials ─────────────────────────────────────────────────────

export type ExpenseCategory =
  | "labor"
  | "material"
  | "equipment"
  | "subcontractor"
  | "software"
  | "travel"
  | "other";

export type ExpenseStatus = "pending" | "approved" | "rejected";
export type ChangeOrderStatus = "draft" | "submitted" | "approved" | "rejected" | "voided";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "voided";
export type PaymentMethod = "bank_transfer" | "check" | "cash" | "credit_card" | "other";

export interface ProjectBudget {
  id: string;
  project_id: string;
  organization_id: string;
  total_budget: number;
  approved_changes: number;
  contingency_percent: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ProjectBudgetInsert = Omit<ProjectBudget, "id" | "created_at" | "updated_at">;
export type ProjectBudgetUpdate = Partial<ProjectBudgetInsert>;

export interface Expense {
  id: string;
  project_id: string;
  organization_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  vendor: string | null;
  reference_number: string | null;
  billable: boolean;
  status: ExpenseStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ExpenseInsert = Omit<Expense, "id" | "created_at" | "updated_at">;
export type ExpenseUpdate = Partial<ExpenseInsert>;

export interface ChangeOrder {
  id: string;
  project_id: string;
  organization_id: string;
  co_number: string;
  title: string;
  description: string | null;
  amount: number;
  status: ChangeOrderStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  void_reason: string | null;
  revision_number: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ChangeOrderInsert = Omit<ChangeOrder, "id" | "created_at" | "updated_at">;
export type ChangeOrderUpdate = Partial<ChangeOrderInsert>;

export interface Invoice {
  id: string;
  project_id: string;
  organization_id: string;
  invoice_number: string;
  title: string;
  client_name: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type InvoiceInsert = Omit<Invoice, "id" | "created_at" | "updated_at">;
export type InvoiceUpdate = Partial<InvoiceInsert>;

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  organization_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type InvoiceItemInsert = Omit<InvoiceItem, "id" | "created_at" | "updated_at">;

export interface Payment {
  id: string;
  invoice_id: string;
  project_id: string;
  organization_id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentInsert = Omit<Payment, "id" | "created_at" | "updated_at">;

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
        Insert: SubmittalItemInsert;
        Update: SubmittalItemUpdate;
      };
      submittal_item_documents: {
        Row: SubmittalItemDocument;
        Insert: SubmittalItemDocumentInsert;
        Update: Partial<SubmittalItemDocumentInsert>;
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
        Insert: Omit<RFIResponse, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<RFIResponse, "id" | "created_at">>;
      };
      rfi_documents: {
        Row: RFIDocument;
        Insert: RFIDocumentInsert;
        Update: Partial<RFIDocumentInsert>;
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
      employee_certifications: {
        Row: EmployeeCertification;
        Insert: EmployeeCertificationInsert;
        Update: Partial<EmployeeCertificationInsert>;
      };
      resource_allocations: {
        Row: ResourceAllocation;
        Insert: ResourceAllocationInsert;
        Update: Partial<ResourceAllocationInsert>;
      };
      timesheets: {
        Row: Timesheet;
        Insert: Omit<Timesheet, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Timesheet, "id" | "created_at">>;
      };
      timesheet_entries: {
        Row: TimesheetEntry;
        Insert: Omit<TimesheetEntry, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<TimesheetEntry, "id" | "created_at">>;
      };
      leave_requests: {
        Row: LeaveRequest;
        Insert: Omit<LeaveRequest, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<LeaveRequest, "id" | "created_at">>;
      };
      holidays: {
        Row: Holiday;
        Insert: Omit<Holiday, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Holiday, "id" | "created_at">>;
      };
      project_budgets: {
        Row: ProjectBudget;
        Insert: ProjectBudgetInsert;
        Update: ProjectBudgetUpdate;
      };
      expenses: {
        Row: Expense;
        Insert: ExpenseInsert;
        Update: ExpenseUpdate;
      };
      change_orders: {
        Row: ChangeOrder;
        Insert: ChangeOrderInsert;
        Update: ChangeOrderUpdate;
      };
      invoices: {
        Row: Invoice;
        Insert: InvoiceInsert;
        Update: InvoiceUpdate;
      };
      invoice_items: {
        Row: InvoiceItem;
        Insert: InvoiceItemInsert;
        Update: Partial<InvoiceItemInsert>;
      };
      payments: {
        Row: Payment;
        Insert: PaymentInsert;
        Update: Partial<PaymentInsert>;
      };
      notifications: {
        Row: Notification;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
      notification_preferences: {
        Row: NotificationPreference;
        Insert: NotificationPreferenceInsert;
        Update: NotificationPreferenceUpdate;
      };
      activity_events: {
        Row: ActivityEvent;
        Insert: ActivityEventInsert;
        Update: Partial<ActivityEventInsert>;
      };
      notification_deliveries: {
        Row: NotificationDelivery;
        Insert: Omit<NotificationDelivery, "id">;
        Update: Partial<NotificationDelivery>;
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

// ─── Phase 13: Notifications & Activity Types ─────────────────────────────────

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationCategory =
  | "project"
  | "document"
  | "submittal"
  | "rfi"
  | "ncr"
  | "resource"
  | "timesheet"
  | "financial"
  | "user"
  | "system"
  | "client"
  | "ai"
  | "report"
  | "meeting"
  | "electrical"
  | "billing";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type NotificationChannel = "in_app" | "email" | "future_webhook";

export type NotificationFrequency = "immediate" | "daily_digest" | "weekly_digest" | "disabled";

export type ActivityVisibility = "internal" | "client_visible" | "private";

export interface Notification {
  id: string;
  organization_id: string;
  recipient_profile_id: string;
  actor_profile_id: string | null;
  event_type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  priority: NotificationPriority;
  category: NotificationCategory;
  severity: NotificationSeverity;
  is_pinned: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type NotificationInsert = Omit<Notification, "id" | "created_at" | "deleted_at">;

export type NotificationUpdate = Partial<
  Pick<Notification, "read_at" | "dismissed_at" | "snoozed_until" | "is_pinned" | "deleted_at">
>;

export interface NotificationPreference {
  id: string;
  organization_id: string;
  profile_id: string;
  channel: NotificationChannel;
  event_type: string;
  enabled: boolean;
  frequency: NotificationFrequency;
  created_at: string;
  updated_at: string;
}

export type NotificationPreferenceInsert = Omit<
  NotificationPreference,
  "id" | "created_at" | "updated_at"
>;

export type NotificationPreferenceUpdate = Partial<
  Pick<NotificationPreference, "enabled" | "frequency">
>;

export interface ActivityEvent {
  id: string;
  organization_id: string;
  actor_profile_id: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  message: string;
  metadata: Record<string, unknown>;
  category: NotificationCategory;
  visibility: ActivityVisibility;
  created_at: string;
  deleted_at: string | null;
}

export type ActivityEventInsert = Omit<ActivityEvent, "id" | "created_at" | "deleted_at">;

export interface NotificationDelivery {
  id: string;
  organization_id: string;
  notification_id: string;
  channel: NotificationChannel;
  status: "pending" | "sent" | "failed" | "skipped";
  attempted_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
}
