/**
 * Client Portal view types — Phase 15D
 *
 * Client-safe DTOs consumed by portal UI. Never include internal fields such as
 * storage_path, internal_note, reviewer comments, or draft statuses.
 */

import type { ClientPortalTab, InvoiceStatus } from "./database";

export type { ClientPortalTab };

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface ClientPortalCounts {
  documents: number;
  rfis: number;
  submittals: number;
  invoices: number;
  activity: number;
  meetings: number;
  downloads: number;
}

export interface ClientPortalDashboard {
  client_name: string | null;
  counts: ClientPortalCounts;
  recent_documents: ClientDocumentView[];
  recent_rfis: ClientRFIView[];
  recent_submittals: ClientSubmittalView[];
  recent_invoices: ClientInvoiceView[];
  recent_activity: ClientActivityView[];
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface ClientDocumentView {
  id: string;
  title: string;
  document_number: string | null;
  discipline: string | null;
  document_type: string | null;
  revision: string | null;
  status: string;
  project_id: string | null;
  project_name: string | null;
  file_name: string | null;
  shared_at: string;
  shared_by_name: string | null;
  share_expires_at: string | null;
}

// ─── RFI ──────────────────────────────────────────────────────────────────────

export interface ClientRFIView {
  id: string;
  rfi_number: string;
  title: string;
  status: string;
  priority: string;
  project_id: string;
  project_name: string | null;
  required_date: string | null;
  latest_response_excerpt: string | null;
  latest_response_at: string | null;
}

export interface ClientRFIDetailView extends ClientRFIView {
  question: string | null;
  discipline: string | null;
  submitted_date: string | null;
  answered_date: string | null;
  responses: ClientRFIResponseView[];
}

export interface ClientRFIResponseView {
  id: string;
  response_text: string;
  response_type: string;
  respondent_name: string | null;
  created_at: string;
}

// ─── Submittals ───────────────────────────────────────────────────────────────

export interface ClientSubmittalView {
  id: string;
  submittal_number: string;
  title: string;
  status: string;
  discipline: string | null;
  project_id: string;
  project_name: string | null;
  submitted_date: string | null;
  approved_at: string | null;
  required_date: string | null;
  outcome_label: string;
}

export interface ClientSubmittalDetailView extends ClientSubmittalView {
  spec_section: string | null;
  description: string | null;
  revision_number: number;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface ClientInvoiceView {
  id: string;
  invoice_number: string;
  title: string;
  status: InvoiceStatus;
  project_id: string;
  project_name: string | null;
  issue_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  is_overdue: boolean;
}

export interface ClientInvoiceItemView {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface ClientPaymentView {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference_number: string | null;
}

export interface ClientInvoiceDetailView extends ClientInvoiceView {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  notes: string | null;
  items: ClientInvoiceItemView[];
  payments: ClientPaymentView[];
}

// ─── Activity & meetings ──────────────────────────────────────────────────────

export interface ClientActivityView {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  message: string;
  category: string;
  created_at: string;
  link_available: boolean;
}

export interface ClientMeetingView {
  id: string;
  title: string;
  meeting_type: string;
  status: string;
  project_id: string | null;
  project_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  location: string | null;
  video_link: string | null;
}

// ─── Downloads ────────────────────────────────────────────────────────────────

export interface ClientDownloadView {
  id: string;
  entity_type: "document" | "invoice" | "report" | "other";
  entity_id: string;
  title: string;
  file_name: string;
  project_name: string | null;
  downloaded_at: string | null;
  can_download: boolean;
}

export interface ClientDownloadResult {
  signed_url: string | null;
  file_name: string;
  is_demo: boolean;
}

// ─── Announcements & preferences ─────────────────────────────────────────────

export interface ClientAnnouncementView {
  id: string;
  title: string;
  message: string;
  starts_at: string;
  ends_at: string | null;
}

export interface ClientPortalPreferencesView {
  default_tab: ClientPortalTab;
  notification_opt_in: boolean;
}

export interface ClientPortalPreferencesInput {
  default_tab?: ClientPortalTab;
  notification_opt_in?: boolean;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ClientPortalListOptions {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

// ─── Portal nav ───────────────────────────────────────────────────────────────

export const CLIENT_PORTAL_TABS: {
  key: ClientPortalTab;
  label: string;
  href: string;
}[] = [
  { key: "dashboard", label: "Dashboard", href: "/client-portal" },
  { key: "documents", label: "Documents", href: "/client-portal/documents" },
  { key: "rfi", label: "RFI", href: "/client-portal/rfi" },
  { key: "submittals", label: "Submittals", href: "/client-portal/submittals" },
  { key: "invoices", label: "Invoices", href: "/client-portal/invoices" },
  { key: "activity", label: "Activity", href: "/client-portal/activity" },
  { key: "meetings", label: "Meetings", href: "/client-portal/meetings" },
  { key: "downloads", label: "Downloads", href: "/client-portal/downloads" },
];

export function isClientPortalPreviewRole(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase() === "admin";
}

export function submittalOutcomeLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "approved_as_noted":
      return "Approved as Noted";
    default:
      return status.replace(/_/g, " ");
  }
}
