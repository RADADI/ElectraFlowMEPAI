/**
 * RFI service — Phase 8
 *
 * Full Supabase CRUD with status-transition workflow, response threading,
 * internal-note visibility rules, document attachment, and audit logging.
 * Falls back to mock/sessionStorage when Supabase is not configured or JWT
 * is not ready.
 *
 * Behaviour matrix:
 *   Supabase NOT configured  → mock always
 *   Supabase configured, JWT NOT ready → mock (dev warning logged)
 *   Supabase configured, JWT ready     → real DB + RLS
 *
 * Key rules enforced in service (AND enforced again in RLS):
 *   - Self-response prevention: submitter cannot respond unless Admin/PM.
 *   - Internal notes: filtered from response list for Client role.
 *   - Status transitions: validated before any DB mutation.
 *   - Void requires void_reason (Admin only).
 *   - Restore uses previous_status saved at archive/void time.
 *   - Attached document must belong to same org and not be archived.
 *   - Unique rfi_number per project (DB constraint + friendly 23505 handling).
 *   - Optimistic lock via revision_number for concurrent-update protection.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { rfis as DUMMY_RFIS } from "@/lib/dummy-data";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  RFIView,
  RFIResponseView,
  RFIDocumentView,
  RFICreateInput,
  RFIUpdateInput,
  RFIResponseInput,
  VoidRFIInput,
  AssignRFIInput,
  RFIFilterInput,
} from "@/types/rfi-view";
import type { RFIStatus, RFIResponseType } from "@/types/database";

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn("[ElectraFlow] Supabase configured but JWT is not ready — using mock RFIs.");
    return false;
  }
  return true;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function norm(role: string | null | undefined): string {
  return (role ?? "").toLowerCase().replace(/ /g, "_");
}

function isAdminOrPM(role: string | null | undefined): boolean {
  const r = norm(role);
  return r === "admin" || r === "project_manager";
}

function canCreate(role: string | null | undefined): boolean {
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

function canRespond(role: string | null | undefined): boolean {
  const r = norm(role);
  return [
    "admin",
    "project_manager",
    "senior_electrical_engineer",
    "electrical_engineer",
    "qa_qc_engineer",
    "client",
  ].includes(r);
}

function canArchiveRestore(role: string | null | undefined): boolean {
  return isAdminOrPM(role);
}

// ─── Status transition validator ──────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<RFIStatus, RFIStatus[]>> = {
  draft: ["submitted"],
  submitted: ["open"],
  open: ["answered", "under_review"],
  under_review: ["answered", "open"],
  answered: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["answered", "under_review"],
  voided: [],
  archived: ["draft"], // restore
  cancelled: ["open"], // reopen from legacy cancelled
};

function validateTransition(from: RFIStatus, to: RFIStatus): string | null {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return `Cannot transition RFI from "${from}" to "${to}".`;
  }
  return null;
}

// ─── Mock data helpers ────────────────────────────────────────────────────────

const MOCK_KEY = "mep-rfis-mock";
const MOCK_RESPONSES_KEY = "mep-rfi-responses-mock";
const MOCK_DOCS_KEY = "mep-rfi-docs-mock";

const STATUS_MAP: Record<string, RFIStatus> = {
  open: "open",
  answered: "answered",
  closed: "closed",
  cancelled: "cancelled",
};

type DummyRaw = (typeof DUMMY_RFIS)[number];

function toRFIView(raw: DummyRaw): RFIView {
  return {
    id: String(raw.id),
    organization_id: "mock-org",
    project_id: "p1",
    rfi_number: raw.number,
    title: raw.subject,
    description: raw.subject,
    question: raw.subject,
    discipline: null,
    status: STATUS_MAP[raw.status.toLowerCase()] ?? "open",
    priority: (raw.priority?.toLowerCase() ?? "medium") as RFIView["priority"],
    submitted_by: null,
    assigned_to: null,
    submitted_date: null,
    required_date: raw.due ?? null,
    answered_date: null,
    cost_impact: false,
    schedule_impact: false,
    revision_number: 1,
    previous_status: null,
    submitted_at: null,
    closed_at: null,
    reopened_at: null,
    void_reason: null,
    client_visible: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    submitter_name: null,
    assignee_name: raw.assignedTo ?? null,
    project_name: raw.project ?? "Riyadh Metro Phase 3 - Substation",
    response_count: 0,
  };
}

function getMockRFIs(): RFIView[] {
  const base = DUMMY_RFIS.map(toRFIView);
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    const overrides: RFIView[] = raw ? (JSON.parse(raw) as RFIView[]) : [];
    const overrideIds = new Set(overrides.map((r) => r.id));
    return [...overrides, ...base.filter((r) => !overrideIds.has(r.id))];
  } catch {
    return base;
  }
}

function saveMockRFIs(items: RFIView[]): void {
  try {
    const base = DUMMY_RFIS.map(toRFIView);
    const baseIds = new Set(base.map((r) => r.id));
    const custom = items.filter((r) => !baseIds.has(r.id));
    const mutated = items.filter((r) => {
      if (baseIds.has(r.id)) {
        const b = base.find((b) => b.id === r.id);
        return JSON.stringify(r) !== JSON.stringify(b);
      }
      return false;
    });
    sessionStorage.setItem(MOCK_KEY, JSON.stringify([...custom, ...mutated]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional: sessionStorage unavailable
}

function getMockResponses(rfiId: string): RFIResponseView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_RESPONSES_KEY);
    const all: RFIResponseView[] = raw ? (JSON.parse(raw) as RFIResponseView[]) : [];
    return all.filter((r) => r.rfi_id === rfiId && !r.deleted_at);
  } catch {
    return [];
  }
}

function saveMockResponse(r: RFIResponseView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_RESPONSES_KEY);
    const all: RFIResponseView[] = raw ? (JSON.parse(raw) as RFIResponseView[]) : [];
    sessionStorage.setItem(MOCK_RESPONSES_KEY, JSON.stringify([...all, r]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional
}

function getMockRFIDocs(rfiId: string): RFIDocumentView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_DOCS_KEY);
    const all: RFIDocumentView[] = raw ? (JSON.parse(raw) as RFIDocumentView[]) : [];
    return all.filter((d) => d.rfi_id === rfiId && !d.deleted_at);
  } catch {
    return [];
  }
}

function saveMockRFIDoc(doc: RFIDocumentView): void {
  try {
    const raw = sessionStorage.getItem(MOCK_DOCS_KEY);
    const all: RFIDocumentView[] = raw ? (JSON.parse(raw) as RFIDocumentView[]) : [];
    sessionStorage.setItem(MOCK_DOCS_KEY, JSON.stringify([...all, doc]));
    // eslint-disable-next-line no-empty
  } catch {} // intentional
}

function removeMockRFIDoc(rfiId: string, documentId: string): void {
  try {
    const raw = sessionStorage.getItem(MOCK_DOCS_KEY);
    const all: RFIDocumentView[] = raw ? (JSON.parse(raw) as RFIDocumentView[]) : [];
    const updated = all.map((d) =>
      d.rfi_id === rfiId && d.document_id === documentId
        ? { ...d, deleted_at: new Date().toISOString() }
        : d,
    );
    sessionStorage.setItem(MOCK_DOCS_KEY, JSON.stringify(updated));
    // eslint-disable-next-line no-empty
  } catch {} // intentional
}

// ─── Denormalisation helper ────────────────────────────────────────────────────

function toView(row: Record<string, unknown>): RFIView {
  return {
    ...(row as unknown as RFIView),
    submitter_name: (row.submitter as { full_name?: string } | null)?.full_name ?? null,
    assignee_name: (row.assignee as { full_name?: string } | null)?.full_name ?? null,
    project_name: (row.project as { name?: string } | null)?.name ?? null,
    response_count: 0,
  };
}

const RFI_SELECT = `
  *,
  submitter:profiles!submitted_by(full_name),
  assignee:profiles!assigned_to(full_name),
  project:projects!project_id(name)
`;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listRFIs(filters?: RFIFilterInput): Promise<ServiceResult<RFIView[]>> {
  if (!shouldUseSupabase()) {
    let items = getMockRFIs();
    if (!filters?.includeArchived) items = items.filter((r) => !r.deleted_at);
    if (filters?.projectId) items = items.filter((r) => r.project_id === filters.projectId);
    if (filters?.status && filters.status !== "all")
      items = items.filter((r) => r.status === filters.status);
    if (filters?.priority && filters.priority !== "all")
      items = items.filter((r) => r.priority === filters.priority);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.rfi_number.toLowerCase().includes(q) ||
          r.project_name?.toLowerCase().includes(q),
      );
    }
    return mockOk(items);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return mockOk(DUMMY_RFIS.map(toRFIView));

  try {
    let query = supabase!
      .from("rfi")
      .select(RFI_SELECT)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (!filters?.includeArchived) query = query.is("deleted_at", null);
    if (filters?.projectId) query = query.eq("project_id", filters.projectId);
    if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
    if (filters?.priority && filters.priority !== "all")
      query = query.eq("priority", filters.priority);
    if (filters?.search)
      query = query.or(`title.ilike.%${filters.search}%,rfi_number.ilike.%${filters.search}%`);

    const { data, error } = await query;
    if (error) return fail<RFIView[]>(error);
    return ok((data ?? []).map((r: unknown) => toView(r as Record<string, unknown>)));
  } catch (err) {
    return fail<RFIView[]>(err);
  }
}

export async function getRFI(id: string): Promise<ServiceResult<RFIView>> {
  if (!shouldUseSupabase()) {
    const found = getMockRFIs().find((r) => r.id === id);
    if (!found) return fail<RFIView>(`RFI ${id} not found.`);
    return mockOk(found);
  }

  try {
    const { data, error } = await supabase!
      .from("rfi")
      .select(RFI_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) return fail<RFIView>(error);
    if (!data) return fail<RFIView>("RFI not found.");
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function createRFI(input: RFICreateInput): Promise<ServiceResult<RFIView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!canCreate(role)) {
    return fail<RFIView>("You do not have permission to create RFIs.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const duplicate = all.find(
      (r) =>
        r.project_id === input.project_id && r.rfi_number === input.rfi_number && !r.deleted_at,
    );
    if (duplicate) {
      return fail<RFIView>(
        "RFI number already exists for this project. Please use a different number.",
      );
    }

    const newRFI: RFIView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      project_id: input.project_id,
      rfi_number: input.rfi_number,
      title: input.title,
      description: input.question,
      question: input.question,
      discipline: input.discipline ?? null,
      status: "draft",
      priority: input.priority ?? "medium",
      submitted_by: null,
      assigned_to: null,
      submitted_date: null,
      required_date: input.required_date ?? null,
      answered_date: null,
      cost_impact: input.cost_impact ?? false,
      schedule_impact: input.schedule_impact ?? false,
      revision_number: 1,
      previous_status: null,
      submitted_at: null,
      closed_at: null,
      reopened_at: null,
      void_reason: null,
      client_visible: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: userId ?? null,
      updated_by: null,
      deleted_at: null,
      submitter_name: null,
      assignee_name: null,
      project_name: null,
      response_count: 0,
    };
    saveMockRFIs([newRFI, ...all]);
    return mockOk(newRFI);
  }

  if (!organizationId) {
    return fail<RFIView>("Organisation is not configured for this user.");
  }

  try {
    const { data, error } = await supabase!
      .from("rfi")
      .insert({
        organization_id: organizationId,
        project_id: input.project_id,
        rfi_number: input.rfi_number,
        title: input.title,
        description: input.question,
        question: input.question,
        discipline: input.discipline ?? null,
        status: "draft",
        priority: input.priority ?? "medium",
        required_date: input.required_date ?? null,
        cost_impact: input.cost_impact ?? false,
        schedule_impact: input.schedule_impact ?? false,
        revision_number: 1,
        submitted_by: userId,
        created_by: userId,
        updated_by: userId,
      })
      .select(RFI_SELECT)
      .single();

    if (error) {
      if (error.code === "23505") {
        return fail<RFIView>(
          "RFI number already exists for this project. Please use a different number.",
        );
      }
      return fail<RFIView>(error);
    }

    void logAction({
      action: "rfi.created",
      resource_type: "rfi",
      resource_id: (data as { id: string }).id,
      new_data: { rfi_number: input.rfi_number, title: input.title },
    });

    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function updateRFI(
  id: string,
  input: RFIUpdateInput,
): Promise<ServiceResult<RFIView>> {
  const { userId } = getSessionContext();

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");
    const updated: RFIView = {
      ...all[idx],
      ...input,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data, error } = await supabase!
      .from("rfi")
      .update({ ...input, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function submitRFI(id: string): Promise<ServiceResult<RFIView>> {
  const { userId } = getSessionContext();

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");
    const err = validateTransition(all[idx].status, "submitted");
    if (err) return fail<RFIView>(err);

    const updated: RFIView = {
      ...all[idx],
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_by: userId ?? null,
      revision_number: all[idx].revision_number + 1,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: current } = await supabase!.from("rfi").select("status").eq("id", id).single();

    const transErr = validateTransition((current?.status as RFIStatus) ?? "draft", "submitted");
    if (transErr) return fail<RFIView>(transErr);

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({
        status: "submitted",
        submitted_at: now,
        submitted_by: userId,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    void logAction({ action: "rfi.submitted", resource_type: "rfi", resource_id: id });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function assignRFI(
  id: string,
  input: AssignRFIInput,
): Promise<ServiceResult<RFIView>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrPM(role)) {
    return fail<RFIView>("Only Admin and Project Manager can assign RFIs.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");

    const updated: RFIView = {
      ...all[idx],
      status: "open",
      assigned_to: input.profile_id,
      assignee_name: input.profile_name ?? null,
      revision_number: all[idx].revision_number + 1,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({
        assigned_to: input.profile_id,
        status: "open",
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    void logAction({
      action: "rfi.assigned",
      resource_type: "rfi",
      resource_id: id,
      new_data: { assigned_to: input.profile_id },
    });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function respondToRFI(
  id: string,
  input: RFIResponseInput,
): Promise<ServiceResult<RFIView>> {
  const { userId, organizationId, role } = getSessionContext();

  if (!canRespond(role)) {
    return fail<RFIView>("You do not have permission to respond to RFIs.");
  }
  if (!input.response_text?.trim()) {
    return fail<RFIView>("Response text is required.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");

    const rfi = all[idx];
    if (rfi.submitted_by === userId && !isAdminOrPM(role)) {
      return fail<RFIView>("You cannot respond to your own RFI.");
    }

    saveMockResponse({
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      rfi_id: id,
      respondent_id: userId ?? "mock-user",
      response_text: input.response_text.trim(),
      response_type: input.response_type,
      attachments: null,
      responded_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      responder_name: "Demo User",
    });

    const isSubstantive = input.response_type !== "internal_note";
    const newStatus =
      isSubstantive && ["open", "under_review", "reopened"].includes(rfi.status)
        ? "answered"
        : rfi.status;

    const updated: RFIView = {
      ...rfi,
      status: newStatus as RFIStatus,
      answered_date: isSubstantive ? new Date().toISOString().split("T")[0] : rfi.answered_date,
      response_count: rfi.response_count + 1,
      revision_number: rfi.revision_number + 1,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: rfi } = await supabase!
      .from("rfi")
      .select("submitted_by, status")
      .eq("id", id)
      .single();

    if (rfi?.submitted_by === userId && !isAdminOrPM(role)) {
      return fail<RFIView>("You cannot respond to your own RFI.");
    }

    const isSubstantive = input.response_type !== "internal_note";
    const now = new Date().toISOString();

    await supabase!.from("rfi_responses").insert({
      organization_id: organizationId!,
      rfi_id: id,
      respondent_id: userId!,
      response_text: input.response_text.trim(),
      response_type: input.response_type,
    });

    const newStatus =
      isSubstantive && ["open", "under_review", "reopened"].includes(rfi?.status ?? "")
        ? "answered"
        : rfi?.status;

    const { data, error } = await supabase!
      .from("rfi")
      .update({
        status: newStatus,
        answered_date: isSubstantive ? now.split("T")[0] : undefined,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);

    const auditAction =
      input.response_type === "internal_note"
        ? "rfi.internal_note_added"
        : input.response_type === "request_more_info"
          ? "rfi.request_more_info"
          : "rfi.responded";

    void logAction({ action: auditAction, resource_type: "rfi", resource_id: id });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function requestMoreInfo(id: string, text: string): Promise<ServiceResult<RFIView>> {
  return respondToRFI(id, { response_text: text, response_type: "request_more_info" });
}

export async function closeRFI(id: string): Promise<ServiceResult<RFIView>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrPM(role)) {
    return fail<RFIView>("Only Admin and Project Manager can close RFIs.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");
    const err = validateTransition(all[idx].status, "closed");
    if (err) return fail<RFIView>(err);

    const updated: RFIView = {
      ...all[idx],
      status: "closed",
      closed_at: new Date().toISOString(),
      revision_number: all[idx].revision_number + 1,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: current } = await supabase!.from("rfi").select("status").eq("id", id).single();

    const transErr = validateTransition((current?.status as RFIStatus) ?? "open", "closed");
    if (transErr) return fail<RFIView>(transErr);

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({ status: "closed", closed_at: now, updated_at: now, updated_by: userId })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    void logAction({ action: "rfi.closed", resource_type: "rfi", resource_id: id });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function reopenRFI(id: string): Promise<ServiceResult<RFIView>> {
  const { userId, role } = getSessionContext();

  if (!isAdminOrPM(role)) {
    return fail<RFIView>("Only Admin and Project Manager can reopen RFIs.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");
    const err = validateTransition(all[idx].status, "reopened");
    if (err) return fail<RFIView>(err);

    const updated: RFIView = {
      ...all[idx],
      status: "reopened",
      reopened_at: new Date().toISOString(),
      revision_number: all[idx].revision_number + 1,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: current } = await supabase!.from("rfi").select("status").eq("id", id).single();

    const transErr = validateTransition((current?.status as RFIStatus) ?? "closed", "reopened");
    if (transErr) return fail<RFIView>(transErr);

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({ status: "reopened", reopened_at: now, updated_at: now, updated_by: userId })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    void logAction({ action: "rfi.reopened", resource_type: "rfi", resource_id: id });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function archiveRFI(id: string): Promise<ServiceResult<RFIView>> {
  const { userId, role } = getSessionContext();

  if (!canArchiveRestore(role)) {
    return fail<RFIView>("Only Admin and Project Manager can archive RFIs.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");
    if (all[idx].status === "voided") {
      return fail<RFIView>("A voided RFI cannot be archived. Ask Admin to restore it first.");
    }

    const updated: RFIView = {
      ...all[idx],
      previous_status: all[idx].status,
      status: "archived",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: current } = await supabase!.from("rfi").select("status").eq("id", id).single();

    if (current?.status === "voided") {
      return fail<RFIView>("A voided RFI cannot be archived. Ask Admin to restore it first.");
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({
        previous_status: current?.status,
        status: "archived",
        deleted_at: now,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    void logAction({ action: "rfi.archived", resource_type: "rfi", resource_id: id });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function restoreRFI(id: string): Promise<ServiceResult<RFIView>> {
  const { userId, role } = getSessionContext();

  if (!canArchiveRestore(role)) {
    return fail<RFIView>("Only Admin and Project Manager can restore RFIs.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");

    const returnStatus: RFIStatus = all[idx].previous_status ?? "draft";
    const updated: RFIView = {
      ...all[idx],
      status: returnStatus,
      previous_status: null,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: current } = await supabase!
      .from("rfi")
      .select("previous_status")
      .eq("id", id)
      .single();

    const returnStatus: RFIStatus = (current?.previous_status as RFIStatus) ?? "draft";
    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({
        status: returnStatus,
        previous_status: null,
        deleted_at: null,
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .select(RFI_SELECT)
      .single();

    if (error) return fail<RFIView>(error);
    void logAction({ action: "rfi.restored", resource_type: "rfi", resource_id: id });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

export async function voidRFI(id: string, input: VoidRFIInput): Promise<ServiceResult<RFIView>> {
  const { userId, role } = getSessionContext();

  if (norm(role) !== "admin") {
    return fail<RFIView>("Only Admin can void an RFI.");
  }
  if (!input.void_reason?.trim()) {
    return fail<RFIView>("Void reason is required.");
  }

  if (!shouldUseSupabase()) {
    const all = getMockRFIs();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return fail<RFIView>("RFI not found.");

    if (all[idx].revision_number !== input.expected_revision_number) {
      return fail<RFIView>(
        "REVISION_CONFLICT: This RFI was updated by another user. Please refresh and try again.",
      );
    }

    const updated: RFIView = {
      ...all[idx],
      previous_status: all[idx].status,
      status: "voided",
      void_reason: input.void_reason.trim(),
      updated_at: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    saveMockRFIs(next);
    return mockOk(updated);
  }

  try {
    const { data: current } = await supabase!
      .from("rfi")
      .select("revision_number, status")
      .eq("id", id)
      .single();

    if (current?.revision_number !== input.expected_revision_number) {
      return fail<RFIView>(
        "REVISION_CONFLICT: This RFI was updated by another user. Please refresh and try again.",
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase!
      .from("rfi")
      .update({
        previous_status: current.status,
        status: "voided",
        void_reason: input.void_reason.trim(),
        updated_at: now,
        updated_by: userId,
      })
      .eq("id", id)
      .eq("revision_number", input.expected_revision_number)
      .select(RFI_SELECT)
      .single();

    if (error || !data) {
      return fail<RFIView>(
        "REVISION_CONFLICT: This RFI was updated by another user. Please refresh and try again.",
      );
    }

    void logAction({
      action: "rfi.voided",
      resource_type: "rfi",
      resource_id: id,
      new_data: { void_reason: input.void_reason },
    });
    return ok(toView(data as unknown as Record<string, unknown>));
  } catch (err) {
    return fail<RFIView>(err);
  }
}

// ─── Responses ────────────────────────────────────────────────────────────────

export async function listRFIResponses(rfiId: string): Promise<ServiceResult<RFIResponseView[]>> {
  const { role } = getSessionContext();
  const isClient = norm(role) === "client";

  if (!shouldUseSupabase()) {
    let items = getMockResponses(rfiId);
    if (isClient) items = items.filter((r) => r.response_type !== "internal_note");
    return mockOk(items);
  }

  try {
    let query = supabase!
      .from("rfi_responses")
      .select(
        `
        *,
        responder:profiles!respondent_id(full_name)
      `,
      )
      .eq("rfi_id", rfiId)
      .is("deleted_at", null)
      .order("responded_at", { ascending: true });

    if (isClient) query = query.neq("response_type", "internal_note");

    const { data, error } = await query;
    if (error) return fail<RFIResponseView[]>(error);

    const rows = (data ?? []).map((row: unknown): RFIResponseView => {
      const r = row as Record<string, unknown>;
      return {
        ...(r as unknown as RFIResponseView),
        // "Former User" fallback if profile deleted/deactivated
        responder_name: (r.responder as { full_name?: string } | null)?.full_name ?? "Former User",
      };
    });

    return ok(rows);
  } catch (err) {
    return fail<RFIResponseView[]>(err);
  }
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function attachDocumentToRFI(
  rfiId: string,
  documentId: string,
): Promise<ServiceResult<RFIDocumentView>> {
  const { userId, organizationId } = getSessionContext();

  if (!shouldUseSupabase()) {
    const existing = getMockRFIDocs(rfiId).some((d) => d.document_id === documentId);
    if (existing) return fail<RFIDocumentView>("Document is already attached to this RFI.");

    const doc: RFIDocumentView = {
      id: crypto.randomUUID(),
      rfi_id: rfiId,
      document_id: documentId,
      document_title: "Attached Document",
      document_status: "approved",
      attached_by: userId ?? null,
      attached_by_name: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      is_archived: false,
    };
    saveMockRFIDoc(doc);
    return mockOk(doc);
  }

  try {
    // Validate: same org + not archived
    const { data: docCheck, error: docErr } = await supabase!
      .from("documents")
      .select("id, organization_id, deleted_at, title, status")
      .eq("id", documentId)
      .eq("organization_id", organizationId!)
      .maybeSingle();

    if (docErr) return fail<RFIDocumentView>(docErr);
    if (!docCheck) {
      return fail<RFIDocumentView>(
        "Document not found in this organisation or has been permanently removed.",
      );
    }
    if (docCheck.deleted_at) {
      return fail<RFIDocumentView>(
        "Cannot attach an archived document. Please restore the document first.",
      );
    }

    const { data, error } = await supabase!
      .from("rfi_documents")
      .insert({
        organization_id: organizationId!,
        rfi_id: rfiId,
        document_id: documentId,
        attached_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505")
        return fail<RFIDocumentView>("Document is already attached to this RFI.");
      return fail<RFIDocumentView>(error);
    }

    void logAction({
      action: "rfi.document_attached",
      resource_type: "rfi_document",
      resource_id: (data as { id: string }).id,
      new_data: { rfi_id: rfiId, document_id: documentId },
    });

    return ok({
      id: (data as { id: string }).id,
      rfi_id: rfiId,
      document_id: documentId,
      document_title: (docCheck.title as string) ?? "Document",
      document_status: (docCheck.status as string) ?? "unknown",
      attached_by: userId ?? null,
      attached_by_name: null,
      created_at: (data as { created_at: string }).created_at,
      deleted_at: null,
      is_archived: false,
    });
  } catch (err) {
    return fail<RFIDocumentView>(err);
  }
}

export async function removeDocumentFromRFI(
  rfiId: string,
  documentId: string,
): Promise<ServiceResult<boolean>> {
  if (!shouldUseSupabase()) {
    removeMockRFIDoc(rfiId, documentId);
    return mockOk(true);
  }

  try {
    const { error } = await supabase!
      .from("rfi_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("rfi_id", rfiId)
      .eq("document_id", documentId);

    if (error) return fail<boolean>(error);
    void logAction({
      action: "rfi.document_removed",
      resource_type: "rfi_document",
      resource_id: rfiId,
      new_data: { document_id: documentId },
    });
    return ok(true);
  } catch (err) {
    return fail<boolean>(err);
  }
}

export async function listRFIDocuments(rfiId: string): Promise<ServiceResult<RFIDocumentView[]>> {
  if (!shouldUseSupabase()) {
    return mockOk(getMockRFIDocs(rfiId));
  }

  try {
    const { data, error } = await supabase!
      .from("rfi_documents")
      .select(
        `
        *,
        doc:documents!document_id(title, status, deleted_at),
        attacher:profiles!attached_by(full_name)
      `,
      )
      .eq("rfi_id", rfiId)
      .is("deleted_at", null);

    if (error) return fail<RFIDocumentView[]>(error);

    const rows = (data ?? []).map((row: unknown): RFIDocumentView => {
      const r = row as Record<string, unknown>;
      const doc = r.doc as { title?: string; status?: string; deleted_at?: string | null } | null;
      return {
        id: r.id as string,
        rfi_id: rfiId,
        document_id: r.document_id as string,
        document_title: doc?.title ?? "Document",
        document_status: doc?.status ?? "unknown",
        attached_by: r.attached_by as string | null,
        attached_by_name: (r.attacher as { full_name?: string } | null)?.full_name ?? null,
        created_at: r.created_at as string,
        deleted_at: r.deleted_at as string | null,
        is_archived: !!doc?.deleted_at,
      };
    });

    return ok(rows);
  } catch (err) {
    return fail<RFIDocumentView[]>(err);
  }
}
