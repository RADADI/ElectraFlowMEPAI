/**
 * Client Portal service — Phase 15D
 *
 * All portal reads go through this service. Every function applies client scope
 * regardless of caller role (Admin preview uses the same filters).
 *
 * Mock fallback: scoped like production — only shared / client_visible records.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext, getCurrentUserId } from "@/lib/auth-bridge";
import { downloadDocument } from "@/services/document.service";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import {
  documents as DUMMY_DOCS,
  dummyDocumentShares,
  dummyClientPortalAnnouncements,
  dummyClientPortalRFIs,
  dummyClientPortalSubmittals,
  dummyClientRFIResponses,
  dummyClientDownloadLogs,
  dummyInvoices,
  dummyActivityEvents,
  dummyMeetings,
  dummyMeetingAttendees,
  MOCK_PROFILE_IDS,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_NAME,
  MOCK_CLIENT_PROJECT_IDS,
  MOCK_PROFILE_NAMES,
  projects as MOCK_PROJECTS,
} from "@/lib/dummy-data";
import type {
  ClientPortalDashboard,
  ClientDocumentView,
  ClientRFIView,
  ClientRFIDetailView,
  ClientSubmittalView,
  ClientSubmittalDetailView,
  ClientInvoiceView,
  ClientInvoiceDetailView,
  ClientActivityView,
  ClientMeetingView,
  ClientDownloadView,
  ClientDownloadResult,
  ClientAnnouncementView,
  ClientPortalPreferencesView,
  ClientPortalPreferencesInput,
  ClientPortalListOptions,
} from "@/types/client-portal-view";
import { submittalOutcomeLabel as outcomeLabel } from "@/types/client-portal-view";
import type { ClientPortalPreferences, ClientDownloadLog, InvoiceStatus } from "@/types/database";
import { encodeCursor, decodeCursor, type CursorPage } from "@/types/notification-view";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const MOCK_PREFS_KEY = "mep-client-portal-prefs";
const MOCK_DOWNLOADS_KEY = "mep-client-portal-downloads";

const CLIENT_INVOICE_STATUSES: InvoiceStatus[] = ["sent", "paid", "overdue"];

// ─── Routing ──────────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] JWT not ready — using mock client portal.");
    return false;
  }
  return true;
}

function norm(role: string | null | undefined): string {
  return (role ?? "").toLowerCase().replace(/ /g, "_");
}

/** Client scope used for all portal queries (Client users + Admin preview). */
async function resolveClientScope(): Promise<{
  clientId: string | null;
  profileId: string | null;
  organizationId: string | null;
  isPreview: boolean;
}> {
  const { userId, organizationId, role } = getSessionContext();
  const isPreview = norm(role) === "admin";

  if (!shouldUseSupabase()) {
    return {
      clientId: MOCK_CLIENT_ID,
      profileId: userId ?? MOCK_PROFILE_IDS.client,
      organizationId: organizationId ?? "mock-org",
      isPreview,
    };
  }

  if (!userId) {
    return { clientId: null, profileId: null, organizationId: null, isPreview };
  }

  const { data: profile } = await supabase!
    .from("profiles")
    .select("client_id")
    .eq("id", userId)
    .single();

  let clientId = (profile as { client_id: string | null } | null)?.client_id ?? null;

  // Admin preview: use their client_id if set, otherwise first client in org
  if (isPreview && !clientId && organizationId) {
    const { data: clients } = await supabase!
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .limit(1);
    clientId = (clients?.[0] as { id: string } | undefined)?.id ?? null;
  }

  return { clientId, profileId: userId, organizationId: organizationId ?? null, isPreview };
}

function paginate<T extends { id: string }>(
  items: T[],
  cursor: string | undefined,
  limit: number,
  sortKey?: keyof T,
): CursorPage<T> {
  const sorted = [...items].sort((a, b) => {
    const av = sortKey ? String(a[sortKey] ?? a.id) : a.id;
    const bv = sortKey ? String(b[sortKey] ?? b.id) : b.id;
    return bv.localeCompare(av);
  });

  let start = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const idx = sorted.findIndex((i) => i.id === decoded.id);
      start = idx >= 0 ? idx + 1 : 0;
    }
  }

  const slice = sorted.slice(start, start + limit);
  const last = slice[slice.length - 1];
  const sortVal = last ? (sortKey ? String(last[sortKey] ?? last.id) : last.id) : null;
  const next_cursor =
    start + limit < sorted.length && last && sortVal ? encodeCursor(sortVal, last.id) : null;

  return { items: slice, next_cursor };
}

// ─── Mock document helpers ─────────────────────────────────────────────────────

function getMockSharedDocuments(profileId: string): ClientDocumentView[] {
  const shares = dummyDocumentShares.filter(
    (s) =>
      s.shared_with_profile_id === profileId &&
      !s.deleted_at &&
      (!s.expires_at || new Date(s.expires_at) > new Date()),
  );

  return shares
    .map((share) => {
      const raw = DUMMY_DOCS.find((d) => d.id === share.document_id);
      if (!raw || raw.status !== "Approved") return null;
      const project = MOCK_PROJECTS.find((p) => p.id === "p1");
      return {
        id: raw.id,
        title: raw.name,
        document_number: null,
        discipline: raw.discipline ?? null,
        document_type: raw.type ?? null,
        revision: raw.version ?? null,
        status: "approved",
        project_id: "p1",
        project_name: project?.name ?? raw.project ?? null,
        file_name: raw.name,
        shared_at: share.created_at,
        shared_by_name: MOCK_PROFILE_NAMES[share.shared_by] ?? null,
        share_expires_at: share.expires_at,
      } satisfies ClientDocumentView;
    })
    .filter(Boolean) as ClientDocumentView[];
}

function getMockClientInvoices(): ClientInvoiceView[] {
  return dummyInvoices
    .filter(
      (inv) =>
        MOCK_CLIENT_PROJECT_IDS.includes(
          inv.project_id as (typeof MOCK_CLIENT_PROJECT_IDS)[number],
        ) && CLIENT_INVOICE_STATUSES.includes(inv.status as InvoiceStatus),
    )
    .map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      title: inv.title,
      status: inv.status as InvoiceStatus,
      project_id: inv.project_id,
      project_name: inv.project_name,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total_amount: inv.total_amount,
      paid_amount: inv.paid_amount,
      outstanding_amount: inv.outstanding_amount,
      is_overdue: inv.is_overdue,
    }));
}

function getMockClientMeetings(profileId: string): ClientMeetingView[] {
  const attendeeMeetingIds = new Set(
    dummyMeetingAttendees
      .filter((a) => a.profile_id === profileId && !a.deleted_at)
      .map((a) => a.meeting_id),
  );

  return dummyMeetings
    .filter(
      (m) =>
        m.visibility === "client_visible" &&
        !m.deleted_at &&
        attendeeMeetingIds.has(m.id) &&
        (m.status as string) !== "draft",
    )
    .map((m) => {
      const project = MOCK_PROJECTS.find((p) => p.id === m.project_id);
      return {
        id: m.id,
        title: m.title,
        meeting_type: m.meeting_type,
        status: m.status,
        project_id: m.project_id,
        project_name: project?.name ?? null,
        scheduled_start: m.scheduled_start,
        scheduled_end: m.scheduled_end,
        location: m.location,
        video_link: m.video_link,
      };
    });
}

function getMockDownloadLogs(profileId: string): ClientDownloadLog[] {
  try {
    const raw = sessionStorage.getItem(MOCK_DOWNLOADS_KEY);
    const stored: ClientDownloadLog[] = raw ? JSON.parse(raw) : [];
    return [...stored, ...dummyClientDownloadLogs.filter((l) => l.profile_id === profileId)];
  } catch {
    return dummyClientDownloadLogs.filter((l) => l.profile_id === profileId);
  }
}

function saveMockDownloadLog(entry: ClientDownloadLog): void {
  try {
    const raw = sessionStorage.getItem(MOCK_DOWNLOADS_KEY);
    const stored: ClientDownloadLog[] = raw ? JSON.parse(raw) : [];
    sessionStorage.setItem(MOCK_DOWNLOADS_KEY, JSON.stringify([entry, ...stored]));
  } catch {
    /* storage unavailable */
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getClientDashboard(): Promise<ServiceResult<ClientPortalDashboard>> {
  const scope = await resolveClientScope();

  const [docs, rfis, subs, invs, activity, meetings, downloads] = await Promise.all([
    listClientDocuments({ limit: 100 }),
    listClientRFIs({ limit: 100 }),
    listClientSubmittals({ limit: 100 }),
    listClientInvoices({ limit: 100 }),
    listClientActivity({ limit: 100 }),
    listClientMeetings({ limit: 100 }),
    listClientDownloads({ limit: 100 }),
  ]);

  const clientName = !shouldUseSupabase()
    ? MOCK_CLIENT_NAME
    : scope.clientId
      ? MOCK_CLIENT_NAME
      : null;

  return ok({
    client_name: clientName,
    counts: {
      documents: docs.data?.items.length ?? 0,
      rfis: rfis.data?.items.length ?? 0,
      submittals: subs.data?.items.length ?? 0,
      invoices: invs.data?.items.length ?? 0,
      activity: activity.data?.items.length ?? 0,
      meetings: meetings.data?.items.length ?? 0,
      downloads: downloads.data?.items.length ?? 0,
    },
    recent_documents: (docs.data?.items ?? []).slice(0, 5),
    recent_rfis: (rfis.data?.items ?? []).slice(0, 5),
    recent_submittals: (subs.data?.items ?? []).slice(0, 5),
    recent_invoices: (invs.data?.items ?? []).slice(0, 5),
    recent_activity: (activity.data?.items ?? []).slice(0, 5),
  });
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function listClientDocuments(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientDocumentView>>> {
  const scope = await resolveClientScope();
  const limit = opts.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    const profileId = scope.profileId ?? MOCK_PROFILE_IDS.client;
    let items = getMockSharedDocuments(profileId);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(
        (d) =>
          d.title.toLowerCase().includes(q) || (d.project_name ?? "").toLowerCase().includes(q),
      );
    }
    return mockOk(paginate(items, opts.cursor, limit, "shared_at"));
  }

  if (!scope.profileId || !scope.organizationId) {
    return fail<CursorPage<ClientDocumentView>>("No active session.");
  }

  try {
    const { data, error } = await supabase!
      .from("document_shares")
      .select(
        `
        created_at, expires_at,
        sharer:profiles!shared_by(full_name),
        document:documents!inner(
          id, title, document_number, discipline, document_type, revision,
          status, project_id, file_name, deleted_at,
          project:projects(name)
        )
      `,
      )
      .eq("organization_id", scope.organizationId)
      .eq("shared_with_profile_id", scope.profileId)
      .is("deleted_at", null)
      .eq("document.status", "approved")
      .is("document.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return fail<CursorPage<ClientDocumentView>>(error);

    const items: ClientDocumentView[] = (data ?? [])
      .filter((row: Record<string, unknown>) => {
        const exp = row.expires_at as string | null;
        return !exp || new Date(exp) > new Date();
      })
      .map((row: Record<string, unknown>) => {
        const doc = row.document as Record<string, unknown>;
        const project = doc.project as { name: string } | null;
        const sharer = row.sharer as { full_name: string } | null;
        return {
          id: doc.id as string,
          title: doc.title as string,
          document_number: (doc.document_number as string) ?? null,
          discipline: (doc.discipline as string) ?? null,
          document_type: (doc.document_type as string) ?? null,
          revision: (doc.revision as string) ?? null,
          status: doc.status as string,
          project_id: (doc.project_id as string) ?? null,
          project_name: project?.name ?? null,
          file_name: (doc.file_name as string) ?? null,
          shared_at: row.created_at as string,
          shared_by_name: sharer?.full_name ?? null,
          share_expires_at: (row.expires_at as string) ?? null,
        };
      });

    return ok({ items, next_cursor: null });
  } catch (err) {
    return fail<CursorPage<ClientDocumentView>>(err);
  }
}

export async function getClientDocument(id: string): Promise<ServiceResult<ClientDocumentView>> {
  const list = await listClientDocuments({ limit: 200 });
  const found = list.data?.items.find((d) => d.id === id);
  if (!found) return fail<ClientDocumentView>("Document not found or not shared with you.");
  return list.isMockData ? mockOk(found) : ok(found);
}

export async function downloadClientDocument(
  id: string,
): Promise<ServiceResult<ClientDownloadResult>> {
  const docResult = await getClientDocument(id);
  if (docResult.error || !docResult.data) {
    return fail<ClientDownloadResult>(docResult.error?.message ?? "Document not accessible.");
  }

  const doc = docResult.data;
  const fileName = doc.file_name ?? doc.title;

  await logClientDownload({
    entity_type: "document",
    entity_id: id,
    file_name: fileName,
  });

  if (!shouldUseSupabase()) {
    return mockOk({ signed_url: null, file_name: fileName, is_demo: true });
  }

  const urlResult = await downloadDocument(id);
  if (urlResult.error || !urlResult.data) {
    return fail<ClientDownloadResult>(urlResult.error?.message ?? "Download failed.");
  }

  return ok({ signed_url: urlResult.data, file_name: fileName, is_demo: false });
}

// ─── RFI ──────────────────────────────────────────────────────────────────────

export async function listClientRFIs(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientRFIView>>> {
  const limit = opts.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    let items: ClientRFIView[] = dummyClientPortalRFIs.map((r) => ({
      id: r.id,
      rfi_number: r.rfi_number,
      title: r.title,
      status: r.status,
      priority: r.priority,
      project_id: r.project_id,
      project_name: r.project_name,
      required_date: r.required_date,
      latest_response_excerpt: r.latest_response_excerpt,
      latest_response_at: r.latest_response_at,
    }));
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(
        (r) => r.title.toLowerCase().includes(q) || r.rfi_number.toLowerCase().includes(q),
      );
    }
    return mockOk(paginate(items, opts.cursor, limit));
  }

  const scope = await resolveClientScope();
  if (!scope.organizationId || !scope.clientId) {
    return fail<CursorPage<ClientRFIView>>("Client scope not configured.");
  }

  try {
    let query = supabase!
      .from("rfi")
      .select(
        `id, rfi_number, title, status, priority, project_id, required_date,
         project:projects(name)`,
      )
      .eq("organization_id", scope.organizationId)
      .eq("client_visible", true)
      .not("status", "in", '("archived","voided")')
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (opts.search) {
      query = query.or(`title.ilike.%${opts.search}%,rfi_number.ilike.%${opts.search}%`);
    }

    const { data, error } = await query;
    if (error) return fail<CursorPage<ClientRFIView>>(error);

    const items: ClientRFIView[] = await Promise.all(
      (data ?? []).map(async (row: Record<string, unknown>) => {
        const project = row.project as { name: string } | null;
        const { data: responses } = await supabase!
          .from("rfi_responses")
          .select("response_text, created_at")
          .eq("rfi_id", row.id as string)
          .neq("response_type", "internal_note")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        const latest = responses?.[0] as { response_text: string; created_at: string } | undefined;
        return {
          id: row.id as string,
          rfi_number: row.rfi_number as string,
          title: row.title as string,
          status: row.status as string,
          priority: row.priority as string,
          project_id: row.project_id as string,
          project_name: project?.name ?? null,
          required_date: (row.required_date as string) ?? null,
          latest_response_excerpt: latest?.response_text?.slice(0, 160) ?? null,
          latest_response_at: latest?.created_at ?? null,
        };
      }),
    );

    return ok({ items, next_cursor: null });
  } catch (err) {
    return fail<CursorPage<ClientRFIView>>(err);
  }
}

export async function getClientRFI(id: string): Promise<ServiceResult<ClientRFIDetailView>> {
  if (!shouldUseSupabase()) {
    const raw = dummyClientPortalRFIs.find((r) => r.id === id);
    if (!raw) return fail<ClientRFIDetailView>("RFI not found.");
    const responses = dummyClientRFIResponses.filter((r) => r.rfi_id === id);
    return mockOk({
      id: raw.id,
      rfi_number: raw.rfi_number,
      title: raw.title,
      status: raw.status,
      priority: raw.priority,
      project_id: raw.project_id,
      project_name: raw.project_name,
      required_date: raw.required_date,
      latest_response_excerpt: raw.latest_response_excerpt,
      latest_response_at: raw.latest_response_at,
      question: raw.question,
      discipline: raw.discipline,
      submitted_date: raw.submitted_date,
      answered_date: raw.answered_date,
      responses: responses.map((r) => ({
        id: r.id,
        response_text: r.response_text,
        response_type: r.response_type,
        respondent_name: r.respondent_name,
        created_at: r.created_at,
      })),
    });
  }

  const list = await listClientRFIs({ limit: 200 });
  const base = list.data?.items.find((r) => r.id === id);
  if (!base) return fail<ClientRFIDetailView>("RFI not found or not visible.");

  try {
    const { data, error } = await supabase!
      .from("rfi")
      .select("question, discipline, submitted_date, answered_date")
      .eq("id", id)
      .single();
    if (error) return fail<ClientRFIDetailView>(error);

    const { data: responses } = await supabase!
      .from("rfi_responses")
      .select(
        `id, response_text, response_type, created_at, respondent:profiles!respondent_id(full_name)`,
      )
      .eq("rfi_id", id)
      .neq("response_type", "internal_note")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    return ok({
      ...base,
      question: (data as { question: string | null }).question,
      discipline: (data as { discipline: string | null }).discipline,
      submitted_date: (data as { submitted_date: string | null }).submitted_date,
      answered_date: (data as { answered_date: string | null }).answered_date,
      responses: (responses ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        response_text: r.response_text as string,
        response_type: r.response_type as string,
        respondent_name: (r.respondent as { full_name: string } | null)?.full_name ?? null,
        created_at: r.created_at as string,
      })),
    });
  } catch (err) {
    return fail<ClientRFIDetailView>(err);
  }
}

// ─── Submittals ───────────────────────────────────────────────────────────────

export async function listClientSubmittals(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientSubmittalView>>> {
  const limit = opts.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    let items: ClientSubmittalView[] = dummyClientPortalSubmittals.map((s) => ({
      id: s.id,
      submittal_number: s.submittal_number,
      title: s.title,
      status: s.status,
      discipline: s.discipline,
      project_id: s.project_id,
      project_name: s.project_name,
      submitted_date: s.submitted_date,
      approved_at: s.approved_at,
      required_date: s.required_date,
      outcome_label: outcomeLabel(s.status),
    }));
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(
        (s) => s.title.toLowerCase().includes(q) || s.submittal_number.toLowerCase().includes(q),
      );
    }
    return mockOk(paginate(items, opts.cursor, limit));
  }

  const scope = await resolveClientScope();
  if (!scope.organizationId || !scope.clientId) {
    return fail<CursorPage<ClientSubmittalView>>("Client scope not configured.");
  }

  try {
    let query = supabase!
      .from("submittals")
      .select(
        `id, submittal_number, title, status, discipline, project_id,
         submitted_date, approved_at, required_date, project:projects(name)`,
      )
      .eq("organization_id", scope.organizationId)
      .eq("client_visible", true)
      .in("status", ["approved", "approved_as_noted"])
      .is("deleted_at", null)
      .order("approved_at", { ascending: false })
      .limit(limit);

    if (opts.search) {
      query = query.or(`title.ilike.%${opts.search}%,submittal_number.ilike.%${opts.search}%`);
    }

    const { data, error } = await query;
    if (error) return fail<CursorPage<ClientSubmittalView>>(error);

    const items: ClientSubmittalView[] = (data ?? []).map((row: Record<string, unknown>) => {
      const project = row.project as { name: string } | null;
      const status = row.status as string;
      return {
        id: row.id as string,
        submittal_number: row.submittal_number as string,
        title: row.title as string,
        status,
        discipline: (row.discipline as string) ?? null,
        project_id: row.project_id as string,
        project_name: project?.name ?? null,
        submitted_date: (row.submitted_date as string) ?? null,
        approved_at: (row.approved_at as string) ?? null,
        required_date: (row.required_date as string) ?? null,
        outcome_label: outcomeLabel(status),
      };
    });

    return ok({ items, next_cursor: null });
  } catch (err) {
    return fail<CursorPage<ClientSubmittalView>>(err);
  }
}

export async function getClientSubmittal(
  id: string,
): Promise<ServiceResult<ClientSubmittalDetailView>> {
  const list = await listClientSubmittals({ limit: 200 });
  const base = list.data?.items.find((s) => s.id === id);
  if (!base) return fail<ClientSubmittalDetailView>("Submittal not found.");

  if (!shouldUseSupabase()) {
    const raw = dummyClientPortalSubmittals.find((s) => s.id === id);
    if (!raw) return fail<ClientSubmittalDetailView>("Submittal not found.");
    return mockOk({
      ...base,
      spec_section: raw.spec_section,
      description: raw.description,
      revision_number: raw.revision_number,
    });
  }

  try {
    const { data, error } = await supabase!
      .from("submittals")
      .select("spec_section, description, revision_number")
      .eq("id", id)
      .single();
    if (error) return fail<ClientSubmittalDetailView>(error);
    const row = data as {
      spec_section: string | null;
      description: string | null;
      revision_number: number;
    };
    return ok({
      ...base,
      spec_section: row.spec_section,
      description: row.description,
      revision_number: row.revision_number,
    });
  } catch (err) {
    return fail<ClientSubmittalDetailView>(err);
  }
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function listClientInvoices(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientInvoiceView>>> {
  const limit = opts.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    let items = getMockClientInvoices();
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(
        (i) => i.invoice_number.toLowerCase().includes(q) || i.title.toLowerCase().includes(q),
      );
    }
    return mockOk(paginate(items, opts.cursor, limit, "issue_date"));
  }

  const scope = await resolveClientScope();
  if (!scope.organizationId || !scope.clientId) {
    return fail<CursorPage<ClientInvoiceView>>("Client scope not configured.");
  }

  try {
    let query = supabase!
      .from("invoices")
      .select(
        `id, invoice_number, title, status, project_id, issue_date, due_date,
         total_amount, paid_amount, project:projects!inner(name, client_id)`,
      )
      .eq("organization_id", scope.organizationId)
      .in("status", CLIENT_INVOICE_STATUSES)
      .is("deleted_at", null)
      .eq("project.client_id", scope.clientId)
      .order("issue_date", { ascending: false })
      .limit(limit);

    if (opts.search) {
      query = query.or(`invoice_number.ilike.%${opts.search}%,title.ilike.%${opts.search}%`);
    }

    const { data, error } = await query;
    if (error) return fail<CursorPage<ClientInvoiceView>>(error);

    const items: ClientInvoiceView[] = (data ?? []).map((row: Record<string, unknown>) => {
      const project = row.project as { name: string };
      const total = row.total_amount as number;
      const paid = row.paid_amount as number;
      const dueDate = row.due_date as string;
      const status = row.status as InvoiceStatus;
      return {
        id: row.id as string,
        invoice_number: row.invoice_number as string,
        title: row.title as string,
        status,
        project_id: row.project_id as string,
        project_name: project.name,
        issue_date: row.issue_date as string,
        due_date: dueDate,
        total_amount: total,
        paid_amount: paid,
        outstanding_amount: Math.max(0, total - paid),
        is_overdue: status === "overdue" || (status === "sent" && new Date(dueDate) < new Date()),
      };
    });

    return ok({ items, next_cursor: null });
  } catch (err) {
    return fail<CursorPage<ClientInvoiceView>>(err);
  }
}

export async function getClientInvoice(
  id: string,
): Promise<ServiceResult<ClientInvoiceDetailView>> {
  const list = await listClientInvoices({ limit: 200 });
  const base = list.data?.items.find((i) => i.id === id);
  if (!base) return fail<ClientInvoiceDetailView>("Invoice not found.");

  if (!shouldUseSupabase()) {
    const raw = dummyInvoices.find((i) => i.id === id);
    if (!raw) return fail<ClientInvoiceDetailView>("Invoice not found.");
    return mockOk({
      ...base,
      subtotal: raw.subtotal,
      tax_rate: raw.tax_rate,
      tax_amount: raw.tax_amount,
      notes: raw.notes,
      items: raw.items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
      })),
      payments: (raw.payments ?? []).map((p) => ({
        id: p.id,
        amount: p.amount,
        payment_date: p.payment_date,
        method: p.method,
        reference_number: p.reference_number,
      })),
    });
  }

  try {
    const { data: inv, error } = await supabase!
      .from("invoices")
      .select("subtotal, tax_rate, tax_amount, notes")
      .eq("id", id)
      .single();
    if (error) return fail<ClientInvoiceDetailView>(error);

    const { data: items } = await supabase!
      .from("invoice_items")
      .select("id, description, quantity, unit_price, amount")
      .eq("invoice_id", id)
      .order("sort_order");

    const { data: payments } = await supabase!
      .from("payments")
      .select("id, amount, payment_date, method, reference_number")
      .eq("invoice_id", id)
      .order("payment_date", { ascending: false });

    const invRow = inv as {
      subtotal: number;
      tax_rate: number;
      tax_amount: number;
      notes: string | null;
    };

    return ok({
      ...base,
      subtotal: invRow.subtotal,
      tax_rate: invRow.tax_rate,
      tax_amount: invRow.tax_amount,
      notes: invRow.notes,
      items: (items ?? []).map((it: Record<string, unknown>) => ({
        id: it.id as string,
        description: it.description as string,
        quantity: it.quantity as number,
        unit_price: it.unit_price as number,
        amount: it.amount as number,
      })),
      payments: (payments ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        amount: p.amount as number,
        payment_date: p.payment_date as string,
        method: p.method as string,
        reference_number: (p.reference_number as string) ?? null,
      })),
    });
  } catch (err) {
    return fail<ClientInvoiceDetailView>(err);
  }
}

// ─── Activity ───────────────────────────────────────────────────────────────────

export async function listClientActivity(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientActivityView>>> {
  const limit = opts.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    const items: ClientActivityView[] = dummyActivityEvents
      .filter((e) => e.visibility === "client_visible" && !e.deleted_at)
      .map((e) => ({
        id: e.id,
        event_type: e.event_type,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        entity_label: e.entity_label,
        message: e.message,
        category: e.category,
        created_at: e.created_at,
        link_available: ["document", "submittal", "invoice"].includes(e.entity_type ?? ""),
      }));
    return mockOk(paginate(items, opts.cursor, limit));
  }

  const scope = await resolveClientScope();
  if (!scope.organizationId) return fail<CursorPage<ClientActivityView>>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("activity_events")
      .select("id, event_type, entity_type, entity_id, entity_label, message, category, created_at")
      .eq("organization_id", scope.organizationId)
      .eq("visibility", "client_visible")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return fail<CursorPage<ClientActivityView>>(error);

    const items: ClientActivityView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      event_type: row.event_type as string,
      entity_type: (row.entity_type as string) ?? null,
      entity_id: (row.entity_id as string) ?? null,
      entity_label: (row.entity_label as string) ?? null,
      message: row.message as string,
      category: row.category as string,
      created_at: row.created_at as string,
      link_available: ["document", "submittal", "invoice", "rfi"].includes(
        (row.entity_type as string) ?? "",
      ),
    }));

    return ok({ items, next_cursor: null });
  } catch (err) {
    return fail<CursorPage<ClientActivityView>>(err);
  }
}

// ─── Meetings ───────────────────────────────────────────────────────────────────

export async function listClientMeetings(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientMeetingView>>> {
  const limit = opts.limit ?? PAGE_SIZE;
  const scope = await resolveClientScope();

  if (!shouldUseSupabase()) {
    const profileId = scope.profileId ?? MOCK_PROFILE_IDS.client;
    const items = getMockClientMeetings(profileId);
    return mockOk(paginate(items, opts.cursor, limit, "scheduled_start"));
  }

  if (!scope.profileId || !scope.organizationId) {
    return fail<CursorPage<ClientMeetingView>>("No active session.");
  }

  try {
    const { data, error } = await supabase!
      .from("meetings")
      .select(
        `id, title, meeting_type, status, project_id, scheduled_start, scheduled_end,
         location, video_link, visibility,
         project:projects(name),
         attendees:meeting_attendees!inner(profile_id)`,
      )
      .eq("organization_id", scope.organizationId)
      .eq("visibility", "client_visible")
      .eq("meeting_attendees.profile_id", scope.profileId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .order("scheduled_start", { ascending: false })
      .limit(limit);

    if (error) return fail<CursorPage<ClientMeetingView>>(error);

    const items: ClientMeetingView[] = (data ?? []).map((row: Record<string, unknown>) => {
      const project = row.project as { name: string } | null;
      return {
        id: row.id as string,
        title: row.title as string,
        meeting_type: row.meeting_type as string,
        status: row.status as string,
        project_id: (row.project_id as string) ?? null,
        project_name: project?.name ?? null,
        scheduled_start: (row.scheduled_start as string) ?? null,
        scheduled_end: (row.scheduled_end as string) ?? null,
        location: (row.location as string) ?? null,
        video_link: (row.video_link as string) ?? null,
      };
    });

    return ok({ items, next_cursor: null });
  } catch (err) {
    return fail<CursorPage<ClientMeetingView>>(err);
  }
}

// ─── Downloads center ───────────────────────────────────────────────────────────

export async function listClientDownloads(
  opts: ClientPortalListOptions = {},
): Promise<ServiceResult<CursorPage<ClientDownloadView>>> {
  const scope = await resolveClientScope();
  const profileId = scope.profileId ?? MOCK_PROFILE_IDS.client;

  const docs = await listClientDocuments({ limit: 100 });
  const docDownloads: ClientDownloadView[] = (docs.data?.items ?? []).map((d) => ({
    id: `dl-doc-${d.id}`,
    entity_type: "document",
    entity_id: d.id,
    title: d.title,
    file_name: d.file_name ?? d.title,
    project_name: d.project_name,
    downloaded_at: null,
    can_download: true,
  }));

  const logs = getMockDownloadLogs(profileId);
  const logViews: ClientDownloadView[] = logs.map((l) => ({
    id: l.id,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    title: l.file_name,
    file_name: l.file_name,
    project_name: null,
    downloaded_at: l.downloaded_at,
    can_download: l.entity_type === "document",
  }));

  const combined = [
    ...logViews,
    ...docDownloads.filter((d) => !logs.some((l) => l.entity_id === d.entity_id)),
  ];

  if (shouldUseSupabase() && scope.organizationId && scope.profileId) {
    try {
      const { data, error } = await supabase!
        .from("client_download_logs")
        .select("*")
        .eq("organization_id", scope.organizationId)
        .eq("profile_id", scope.profileId)
        .order("downloaded_at", { ascending: false })
        .limit(opts.limit ?? PAGE_SIZE);

      if (!error && data) {
        const fromDb: ClientDownloadView[] = (data as ClientDownloadLog[]).map((l) => ({
          id: l.id,
          entity_type: l.entity_type,
          entity_id: l.entity_id,
          title: l.file_name,
          file_name: l.file_name,
          project_name: null,
          downloaded_at: l.downloaded_at,
          can_download: l.entity_type === "document",
        }));
        return ok(paginate(fromDb, opts.cursor, opts.limit ?? PAGE_SIZE, "downloaded_at"));
      }
    } catch {
      /* fall through to combined mock list */
    }
  }

  return mockOk(paginate(combined, opts.cursor, opts.limit ?? PAGE_SIZE, "downloaded_at"));
}

export async function logClientDownload(payload: {
  entity_type: ClientDownloadLog["entity_type"];
  entity_id: string;
  file_name: string;
}): Promise<ServiceResult<ClientDownloadLog>> {
  const scope = await resolveClientScope();
  const profileId = scope.profileId ?? getCurrentUserId();
  const orgId = scope.organizationId ?? "mock-org";

  if (!profileId) return fail<ClientDownloadLog>("No active session.");

  const entry: ClientDownloadLog = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    profile_id: profileId,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    file_name: payload.file_name,
    downloaded_at: new Date().toISOString(),
    ip_metadata: {},
  };

  await logAction({
    action: "client.download",
    resource_type: payload.entity_type,
    resource_id: payload.entity_id,
    new_data: { file_name: payload.file_name },
  });

  if (!shouldUseSupabase()) {
    saveMockDownloadLog(entry);
    dummyClientDownloadLogs.unshift(entry);
    return mockOk(entry);
  }

  try {
    const { data, error } = await supabase!
      .from("client_download_logs")
      .insert({
        organization_id: orgId,
        profile_id: profileId,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        file_name: payload.file_name,
        ip_metadata: {},
      })
      .select()
      .single();

    if (error) return fail<ClientDownloadLog>(error);
    return ok(data as ClientDownloadLog);
  } catch (err) {
    return fail<ClientDownloadLog>(err);
  }
}

// ─── Preferences & announcements ──────────────────────────────────────────────

export async function getClientPortalPreferences(): Promise<
  ServiceResult<ClientPortalPreferencesView>
> {
  const scope = await resolveClientScope();
  const defaults: ClientPortalPreferencesView = {
    default_tab: "dashboard",
    notification_opt_in: true,
  };

  if (!shouldUseSupabase()) {
    try {
      const raw = sessionStorage.getItem(MOCK_PREFS_KEY);
      if (raw) return mockOk(JSON.parse(raw) as ClientPortalPreferencesView);
    } catch {
      /* ignore */
    }
    return mockOk(defaults);
  }

  if (!scope.profileId || !scope.organizationId) return ok(defaults);

  try {
    const { data, error } = await supabase!
      .from("client_portal_preferences")
      .select("default_tab, notification_opt_in")
      .eq("profile_id", scope.profileId)
      .maybeSingle();

    if (error) return fail<ClientPortalPreferencesView>(error);
    if (!data) return ok(defaults);

    return ok({
      default_tab: (data as ClientPortalPreferences).default_tab,
      notification_opt_in: (data as ClientPortalPreferences).notification_opt_in,
    });
  } catch (err) {
    return fail<ClientPortalPreferencesView>(err);
  }
}

export async function updateClientPortalPreferences(
  input: ClientPortalPreferencesInput,
): Promise<ServiceResult<ClientPortalPreferencesView>> {
  const current = await getClientPortalPreferences();
  const merged: ClientPortalPreferencesView = {
    default_tab: input.default_tab ?? current.data?.default_tab ?? "dashboard",
    notification_opt_in: input.notification_opt_in ?? current.data?.notification_opt_in ?? true,
  };

  const scope = await resolveClientScope();

  if (!shouldUseSupabase()) {
    try {
      sessionStorage.setItem(MOCK_PREFS_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
    return mockOk(merged);
  }

  if (!scope.profileId || !scope.organizationId) {
    return fail<ClientPortalPreferencesView>("No active session.");
  }

  try {
    const { data, error } = await supabase!
      .from("client_portal_preferences")
      .upsert(
        {
          organization_id: scope.organizationId,
          profile_id: scope.profileId,
          default_tab: merged.default_tab,
          notification_opt_in: merged.notification_opt_in,
        },
        { onConflict: "profile_id" },
      )
      .select("default_tab, notification_opt_in")
      .single();

    if (error) return fail<ClientPortalPreferencesView>(error);
    return ok(data as ClientPortalPreferencesView);
  } catch (err) {
    return fail<ClientPortalPreferencesView>(err);
  }
}

export async function listClientAnnouncements(): Promise<ServiceResult<ClientAnnouncementView[]>> {
  if (!shouldUseSupabase()) {
    const now = new Date();
    const active = dummyClientPortalAnnouncements.filter(
      (a) =>
        a.is_active &&
        !a.deleted_at &&
        new Date(a.starts_at) <= now &&
        (!a.ends_at || new Date(a.ends_at) >= now),
    );
    return mockOk(
      active.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
      })),
    );
  }

  const scope = await resolveClientScope();
  if (!scope.organizationId) return fail<ClientAnnouncementView[]>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("client_portal_announcements")
      .select("id, title, message, starts_at, ends_at")
      .eq("organization_id", scope.organizationId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .lte("starts_at", new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
      .order("starts_at", { ascending: false });

    if (error) return fail<ClientAnnouncementView[]>(error);
    return ok((data ?? []) as ClientAnnouncementView[]);
  } catch (err) {
    return fail<ClientAnnouncementView[]>(err);
  }
}
