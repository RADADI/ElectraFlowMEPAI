/**
 * Electrical service — Phase 15B
 *
 * Panel schedules, circuits, load calculations, equipment lists, and revision
 * history with approval workflow, audit logging, activity events, and
 * notification fan-out (actor excluded). Falls back to sessionStorage mock
 * when Supabase is not configured or JWT is not ready.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext, getCurrentUserId } from "@/lib/auth-bridge";
import {
  dummyPanelSchedules,
  dummyCircuits,
  dummyLoadCalculations,
  dummyEquipmentLists,
  dummyElectricalRevisions,
  MOCK_PROFILE_NAMES,
  MOCK_PROFILE_IDS,
  projects,
} from "@/lib/dummy-data";
import {
  ELECTRICAL_CONFIG,
  computePanelTotalLoadVa,
  computePhaseLoads,
  buildPanelWarnings,
  buildCircuitWarnings,
  computeLoadCalculationPreview,
} from "@/lib/electrical-calculations";
import { logAction, listAuditLogsForResource } from "@/services/audit.service";
import { createActivityEvent, listActivityEvents } from "@/services/activity.service";
import { notifyUsers } from "@/services/notification.service";
import { EVENT_TYPES } from "@/types/notification-view";
import { encodeCursor, decodeCursor, type CursorPage } from "@/types/notification-view";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type {
  PanelSchedule,
  Circuit,
  LoadCalculation,
  EquipmentList,
  ElectricalRevision,
  ElectricalWorkflowStatus,
} from "@/types/database";
import type {
  PanelListItemView,
  PanelView,
  CircuitView,
  PanelLoadSummaryView,
  LoadCalculationListItemView,
  LoadCalculationView,
  EquipmentView,
  ElectricalOverviewStats,
  ElectricalRevisionView,
  PanelFilterInput,
  PanelCreateInput,
  PanelUpdateInput,
  CircuitCreateInput,
  CircuitUpdateInput,
  LoadCalculationCreateInput,
  LoadCalculationUpdateInput,
  EquipmentCreateInput,
  EquipmentUpdateInput,
  ElectricalTimelineItem,
} from "@/types/electrical-view";
import { isPanelEditable, isUnderReviewReadOnly } from "@/types/electrical-view";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export const RESOURCE_TYPES = {
  PANEL_SCHEDULE: "panel_schedule",
  LOAD_CALCULATION: "load_calculation",
  EQUIPMENT_LIST: "equipment_list",
  CIRCUIT: "circuit",
} as const;

const MOCK_PANELS_KEY = "mep-panels-mock";
const MOCK_CIRCUITS_KEY = "mep-circuits-mock";
const MOCK_LOAD_CALCS_KEY = "mep-load-calcs-mock";
const MOCK_EQUIPMENT_KEY = "mep-equipment-mock";
const MOCK_REVISIONS_KEY = "mep-electrical-revisions-mock";

export interface LoadCalculationFilterInput {
  status?: ElectricalWorkflowStatus | "all";
  project_id?: string;
  search?: string;
  include_archived?: boolean;
  cursor?: string;
  limit?: number;
}

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) {
    console.warn(
      "[ElectraFlow] Supabase configured but JWT is not ready — using mock electrical data.",
    );
    return false;
  }
  return true;
}

function getDb() {
  if (!supabase) throw new Error("Supabase unavailable");
  return supabase;
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function norm(role: string | null | undefined): string {
  return (role ?? "").toLowerCase().replace(/ /g, "_");
}

function isAdmin(role: string | null | undefined): boolean {
  return norm(role) === "admin";
}

function isAdminOrPM(role: string | null | undefined): boolean {
  const r = norm(role);
  return r === "admin" || r === "project_manager";
}

function canApproveElectrical(role: string | null | undefined): boolean {
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "qa_qc_engineer"].includes(r);
}

function canCreateElectrical(role: string | null | undefined): boolean {
  const r = norm(role);
  return ["admin", "project_manager", "senior_electrical_engineer", "electrical_engineer"].includes(
    r,
  );
}

// ─── Mock sessionStorage helpers ──────────────────────────────────────────────

function mergeMockStore<T extends { id: string }>(base: T[], key: string): T[] {
  try {
    const raw = sessionStorage.getItem(key);
    const overrides: T[] = raw ? (JSON.parse(raw) as T[]) : [];
    const overrideIds = new Set(overrides.map((r) => r.id));
    return [...overrides, ...base.filter((r) => !overrideIds.has(r.id))];
  } catch {
    return [...base];
  }
}

function saveMockStore<T extends { id: string }>(items: T[], base: T[], key: string): void {
  try {
    const baseIds = new Set(base.map((r) => r.id));
    const custom = items.filter((r) => !baseIds.has(r.id));
    const mutated = items.filter((r) => {
      if (baseIds.has(r.id)) {
        const b = base.find((x) => x.id === r.id);
        return b && JSON.stringify(r) !== JSON.stringify(b);
      }
      return false;
    });
    sessionStorage.setItem(key, JSON.stringify([...custom, ...mutated]));
    // eslint-disable-next-line no-empty
  } catch {}
}

function getMockPanels(): PanelSchedule[] {
  return mergeMockStore([...dummyPanelSchedules], MOCK_PANELS_KEY);
}

function saveMockPanels(items: PanelSchedule[]): void {
  saveMockStore(items, [...dummyPanelSchedules], MOCK_PANELS_KEY);
}

function getMockCircuits(): Circuit[] {
  return mergeMockStore([...dummyCircuits], MOCK_CIRCUITS_KEY);
}

function saveMockCircuits(items: Circuit[]): void {
  saveMockStore(items, [...dummyCircuits], MOCK_CIRCUITS_KEY);
}

function getMockLoadCalcs(): LoadCalculation[] {
  return mergeMockStore([...dummyLoadCalculations], MOCK_LOAD_CALCS_KEY);
}

function saveMockLoadCalcs(items: LoadCalculation[]): void {
  saveMockStore(items, [...dummyLoadCalculations], MOCK_LOAD_CALCS_KEY);
}

function getMockEquipment(): EquipmentList[] {
  return mergeMockStore([...dummyEquipmentLists], MOCK_EQUIPMENT_KEY);
}

function saveMockEquipment(items: EquipmentList[]): void {
  saveMockStore(items, [...dummyEquipmentLists], MOCK_EQUIPMENT_KEY);
}

function getMockRevisions(): ElectricalRevision[] {
  return mergeMockStore([...dummyElectricalRevisions], MOCK_REVISIONS_KEY);
}

function saveMockRevisions(items: ElectricalRevision[]): void {
  saveMockStore(items, [...dummyElectricalRevisions], MOCK_REVISIONS_KEY);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function projectName(projectId: string | null): string | null {
  if (!projectId) return null;
  return projects.find((p) => p.id === projectId)?.name ?? null;
}

function profileName(profileId: string | null): string | null {
  if (!profileId) return null;
  return MOCK_PROFILE_NAMES[profileId] ?? "Former User";
}

async function getActorProfileId(): Promise<string | null> {
  return getCurrentUserId();
}

function validateDemandFactor(factor: number): string | null {
  if (factor < ELECTRICAL_CONFIG.minDemandFactor || factor > ELECTRICAL_CONFIG.maxDemandFactor) {
    return `Demand factor must be between ${ELECTRICAL_CONFIG.minDemandFactor} and ${ELECTRICAL_CONFIG.maxDemandFactor}.`;
  }
  return null;
}

function circuitsForPanel(panelId: string, circuits?: Circuit[]): Circuit[] {
  const all = circuits ?? getMockCircuits();
  return all.filter((c) => c.panel_schedule_id === panelId && !c.deleted_at);
}

function toCircuitView(c: Circuit): CircuitView {
  const view: CircuitView = {
    id: c.id,
    organization_id: c.organization_id,
    panel_schedule_id: c.panel_schedule_id,
    circuit_number: c.circuit_number,
    circuit_side: c.circuit_side,
    description: c.description,
    load_va: Number(c.load_va ?? 0),
    breaker_size: c.breaker_size,
    poles: c.poles,
    phase: c.phase,
    wire_size: c.wire_size,
    conduit_size: c.conduit_size,
    voltage: c.voltage,
    remarks: c.remarks,
    created_at: c.created_at,
    updated_at: c.updated_at,
    warnings: [],
  };
  view.warnings = buildCircuitWarnings(view);
  return view;
}

function computePanelLoadFromCircuits(panelId: string, circuits?: Circuit[]): number {
  return computePanelTotalLoadVa(circuitsForPanel(panelId, circuits).map(toCircuitView));
}

function isStalePanelSnapshot(
  lc: Pick<LoadCalculation, "source_panel_id" | "source_panel_revision">,
  panels?: PanelSchedule[],
): boolean {
  if (!lc.source_panel_id) return false;
  const all = panels ?? getMockPanels();
  const panel = all.find((p) => p.id === lc.source_panel_id && !p.deleted_at);
  if (!panel) return false;
  return lc.source_panel_revision !== panel.revision_number;
}

function computePanelPermissions(
  panel: PanelSchedule,
  actorId: string | null,
  role: string | null | undefined,
): Pick<
  PanelView,
  | "can_edit"
  | "can_submit"
  | "can_approve"
  | "can_reject"
  | "can_archive"
  | "can_restore"
  | "can_reopen"
  | "is_read_only"
> {
  const editable = isPanelEditable(panel.status);
  const isOwner = !!actorId && panel.created_by === actorId;
  const adminPm = isAdminOrPM(role);
  const canReview = canApproveElectrical(role);
  const selfBlocked = isOwner && !isAdmin(role);

  const can_edit = editable && (isOwner || adminPm);
  const can_submit = can_edit && (panel.status === "draft" || panel.status === "rejected");
  const can_approve = panel.status === "under_review" && canReview && !selfBlocked;
  const can_reject = can_approve;
  const is_read_only = isUnderReviewReadOnly(panel.status) || (editable && !can_edit);
  const can_archive = adminPm && panel.status !== "archived";
  const can_restore = adminPm && panel.status === "archived";
  const can_reopen = adminPm && panel.status === "approved";

  return {
    can_edit,
    can_submit,
    can_approve,
    can_reject,
    can_archive,
    can_restore,
    can_reopen,
    is_read_only,
  };
}

function computeLoadCalcPermissions(
  lc: LoadCalculation,
  actorId: string | null,
  role: string | null | undefined,
): Pick<
  LoadCalculationView,
  "can_edit" | "can_submit" | "can_approve" | "can_reject" | "is_read_only"
> {
  const editable = isPanelEditable(lc.status);
  const isOwner = !!actorId && lc.created_by === actorId;
  const adminPm = isAdminOrPM(role);
  const canReview = canApproveElectrical(role);
  const selfBlocked = isOwner && !isAdmin(role);

  const can_edit = editable && (isOwner || adminPm);
  const can_submit = can_edit && (lc.status === "draft" || lc.status === "rejected");
  const can_approve = lc.status === "under_review" && canReview && !selfBlocked;
  const can_reject = can_approve;
  const is_read_only = isUnderReviewReadOnly(lc.status) || (editable && !can_edit);

  return { can_edit, can_submit, can_approve, can_reject, is_read_only };
}

function assertPanelEditable(panel: PanelSchedule): ServiceResult<never> | null {
  if (panel.status === "under_review" || panel.status === "approved") {
    return fail({
      message: "Panel schedule is read-only in its current status.",
      code: "READ_ONLY",
    });
  }
  if (panel.status === "archived") {
    return fail("Archived panel schedules cannot be edited.");
  }
  return null;
}

function assertCircuitsEditable(panel: PanelSchedule): ServiceResult<never> | null {
  if (panel.status === "approved") {
    return fail("Circuits are locked on approved panels. Reopen the panel to edit.");
  }
  return assertPanelEditable(panel);
}

function assertLoadCalcEditable(lc: LoadCalculation): ServiceResult<never> | null {
  if (lc.status === "under_review" || lc.status === "approved") {
    return fail({
      message: "Load calculation is read-only in its current status.",
      code: "READ_ONLY",
    });
  }
  if (lc.status === "archived") {
    return fail("Archived load calculations cannot be edited.");
  }
  return null;
}

function checkSelfApproval(
  createdBy: string | null,
  actorId: string | null,
  role: string | null | undefined,
): ServiceResult<never> | null {
  if (createdBy && actorId && createdBy === actorId && !isAdmin(role)) {
    return fail({
      message: "You cannot approve your own submission.",
      code: "SELF_APPROVAL_BLOCKED",
    });
  }
  return null;
}

async function createElectricalRevision(
  entityType: "panel_schedule" | "load_calculation",
  entityId: string,
  revisionNumber: number,
  changeSummary: string,
  actorId: string | null,
  orgId: string,
): Promise<void> {
  const row: ElectricalRevision = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    entity_type: entityType,
    entity_id: entityId,
    revision_number: revisionNumber,
    change_summary: changeSummary,
    changed_by: actorId,
    created_at: new Date().toISOString(),
  };

  if (!shouldUseSupabase()) {
    saveMockRevisions([row, ...getMockRevisions()]);
    return;
  }

  await getDb().from("electrical_revisions").insert({
    organization_id: orgId,
    entity_type: entityType,
    entity_id: entityId,
    revision_number: revisionNumber,
    change_summary: changeSummary,
    changed_by: actorId,
  });
}

function approverRecipientIds(createdBy: string | null): string[] {
  return [MOCK_PROFILE_IDS.pm, MOCK_PROFILE_IDS.iqbal].filter((id) => id && id !== createdBy);
}

async function emitElectricalEvent(
  eventType: string,
  entityType: string,
  entityId: string,
  entityLabel: string,
  title: string,
  message: string,
  recipientIds: string[],
  actorId: string | null,
): Promise<void> {
  await createActivityEvent({
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    entity_label: entityLabel,
    message,
    category: "electrical",
    visibility: "internal",
    actor_profile_id: actorId,
  });
  await notifyUsers(recipientIds, {
    event_type: eventType,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    route:
      entityType === RESOURCE_TYPES.PANEL_SCHEDULE
        ? `/electrical/panels/${entityId}`
        : `/electrical/load-calcs/${entityId}`,
    category: "electrical",
    actor_profile_id: actorId,
  });
}

function toPanelListItem(panel: PanelSchedule, circuits?: Circuit[]): PanelListItemView {
  const panelCircuits = circuitsForPanel(panel.id, circuits).map(toCircuitView);
  const warnings = buildPanelWarnings(panelCircuits);
  return {
    id: panel.id,
    organization_id: panel.organization_id,
    project_id: panel.project_id,
    project_name: projectName(panel.project_id),
    panel_name: panel.panel_name,
    panel_type: panel.panel_type,
    voltage: panel.voltage,
    phase: panel.phase,
    location: panel.location,
    status: panel.status,
    revision_number: panel.revision_number,
    circuit_count: panelCircuits.length,
    total_connected_load_va: computePanelTotalLoadVa(panelCircuits),
    warning_count: warnings.length,
    created_by_name: profileName(panel.created_by),
    updated_at: panel.updated_at,
  };
}

async function buildPanelView(panel: PanelSchedule, circuits?: Circuit[]): Promise<PanelView> {
  const { role } = getSessionContext();
  const actorId = await getActorProfileId();
  const panelCircuits = circuitsForPanel(panel.id, circuits).map(toCircuitView);
  const perms = computePanelPermissions(panel, actorId, role);

  return {
    ...panel,
    project_name: projectName(panel.project_id),
    created_by_name: profileName(panel.created_by),
    total_connected_load_va: computePanelTotalLoadVa(panelCircuits),
    ...perms,
  };
}

async function buildLoadCalcListItem(
  lc: LoadCalculation,
  panels?: PanelSchedule[],
): Promise<LoadCalculationListItemView> {
  const preview = computeLoadCalculationPreview({
    total_connected_load_va: lc.total_connected_load_va,
    demand_factor: lc.demand_factor,
    voltage: lc.voltage,
    phase: lc.phase,
  });
  return {
    id: lc.id,
    project_id: lc.project_id,
    project_name: projectName(lc.project_id),
    calculation_name: lc.calculation_name,
    calculation_type: lc.calculation_type,
    status: lc.status,
    revision_number: lc.revision_number,
    total_connected_load_va: lc.total_connected_load_va,
    demand_factor: lc.demand_factor,
    demand_load_va: lc.demand_load_va,
    calculated_current_a: lc.calculated_current_a,
    preview_demand_load_va: preview.demand_load_va,
    preview_current_a: preview.calculated_current_a,
    is_stale_panel_snapshot: isStalePanelSnapshot(lc, panels),
    updated_at: lc.updated_at,
  };
}

async function buildLoadCalcView(
  lc: LoadCalculation,
  panels?: PanelSchedule[],
): Promise<LoadCalculationView> {
  const { role } = getSessionContext();
  const actorId = await getActorProfileId();
  const preview = computeLoadCalculationPreview({
    total_connected_load_va: lc.total_connected_load_va,
    demand_factor: lc.demand_factor,
    voltage: lc.voltage,
    phase: lc.phase,
  });
  let allPanels = panels;
  if (!allPanels) {
    if (!shouldUseSupabase()) {
      allPanels = getMockPanels();
    } else if (lc.source_panel_id) {
      const { data: panelRow } = await getDb()
        .from("panel_schedules")
        .select("*")
        .eq("id", lc.source_panel_id)
        .maybeSingle();
      allPanels = panelRow ? [panelRow as PanelSchedule] : [];
    } else {
      allPanels = [];
    }
  }
  const sourcePanel = lc.source_panel_id
    ? allPanels.find((p) => p.id === lc.source_panel_id)
    : null;

  return {
    ...lc,
    project_name: projectName(lc.project_id),
    source_panel_name: sourcePanel?.panel_name ?? null,
    preview_demand_load_va: preview.demand_load_va,
    preview_current_a: preview.calculated_current_a,
    is_stale_panel_snapshot: isStalePanelSnapshot(lc, allPanels),
    ...computeLoadCalcPermissions(lc, actorId, role),
  };
}

function toEquipmentView(eq: EquipmentList): EquipmentView {
  return {
    id: eq.id,
    organization_id: eq.organization_id,
    project_id: eq.project_id,
    project_name: projectName(eq.project_id),
    tag: eq.tag,
    equipment_type: eq.equipment_type,
    description: eq.description,
    manufacturer: eq.manufacturer,
    model: eq.model,
    voltage: eq.voltage,
    phase: eq.phase,
    load_va: eq.load_va,
    location: eq.location,
    status: eq.status,
    created_at: eq.created_at,
    updated_at: eq.updated_at,
  };
}

// ─── Panels ───────────────────────────────────────────────────────────────────

export async function listPanels(
  filters: PanelFilterInput = {},
): Promise<ServiceResult<CursorPage<PanelListItemView>>> {
  const limit = filters.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    const circuits = getMockCircuits();
    let items = getMockPanels().filter((p) => !p.deleted_at);

    if (!filters.include_archived) items = items.filter((p) => p.status !== "archived");
    if (filters.status && filters.status !== "all") {
      items = items.filter((p) => p.status === filters.status);
    }
    if (filters.project_id) items = items.filter((p) => p.project_id === filters.project_id);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      items = items.filter(
        (p) =>
          p.panel_name.toLowerCase().includes(term) ||
          (p.location ?? "").toLowerCase().includes(term),
      );
    }

    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((p) => p.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }

    const page = items.slice(0, limit);
    const views = page.map((p) => toPanelListItem(p, circuits));
    const next_cursor =
      items.length > limit
        ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].id)
        : null;

    return mockOk({ items: views, next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("panel_schedules")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (!filters.include_archived) q = q.neq("status", "archived");
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.project_id) q = q.eq("project_id", filters.project_id);
    if (filters.search) q = q.ilike("panel_name", `%${filters.search}%`);

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `updated_at.lt.${decoded.created_at},and(updated_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as PanelSchedule[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const views: PanelListItemView[] = await Promise.all(
      page.map(async (p) => {
        const { data: circuitRows } = await getDb()
          .from("circuits")
          .select("*")
          .eq("panel_schedule_id", p.id)
          .is("deleted_at", null);

        const { data: proj } = p.project_id
          ? await getDb().from("projects").select("name").eq("id", p.project_id).maybeSingle()
          : { data: null };

        const panelCircuits = (circuitRows ?? []).map((c) => toCircuitView(c as Circuit));
        const warnings = buildPanelWarnings(panelCircuits);

        let created_by_name: string | null = null;
        if (p.created_by) {
          const { data: profile } = await getDb()
            .from("profiles")
            .select("full_name")
            .eq("id", p.created_by)
            .maybeSingle();
          created_by_name = (profile?.full_name as string) ?? "Former User";
        }

        return {
          id: p.id,
          organization_id: p.organization_id,
          project_id: p.project_id,
          project_name: (proj?.name as string) ?? null,
          panel_name: p.panel_name,
          panel_type: p.panel_type,
          voltage: p.voltage,
          phase: p.phase,
          location: p.location,
          status: p.status,
          revision_number: p.revision_number,
          circuit_count: panelCircuits.length,
          total_connected_load_va: computePanelTotalLoadVa(panelCircuits),
          warning_count: warnings.length,
          created_by_name,
          updated_at: p.updated_at,
        };
      }),
    );

    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].id)
        : null;

    return ok({ items: views, next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function getPanel(id: string): Promise<ServiceResult<PanelView>> {
  if (!shouldUseSupabase()) {
    const panel = getMockPanels().find((p) => p.id === id && !p.deleted_at);
    if (!panel) return fail({ message: "Panel schedule not found.", code: "NOT_FOUND" });
    return mockOk(await buildPanelView(panel));
  }

  try {
    const { data, error } = await getDb()
      .from("panel_schedules")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail(error);
    if (!data) return fail({ message: "Panel schedule not found.", code: "NOT_FOUND" });

    return ok(await buildPanelView(data as PanelSchedule));
  } catch (err) {
    return fail(err);
  }
}

export async function createPanel(input: PanelCreateInput): Promise<ServiceResult<PanelView>> {
  const { role, organizationId } = getSessionContext();
  if (!canCreateElectrical(role)) {
    return fail("You do not have permission to create panel schedules.");
  }

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const row: PanelSchedule = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    project_id: input.project_id,
    panel_name: input.panel_name.trim(),
    panel_type: input.panel_type ?? "distribution",
    voltage: input.voltage ?? 480,
    phase: input.phase ?? "three",
    location: input.location ?? null,
    fed_from: input.fed_from ?? null,
    main_breaker_size: input.main_breaker_size ?? null,
    bus_rating: input.bus_rating ?? null,
    mounting: input.mounting ?? null,
    enclosure_type: input.enclosure_type ?? null,
    status: "draft",
    revision_number: 1,
    previous_status: null,
    created_by: actorId,
    updated_by: actorId,
    reviewed_by: null,
    approved_by: null,
    reviewed_at: null,
    approved_at: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (!shouldUseSupabase()) {
    saveMockPanels([row, ...getMockPanels()]);
    await logAction({
      action: "panel_schedule.created",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: row.id,
      new_data: { panel_name: row.panel_name },
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_CREATED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      row.id,
      row.panel_name,
      "Panel schedule created",
      `"${row.panel_name}" was created.`,
      approverRecipientIds(actorId),
      actorId,
    );
    return getPanel(row.id);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("panel_schedules")
      .insert({
        organization_id: organizationId,
        project_id: input.project_id,
        panel_name: input.panel_name.trim(),
        panel_type: input.panel_type ?? "distribution",
        voltage: input.voltage ?? 480,
        phase: input.phase ?? "three",
        location: input.location ?? null,
        fed_from: input.fed_from ?? null,
        main_breaker_size: input.main_breaker_size ?? null,
        bus_rating: input.bus_rating ?? null,
        mounting: input.mounting ?? null,
        enclosure_type: input.enclosure_type ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return fail("A panel with this name already exists on the project.");
      }
      return fail(error);
    }

    const panel = data as PanelSchedule;
    await logAction({
      action: "panel_schedule.created",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: panel.id,
      new_data: { panel_name: panel.panel_name },
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_CREATED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      panel.id,
      panel.panel_name,
      "Panel schedule created",
      `"${panel.panel_name}" was created.`,
      approverRecipientIds(actorId),
      actorId,
    );
    return getPanel(panel.id);
  } catch (err) {
    return fail(err);
  }
}

export async function updatePanel(
  id: string,
  input: PanelUpdateInput,
): Promise<ServiceResult<PanelView>> {
  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;
  const lockErr = assertPanelEditable(existing);
  if (lockErr) return lockErr;

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = { ...all[idx], ...input, updated_by: actorId, updated_at: now };
    saveMockPanels(all);
    await logAction({
      action: "panel_schedule.updated",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    return getPanel(id);
  }

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({ ...input, updated_by: actorId, updated_at: now })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "panel_schedule.updated",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

export async function submitPanel(id: string): Promise<ServiceResult<PanelView>> {
  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;

  if (!["draft", "rejected"].includes(existing.status)) {
    return fail(`Cannot submit panel from status "${existing.status}".`);
  }

  const actorId = await getActorProfileId();
  const { organizationId } = getSessionContext();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = {
      ...all[idx],
      status: "under_review",
      reviewed_at: now,
      reviewed_by: actorId,
      updated_by: actorId,
      updated_at: now,
      rejection_reason: null,
    };
    saveMockPanels(all);
    await logAction({
      action: "panel_schedule.submitted",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REVISED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel submitted for review",
      `"${existing.panel_name}" was submitted for approval.`,
      approverRecipientIds(existing.created_by),
      actorId,
    );
    return getPanel(id);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({
        status: "under_review",
        reviewed_at: now,
        reviewed_by: actorId,
        updated_by: actorId,
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "panel_schedule.submitted",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REVISED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel submitted for review",
      `"${existing.panel_name}" was submitted for approval.`,
      approverRecipientIds(existing.created_by),
      actorId,
    );
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

export async function approvePanel(id: string): Promise<ServiceResult<PanelView>> {
  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;

  if (existing.status !== "under_review") {
    return fail("Only panels under review can be approved.");
  }

  const { role } = getSessionContext();
  if (!canApproveElectrical(role)) {
    return fail("You do not have permission to approve panel schedules.");
  }

  const actorId = await getActorProfileId();
  const selfErr = checkSelfApproval(existing.created_by, actorId, role);
  if (selfErr) return selfErr;

  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = {
      ...all[idx],
      status: "approved",
      approved_at: now,
      approved_by: actorId,
      updated_by: actorId,
      updated_at: now,
      rejection_reason: null,
    };
    saveMockPanels(all);
    await logAction({
      action: "panel_schedule.approved",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_APPROVED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel schedule approved",
      `"${existing.panel_name}" was approved.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getPanel(id);
  }

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({
        status: "approved",
        approved_at: now,
        approved_by: actorId,
        updated_by: actorId,
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "panel_schedule.approved",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_APPROVED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel schedule approved",
      `"${existing.panel_name}" was approved.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

export async function rejectPanel(id: string, reason: string): Promise<ServiceResult<PanelView>> {
  if (!reason?.trim()) {
    return fail("Rejection reason is required.");
  }

  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;

  if (existing.status !== "under_review") {
    return fail("Only panels under review can be rejected.");
  }

  const { role } = getSessionContext();
  if (!canApproveElectrical(role)) {
    return fail("You do not have permission to reject panel schedules.");
  }

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = {
      ...all[idx],
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: actorId,
      reviewed_at: now,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockPanels(all);
    await logAction({
      action: "panel_schedule.rejected",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
      new_data: { reason: reason.trim() },
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REJECTED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel schedule rejected",
      `"${existing.panel_name}" was rejected: ${reason.trim()}`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getPanel(id);
  }

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        reviewed_by: actorId,
        reviewed_at: now,
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "panel_schedule.rejected",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
      new_data: { reason: reason.trim() },
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REJECTED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel schedule rejected",
      `"${existing.panel_name}" was rejected: ${reason.trim()}`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

export async function archivePanel(id: string): Promise<ServiceResult<PanelView>> {
  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;

  const { role } = getSessionContext();
  if (!isAdminOrPM(role)) {
    return fail("Only Admin and Project Manager can archive panel schedules.");
  }
  if (existing.status === "archived") return getPanel(id);

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = {
      ...all[idx],
      previous_status: all[idx].status,
      status: "archived",
      updated_by: actorId,
      updated_at: now,
    };
    saveMockPanels(all);
    await logAction({
      action: "panel_schedule.archived",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    return getPanel(id);
  }

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({
        previous_status: existing.status,
        status: "archived",
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "panel_schedule.archived",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

export async function restorePanel(id: string): Promise<ServiceResult<PanelView>> {
  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;

  const { role } = getSessionContext();
  if (!isAdminOrPM(role)) {
    return fail("Only Admin and Project Manager can restore panel schedules.");
  }
  if (existing.status !== "archived") {
    return fail("Only archived panels can be restored.");
  }

  const returnStatus = (existing.previous_status as ElectricalWorkflowStatus) ?? "draft";
  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = {
      ...all[idx],
      status: returnStatus,
      previous_status: null,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockPanels(all);
    await logAction({
      action: "panel_schedule.restored",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    return getPanel(id);
  }

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({
        status: returnStatus,
        previous_status: null,
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "panel_schedule.restored",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

export async function reopenPanel(id: string): Promise<ServiceResult<PanelView>> {
  const existingRes = await getPanel(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Panel schedule not found.");
  }
  const existing = existingRes.data;

  const { role, organizationId } = getSessionContext();
  if (!isAdminOrPM(role)) {
    return fail("Only Admin and Project Manager can reopen approved panels.");
  }
  if (existing.status !== "approved") {
    return fail("Only approved panels can be reopened.");
  }

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();
  const newRevision = existing.revision_number + 1;

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) return fail("Panel schedule not found.");
    all[idx] = {
      ...all[idx],
      status: "draft",
      revision_number: newRevision,
      approved_at: null,
      approved_by: null,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockPanels(all);
    await createElectricalRevision(
      "panel_schedule",
      id,
      newRevision,
      "Panel reopened for revision after approval",
      actorId,
      orgId,
    );
    await logAction({
      action: "panel_schedule.reopened",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REVISED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel schedule reopened",
      `"${existing.panel_name}" was reopened for editing.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getPanel(id);
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { error } = await getDb()
      .from("panel_schedules")
      .update({
        status: "draft",
        revision_number: newRevision,
        approved_at: null,
        approved_by: null,
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await createElectricalRevision(
      "panel_schedule",
      id,
      newRevision,
      "Panel reopened for revision after approval",
      actorId,
      organizationId,
    );
    await logAction({
      action: "panel_schedule.reopened",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REVISED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      id,
      existing.panel_name,
      "Panel schedule reopened",
      `"${existing.panel_name}" was reopened for editing.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getPanel(id);
  } catch (err) {
    return fail(err);
  }
}

// ─── Circuits ─────────────────────────────────────────────────────────────────

async function bumpPanelRevisionForCircuitChange(
  panelId: string,
  summary: string,
): Promise<ServiceResult<PanelSchedule>> {
  const panelRes = await getPanel(panelId);
  if (panelRes.error || !panelRes.data) return fail(panelRes.error ?? "Panel not found.");

  const panel = panelRes.data;
  const lockErr = assertCircuitsEditable(panel);
  if (lockErr) return lockErr;

  const actorId = await getActorProfileId();
  const { organizationId } = getSessionContext();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();
  const newRevision = panel.revision_number + 1;

  if (!shouldUseSupabase()) {
    const all = getMockPanels();
    const idx = all.findIndex((p) => p.id === panelId);
    if (idx === -1) return fail("Panel not found.");
    all[idx] = {
      ...all[idx],
      revision_number: newRevision,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockPanels(all);
    await createElectricalRevision("panel_schedule", panelId, newRevision, summary, actorId, orgId);
    await logAction({
      action: "panel_schedule.revised",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: panelId,
      new_data: { revision_number: newRevision, summary },
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REVISED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      panelId,
      panel.panel_name,
      "Panel schedule revised",
      summary,
      approverRecipientIds(panel.created_by),
      actorId,
    );
    return mockOk(all[idx]);
  }

  try {
    const { data, error } = await getDb()
      .from("panel_schedules")
      .update({ revision_number: newRevision, updated_by: actorId })
      .eq("id", panelId)
      .select()
      .single();
    if (error) return fail(error);

    await createElectricalRevision(
      "panel_schedule",
      panelId,
      newRevision,
      summary,
      actorId,
      organizationId!,
    );
    await logAction({
      action: "panel_schedule.revised",
      resource_type: RESOURCE_TYPES.PANEL_SCHEDULE,
      resource_id: panelId,
      new_data: { revision_number: newRevision, summary },
    });
    await emitElectricalEvent(
      EVENT_TYPES.PANEL_SCHEDULE_REVISED,
      RESOURCE_TYPES.PANEL_SCHEDULE,
      panelId,
      panel.panel_name,
      "Panel schedule revised",
      summary,
      approverRecipientIds(panel.created_by),
      actorId,
    );
    return ok(data as PanelSchedule);
  } catch (err) {
    return fail(err);
  }
}

export async function listCircuits(panelId: string): Promise<ServiceResult<CircuitView[]>> {
  if (!shouldUseSupabase()) {
    const items = circuitsForPanel(panelId).map(toCircuitView);
    return mockOk(items);
  }

  try {
    const { data, error } = await getDb()
      .from("circuits")
      .select("*")
      .eq("panel_schedule_id", panelId)
      .is("deleted_at", null)
      .order("circuit_number", { ascending: true });

    if (error) return fail(error);
    return ok((data ?? []).map((c) => toCircuitView(c as Circuit)));
  } catch (err) {
    return fail(err);
  }
}

export async function addCircuit(
  panelId: string,
  input: CircuitCreateInput,
): Promise<ServiceResult<CircuitView>> {
  const panelRes = await getPanel(panelId);
  if (panelRes.error || !panelRes.data) return fail("Panel schedule not found.");

  const lockErr = assertCircuitsEditable(panelRes.data);
  if (lockErr) return lockErr;

  const actorId = await getActorProfileId();
  const { organizationId } = getSessionContext();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const row: Circuit = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    panel_schedule_id: panelId,
    circuit_number: input.circuit_number.trim(),
    circuit_side: input.circuit_side ?? "na",
    description: input.description ?? null,
    load_va: input.load_va ?? 0,
    breaker_size: input.breaker_size ?? null,
    poles: input.poles ?? null,
    phase: input.phase ?? null,
    wire_size: input.wire_size ?? null,
    conduit_size: input.conduit_size ?? null,
    voltage: input.voltage ?? null,
    remarks: input.remarks ?? null,
    created_by: actorId,
    updated_by: actorId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (!shouldUseSupabase()) {
    const dup = getMockCircuits().find(
      (c) =>
        c.panel_schedule_id === panelId && c.circuit_number === row.circuit_number && !c.deleted_at,
    );
    if (dup) return fail("Circuit number already exists on this panel.");

    saveMockCircuits([row, ...getMockCircuits()]);
    await bumpPanelRevisionForCircuitChange(panelId, `Added circuit ${row.circuit_number}`);
    await logAction({
      action: "circuit.created",
      resource_type: RESOURCE_TYPES.CIRCUIT,
      resource_id: row.id,
      new_data: { panel_id: panelId, circuit_number: row.circuit_number },
    });
    return mockOk(toCircuitView(row));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("circuits")
      .insert({
        organization_id: organizationId,
        panel_schedule_id: panelId,
        circuit_number: input.circuit_number.trim(),
        circuit_side: input.circuit_side ?? "na",
        description: input.description ?? null,
        load_va: input.load_va ?? 0,
        breaker_size: input.breaker_size ?? null,
        poles: input.poles ?? null,
        phase: input.phase ?? null,
        wire_size: input.wire_size ?? null,
        conduit_size: input.conduit_size ?? null,
        voltage: input.voltage ?? null,
        remarks: input.remarks ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return fail("Circuit number already exists on this panel.");
      return fail(error);
    }

    await bumpPanelRevisionForCircuitChange(
      panelId,
      `Added circuit ${input.circuit_number.trim()}`,
    );
    await logAction({
      action: "circuit.created",
      resource_type: RESOURCE_TYPES.CIRCUIT,
      resource_id: (data as Circuit).id,
      new_data: { panel_id: panelId, circuit_number: input.circuit_number },
    });
    return mockOk(toCircuitView(data as Circuit));
  } catch (err) {
    return fail(err);
  }
}

export async function updateCircuit(
  id: string,
  input: CircuitUpdateInput,
): Promise<ServiceResult<CircuitView>> {
  if (!shouldUseSupabase()) {
    const all = getMockCircuits();
    const idx = all.findIndex((c) => c.id === id && !c.deleted_at);
    if (idx === -1) return fail("Circuit not found.");

    const panelRes = await getPanel(all[idx].panel_schedule_id);
    if (panelRes.error || !panelRes.data) return fail("Panel schedule not found.");
    const lockErr = assertCircuitsEditable(panelRes.data);
    if (lockErr) return lockErr;

    const actorId = await getActorProfileId();
    all[idx] = { ...all[idx], ...input, updated_by: actorId, updated_at: new Date().toISOString() };
    saveMockCircuits(all);
    await bumpPanelRevisionForCircuitChange(
      all[idx].panel_schedule_id,
      `Updated circuit ${all[idx].circuit_number}`,
    );
    await logAction({
      action: "circuit.updated",
      resource_type: RESOURCE_TYPES.CIRCUIT,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    return mockOk(toCircuitView(all[idx]));
  }

  try {
    const { data: existing } = await getDb()
      .from("circuits")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return fail("Circuit not found.");
    const ex = existing as Circuit;

    const panelRes = await getPanel(ex.panel_schedule_id);
    if (panelRes.error || !panelRes.data) return fail("Panel schedule not found.");
    const lockErr = assertCircuitsEditable(panelRes.data);
    if (lockErr) return lockErr;

    const actorId = await getActorProfileId();
    const { data, error } = await getDb()
      .from("circuits")
      .update({ ...input, updated_by: actorId })
      .eq("id", id)
      .select()
      .single();

    if (error) return fail(error);

    await bumpPanelRevisionForCircuitChange(
      ex.panel_schedule_id,
      `Updated circuit ${(data as Circuit).circuit_number}`,
    );
    await logAction({
      action: "circuit.updated",
      resource_type: RESOURCE_TYPES.CIRCUIT,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    return ok(toCircuitView(data as Circuit));
  } catch (err) {
    return fail(err);
  }
}

export async function removeCircuit(id: string): Promise<ServiceResult<boolean>> {
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockCircuits();
    const idx = all.findIndex((c) => c.id === id && !c.deleted_at);
    if (idx === -1) return fail("Circuit not found.");

    const panelRes = await getPanel(all[idx].panel_schedule_id);
    if (panelRes.error || !panelRes.data) return fail("Panel schedule not found.");
    const lockErr = assertCircuitsEditable(panelRes.data);
    if (lockErr) return lockErr;

    const circuitNumber = all[idx].circuit_number;
    const panelId = all[idx].panel_schedule_id;
    all[idx] = { ...all[idx], deleted_at: now };
    saveMockCircuits(all);
    await bumpPanelRevisionForCircuitChange(panelId, `Removed circuit ${circuitNumber}`);
    await logAction({
      action: "circuit.removed",
      resource_type: RESOURCE_TYPES.CIRCUIT,
      resource_id: id,
    });
    return mockOk(true);
  }

  try {
    const { data: existing } = await getDb()
      .from("circuits")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return fail("Circuit not found.");
    const ex = existing as Circuit;

    const panelRes = await getPanel(ex.panel_schedule_id);
    if (panelRes.error || !panelRes.data) return fail("Panel schedule not found.");
    const lockErr = assertCircuitsEditable(panelRes.data);
    if (lockErr) return lockErr;

    const { error } = await getDb().from("circuits").update({ deleted_at: now }).eq("id", id);
    if (error) return fail(error);

    await bumpPanelRevisionForCircuitChange(
      ex.panel_schedule_id,
      `Removed circuit ${ex.circuit_number}`,
    );
    await logAction({
      action: "circuit.removed",
      resource_type: RESOURCE_TYPES.CIRCUIT,
      resource_id: id,
    });
    return ok(true);
  } catch (err) {
    return fail(err);
  }
}

export async function getPanelLoadSummary(
  panelId: string,
): Promise<ServiceResult<PanelLoadSummaryView>> {
  const circuitsRes = await listCircuits(panelId);
  if (circuitsRes.error || !circuitsRes.data) {
    return fail(circuitsRes.error ?? "Failed to load circuits.");
  }

  const circuits = circuitsRes.data;
  return circuitsRes.isMockData
    ? mockOk({
        total_connected_load_va: computePanelTotalLoadVa(circuits),
        phase_loads: computePhaseLoads(circuits),
        warnings: buildPanelWarnings(circuits),
        circuit_count: circuits.length,
      })
    : ok({
        total_connected_load_va: computePanelTotalLoadVa(circuits),
        phase_loads: computePhaseLoads(circuits),
        warnings: buildPanelWarnings(circuits),
        circuit_count: circuits.length,
      });
}

// ─── Load calculations ───────────────────────────────────────────────────────

export async function listLoadCalculations(
  filters: LoadCalculationFilterInput = {},
): Promise<ServiceResult<CursorPage<LoadCalculationListItemView>>> {
  const limit = filters.limit ?? PAGE_SIZE;

  if (!shouldUseSupabase()) {
    const panels = getMockPanels();
    let items = getMockLoadCalcs().filter((lc) => !lc.deleted_at);

    if (!filters.include_archived) items = items.filter((lc) => lc.status !== "archived");
    if (filters.status && filters.status !== "all") {
      items = items.filter((lc) => lc.status === filters.status);
    }
    if (filters.project_id) items = items.filter((lc) => lc.project_id === filters.project_id);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      items = items.filter((lc) => lc.calculation_name.toLowerCase().includes(term));
    }

    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        const idx = items.findIndex((lc) => lc.id === decoded.id);
        if (idx !== -1) items = items.slice(idx + 1);
      }
    }

    const page = items.slice(0, limit);
    const views = await Promise.all(page.map((lc) => buildLoadCalcListItem(lc, panels)));
    const next_cursor =
      items.length > limit
        ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].id)
        : null;

    return mockOk({ items: views, next_cursor });
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("load_calculations")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (!filters.include_archived) q = q.neq("status", "archived");
    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.project_id) q = q.eq("project_id", filters.project_id);
    if (filters.search) q = q.ilike("calculation_name", `%${filters.search}%`);

    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        q = q.or(
          `updated_at.lt.${decoded.created_at},and(updated_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
        );
      }
    }

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as LoadCalculation[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const panelIds = [...new Set(page.map((lc) => lc.source_panel_id).filter(Boolean))] as string[];
    let panelMap = new Map<string, PanelSchedule>();
    if (panelIds.length) {
      const { data: panelRows } = await getDb()
        .from("panel_schedules")
        .select("*")
        .in("id", panelIds);
      panelMap = new Map(
        (panelRows ?? []).map((p) => [(p as PanelSchedule).id, p as PanelSchedule]),
      );
    }

    const views = await Promise.all(
      page.map((lc) => buildLoadCalcListItem(lc, [...panelMap.values()])),
    );

    const next_cursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].updated_at, page[page.length - 1].id)
        : null;

    return ok({ items: views, next_cursor });
  } catch (err) {
    return fail(err);
  }
}

export async function getLoadCalculation(id: string): Promise<ServiceResult<LoadCalculationView>> {
  if (!shouldUseSupabase()) {
    const lc = getMockLoadCalcs().find((x) => x.id === id && !x.deleted_at);
    if (!lc) return fail({ message: "Load calculation not found.", code: "NOT_FOUND" });
    return mockOk(await buildLoadCalcView(lc));
  }

  try {
    const { data, error } = await getDb()
      .from("load_calculations")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return fail(error);
    if (!data) return fail({ message: "Load calculation not found.", code: "NOT_FOUND" });

    return ok(await buildLoadCalcView(data as LoadCalculation));
  } catch (err) {
    return fail(err);
  }
}

export async function createLoadCalculation(
  input: LoadCalculationCreateInput,
): Promise<ServiceResult<LoadCalculationView>> {
  const { role, organizationId } = getSessionContext();
  if (!canCreateElectrical(role)) {
    return fail("You do not have permission to create load calculations.");
  }

  const demandFactor = input.demand_factor ?? 1;
  const dfErr = validateDemandFactor(demandFactor);
  if (dfErr) return fail(dfErr);

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  let sourcePanelRevision: number | null = null;
  if (input.source_panel_id) {
    const panel = getMockPanels().find((p) => p.id === input.source_panel_id);
    sourcePanelRevision = panel?.revision_number ?? null;
  }

  const row: LoadCalculation = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    project_id: input.project_id,
    calculation_name: input.calculation_name.trim(),
    calculation_type: input.calculation_type ?? "panel_load",
    source_panel_id: input.source_panel_id ?? null,
    total_connected_load_va: input.total_connected_load_va ?? 0,
    demand_factor: demandFactor,
    demand_load_va: null,
    voltage: input.voltage ?? 480,
    phase: input.phase ?? "three",
    calculated_current_a: null,
    source_panel_revision: sourcePanelRevision,
    status: "draft",
    revision_number: 1,
    previous_status: null,
    created_by: actorId,
    updated_by: actorId,
    reviewed_by: null,
    approved_by: null,
    reviewed_at: null,
    approved_at: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (!shouldUseSupabase()) {
    saveMockLoadCalcs([row, ...getMockLoadCalcs()]);
    await logAction({
      action: "load_calculation.created",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: row.id,
      new_data: { calculation_name: row.calculation_name },
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_CREATED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      row.id,
      row.calculation_name,
      "Load calculation created",
      `"${row.calculation_name}" was created.`,
      approverRecipientIds(actorId),
      actorId,
    );
    return getLoadCalculation(row.id);
  }

  if (!organizationId) return fail("No active session.");

  try {
    if (input.source_panel_id) {
      const { data: panel } = await getDb()
        .from("panel_schedules")
        .select("revision_number")
        .eq("id", input.source_panel_id)
        .maybeSingle();
      sourcePanelRevision = (panel?.revision_number as number) ?? null;
    }

    const { data, error } = await getDb()
      .from("load_calculations")
      .insert({
        organization_id: organizationId,
        project_id: input.project_id,
        calculation_name: input.calculation_name.trim(),
        calculation_type: input.calculation_type ?? "panel_load",
        source_panel_id: input.source_panel_id ?? null,
        total_connected_load_va: input.total_connected_load_va ?? 0,
        demand_factor: demandFactor,
        voltage: input.voltage ?? 480,
        phase: input.phase ?? "three",
        source_panel_revision: sourcePanelRevision,
        created_by: actorId,
        updated_by: actorId,
      })
      .select()
      .single();

    if (error) return fail(error);

    const lc = data as LoadCalculation;
    await logAction({
      action: "load_calculation.created",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: lc.id,
      new_data: { calculation_name: lc.calculation_name },
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_CREATED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      lc.id,
      lc.calculation_name,
      "Load calculation created",
      `"${lc.calculation_name}" was created.`,
      approverRecipientIds(actorId),
      actorId,
    );
    return getLoadCalculation(lc.id);
  } catch (err) {
    return fail(err);
  }
}

export async function updateLoadCalculation(
  id: string,
  input: LoadCalculationUpdateInput,
): Promise<ServiceResult<LoadCalculationView>> {
  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;
  const lockErr = assertLoadCalcEditable(existing);
  if (lockErr) return lockErr;

  if (input.demand_factor !== undefined) {
    const dfErr = validateDemandFactor(input.demand_factor);
    if (dfErr) return fail(dfErr);
  }

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();
  const updatePayload = {
    ...input,
    demand_load_va: null,
    calculated_current_a: null,
    updated_by: actorId,
    updated_at: now,
  };

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = { ...all[idx], ...updatePayload };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.updated",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_UPDATED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation updated",
      `"${existing.calculation_name}" was updated.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb().from("load_calculations").update(updatePayload).eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.updated",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_UPDATED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation updated",
      `"${existing.calculation_name}" was updated.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export async function submitLoadCalculation(
  id: string,
): Promise<ServiceResult<LoadCalculationView>> {
  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;

  if (!["draft", "rejected"].includes(existing.status)) {
    return fail(`Cannot submit load calculation from status "${existing.status}".`);
  }

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = {
      ...all[idx],
      status: "under_review",
      reviewed_at: now,
      reviewed_by: actorId,
      updated_by: actorId,
      updated_at: now,
      rejection_reason: null,
    };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.submitted",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_UPDATED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation submitted",
      `"${existing.calculation_name}" was submitted for approval.`,
      approverRecipientIds(existing.created_by),
      actorId,
    );
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb()
      .from("load_calculations")
      .update({
        status: "under_review",
        reviewed_at: now,
        reviewed_by: actorId,
        updated_by: actorId,
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.submitted",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_UPDATED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation submitted",
      `"${existing.calculation_name}" was submitted for approval.`,
      approverRecipientIds(existing.created_by),
      actorId,
    );
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export async function approveLoadCalculation(
  id: string,
): Promise<ServiceResult<LoadCalculationView>> {
  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;

  if (existing.status !== "under_review") {
    return fail("Only load calculations under review can be approved.");
  }

  const { role } = getSessionContext();
  if (!canApproveElectrical(role)) {
    return fail("You do not have permission to approve load calculations.");
  }

  const actorId = await getActorProfileId();
  const selfErr = checkSelfApproval(existing.created_by, actorId, role);
  if (selfErr) return selfErr;

  const computed = computeLoadCalculationPreview({
    total_connected_load_va: existing.total_connected_load_va,
    demand_factor: existing.demand_factor,
    voltage: existing.voltage,
    phase: existing.phase,
  });
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = {
      ...all[idx],
      status: "approved",
      demand_load_va: computed.demand_load_va,
      calculated_current_a: computed.calculated_current_a,
      approved_at: now,
      approved_by: actorId,
      updated_by: actorId,
      updated_at: now,
      rejection_reason: null,
    };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.approved",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: {
        demand_load_va: computed.demand_load_va,
        calculated_current_a: computed.calculated_current_a,
      },
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_APPROVED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation approved",
      `"${existing.calculation_name}" was approved.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb()
      .from("load_calculations")
      .update({
        status: "approved",
        demand_load_va: computed.demand_load_va,
        calculated_current_a: computed.calculated_current_a,
        approved_at: now,
        approved_by: actorId,
        updated_by: actorId,
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.approved",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: {
        demand_load_va: computed.demand_load_va,
        calculated_current_a: computed.calculated_current_a,
      },
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_APPROVED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation approved",
      `"${existing.calculation_name}" was approved.`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export async function rejectLoadCalculation(
  id: string,
  reason: string,
): Promise<ServiceResult<LoadCalculationView>> {
  if (!reason?.trim()) {
    return fail("Rejection reason is required.");
  }

  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;

  if (existing.status !== "under_review") {
    return fail("Only load calculations under review can be rejected.");
  }

  const { role } = getSessionContext();
  if (!canApproveElectrical(role)) {
    return fail("You do not have permission to reject load calculations.");
  }

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = {
      ...all[idx],
      status: "rejected",
      rejection_reason: reason.trim(),
      reviewed_by: actorId,
      reviewed_at: now,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.rejected",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: { reason: reason.trim() },
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_REJECTED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation rejected",
      `"${existing.calculation_name}" was rejected: ${reason.trim()}`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb()
      .from("load_calculations")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        reviewed_by: actorId,
        reviewed_at: now,
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.rejected",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: { reason: reason.trim() },
    });
    await emitElectricalEvent(
      EVENT_TYPES.LOAD_CALCULATION_REJECTED,
      RESOURCE_TYPES.LOAD_CALCULATION,
      id,
      existing.calculation_name,
      "Load calculation rejected",
      `"${existing.calculation_name}" was rejected: ${reason.trim()}`,
      existing.created_by ? [existing.created_by] : [],
      actorId,
    );
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export async function archiveLoadCalculation(
  id: string,
): Promise<ServiceResult<LoadCalculationView>> {
  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;

  const { role } = getSessionContext();
  if (!isAdminOrPM(role)) {
    return fail("Only Admin and Project Manager can archive load calculations.");
  }
  if (existing.status === "archived") return getLoadCalculation(id);

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = {
      ...all[idx],
      previous_status: all[idx].status,
      status: "archived",
      updated_by: actorId,
      updated_at: now,
    };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.archived",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
    });
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb()
      .from("load_calculations")
      .update({
        previous_status: existing.status,
        status: "archived",
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.archived",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
    });
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export async function restoreLoadCalculation(
  id: string,
): Promise<ServiceResult<LoadCalculationView>> {
  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;

  const { role } = getSessionContext();
  if (!isAdminOrPM(role)) {
    return fail("Only Admin and Project Manager can restore load calculations.");
  }
  if (existing.status !== "archived") {
    return fail("Only archived load calculations can be restored.");
  }

  const returnStatus = (existing.previous_status as ElectricalWorkflowStatus) ?? "draft";
  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = {
      ...all[idx],
      status: returnStatus,
      previous_status: null,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.restored",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
    });
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb()
      .from("load_calculations")
      .update({
        status: returnStatus,
        previous_status: null,
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.restored",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
    });
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export async function pullConnectedLoadFromPanel(
  id: string,
): Promise<ServiceResult<LoadCalculationView>> {
  const existingRes = await getLoadCalculation(id);
  if (existingRes.error || !existingRes.data) {
    return fail(existingRes.error ?? "Load calculation not found.");
  }
  const existing = existingRes.data;
  const lockErr = assertLoadCalcEditable(existing);
  if (lockErr) return lockErr;

  if (!existing.source_panel_id) {
    return fail("No source panel linked to this load calculation.");
  }

  let total = 0;
  let panelRevision: number | null = null;

  if (!shouldUseSupabase()) {
    total = computePanelLoadFromCircuits(existing.source_panel_id);
    const panel = getMockPanels().find((p) => p.id === existing.source_panel_id);
    panelRevision = panel?.revision_number ?? null;
  } else {
    const summaryRes = await getPanelLoadSummary(existing.source_panel_id);
    if (summaryRes.error || summaryRes.data === null) {
      return fail(summaryRes.error ?? "Failed to read panel load.");
    }
    total = summaryRes.data.total_connected_load_va;
    const { data: panel } = await getDb()
      .from("panel_schedules")
      .select("revision_number")
      .eq("id", existing.source_panel_id)
      .maybeSingle();
    panelRevision = (panel?.revision_number as number) ?? null;
  }

  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockLoadCalcs();
    const idx = all.findIndex((lc) => lc.id === id);
    if (idx === -1) return fail("Load calculation not found.");
    all[idx] = {
      ...all[idx],
      total_connected_load_va: total,
      source_panel_revision: panelRevision,
      demand_load_va: null,
      calculated_current_a: null,
      updated_by: actorId,
      updated_at: now,
    };
    saveMockLoadCalcs(all);
    await logAction({
      action: "load_calculation.pulled_from_panel",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: { total_connected_load_va: total, source_panel_revision: panelRevision },
    });
    return getLoadCalculation(id);
  }

  try {
    const { error } = await getDb()
      .from("load_calculations")
      .update({
        total_connected_load_va: total,
        source_panel_revision: panelRevision,
        demand_load_va: null,
        calculated_current_a: null,
        updated_by: actorId,
      })
      .eq("id", id);
    if (error) return fail(error);

    await logAction({
      action: "load_calculation.pulled_from_panel",
      resource_type: RESOURCE_TYPES.LOAD_CALCULATION,
      resource_id: id,
      new_data: { total_connected_load_va: total, source_panel_revision: panelRevision },
    });
    return getLoadCalculation(id);
  } catch (err) {
    return fail(err);
  }
}

export function calculateLoadValues(input: {
  total_connected_load_va: number;
  demand_factor: number;
  voltage: number;
  phase: "single" | "three";
}): { demand_load_va: number; calculated_current_a: number | null } {
  return computeLoadCalculationPreview(input);
}

// ─── Equipment ────────────────────────────────────────────────────────────────

export async function listEquipment(projectId?: string): Promise<ServiceResult<EquipmentView[]>> {
  if (!shouldUseSupabase()) {
    let items = getMockEquipment().filter((e) => !e.deleted_at);
    if (projectId) items = items.filter((e) => e.project_id === projectId);
    return mockOk(items.map(toEquipmentView));
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    let q = getDb()
      .from("equipment_lists")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("tag", { ascending: true });

    if (projectId) q = q.eq("project_id", projectId);

    const { data, error } = await q;
    if (error) return fail(error);

    const rows = (data ?? []) as EquipmentList[];
    const projectIds = [...new Set(rows.map((r) => r.project_id))];
    let nameMap = new Map<string, string>();
    if (projectIds.length) {
      const { data: projs } = await getDb()
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      nameMap = new Map((projs ?? []).map((p) => [p.id as string, p.name as string]));
    }

    return ok(
      rows.map((eq) => ({
        ...toEquipmentView(eq),
        project_name: nameMap.get(eq.project_id) ?? null,
      })),
    );
  } catch (err) {
    return fail(err);
  }
}

export async function createEquipment(
  input: EquipmentCreateInput,
): Promise<ServiceResult<EquipmentView>> {
  const { role, organizationId } = getSessionContext();
  if (!canCreateElectrical(role)) {
    return fail("You do not have permission to create equipment.");
  }

  const actorId = await getActorProfileId();
  const orgId = organizationId ?? "mock-org";
  const now = new Date().toISOString();

  const row: EquipmentList = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    project_id: input.project_id,
    tag: input.tag.trim(),
    equipment_type: input.equipment_type ?? "other",
    description: input.description ?? null,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    voltage: input.voltage ?? null,
    phase: input.phase ?? null,
    load_va: input.load_va ?? 0,
    location: input.location ?? null,
    status: "active",
    created_by: actorId,
    updated_by: actorId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (!shouldUseSupabase()) {
    saveMockEquipment([row, ...getMockEquipment()]);
    await logAction({
      action: "equipment.created",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: row.id,
      new_data: { tag: row.tag },
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.EQUIPMENT_CREATED,
      entity_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      entity_id: row.id,
      entity_label: row.tag,
      message: `Equipment "${row.tag}" was created.`,
      category: "electrical",
      visibility: "internal",
      actor_profile_id: actorId,
    });
    return mockOk(toEquipmentView(row));
  }

  if (!organizationId) return fail("No active session.");

  try {
    const { data, error } = await getDb()
      .from("equipment_lists")
      .insert({
        organization_id: organizationId,
        project_id: input.project_id,
        tag: input.tag.trim(),
        equipment_type: input.equipment_type ?? "other",
        description: input.description ?? null,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        voltage: input.voltage ?? null,
        phase: input.phase ?? null,
        load_va: input.load_va ?? 0,
        location: input.location ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return fail("Equipment tag already exists on this project.");
      return fail(error);
    }

    const eq = data as EquipmentList;
    await logAction({
      action: "equipment.created",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: eq.id,
      new_data: { tag: eq.tag },
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.EQUIPMENT_CREATED,
      entity_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      entity_id: eq.id,
      entity_label: eq.tag,
      message: `Equipment "${eq.tag}" was created.`,
      category: "electrical",
      visibility: "internal",
      actor_profile_id: actorId,
    });
    return ok(toEquipmentView(eq));
  } catch (err) {
    return fail(err);
  }
}

export async function updateEquipment(
  id: string,
  input: EquipmentUpdateInput,
): Promise<ServiceResult<EquipmentView>> {
  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockEquipment();
    const idx = all.findIndex((e) => e.id === id && !e.deleted_at);
    if (idx === -1) return fail("Equipment not found.");
    all[idx] = { ...all[idx], ...input, updated_by: actorId, updated_at: now };
    saveMockEquipment(all);
    await logAction({
      action: "equipment.updated",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.EQUIPMENT_UPDATED,
      entity_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      entity_id: id,
      entity_label: all[idx].tag,
      message: `Equipment "${all[idx].tag}" was updated.`,
      category: "electrical",
      visibility: "internal",
      actor_profile_id: actorId,
    });
    return mockOk(toEquipmentView(all[idx]));
  }

  try {
    const { data, error } = await getDb()
      .from("equipment_lists")
      .update({ ...input, updated_by: actorId })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return fail(error);

    const eq = data as EquipmentList;
    await logAction({
      action: "equipment.updated",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: id,
      new_data: input as Record<string, unknown>,
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.EQUIPMENT_UPDATED,
      entity_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      entity_id: id,
      entity_label: eq.tag,
      message: `Equipment "${eq.tag}" was updated.`,
      category: "electrical",
      visibility: "internal",
      actor_profile_id: actorId,
    });
    return ok(toEquipmentView(eq));
  } catch (err) {
    return fail(err);
  }
}

export async function archiveEquipment(id: string): Promise<ServiceResult<EquipmentView>> {
  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockEquipment();
    const idx = all.findIndex((e) => e.id === id && !e.deleted_at);
    if (idx === -1) return fail("Equipment not found.");
    all[idx] = { ...all[idx], status: "archived", updated_by: actorId, updated_at: now };
    saveMockEquipment(all);
    await logAction({
      action: "equipment.archived",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: id,
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.EQUIPMENT_ARCHIVED,
      entity_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      entity_id: id,
      entity_label: all[idx].tag,
      message: `Equipment "${all[idx].tag}" was archived.`,
      category: "electrical",
      visibility: "internal",
      actor_profile_id: actorId,
    });
    return mockOk(toEquipmentView(all[idx]));
  }

  try {
    const { data, error } = await getDb()
      .from("equipment_lists")
      .update({ status: "archived", updated_by: actorId })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) return fail(error);

    const eq = data as EquipmentList;
    await logAction({
      action: "equipment.archived",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: id,
    });
    await createActivityEvent({
      event_type: EVENT_TYPES.EQUIPMENT_ARCHIVED,
      entity_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      entity_id: id,
      entity_label: eq.tag,
      message: `Equipment "${eq.tag}" was archived.`,
      category: "electrical",
      visibility: "internal",
      actor_profile_id: actorId,
    });
    return ok(toEquipmentView(eq));
  } catch (err) {
    return fail(err);
  }
}

export async function restoreEquipment(id: string): Promise<ServiceResult<EquipmentView>> {
  const actorId = await getActorProfileId();
  const now = new Date().toISOString();

  if (!shouldUseSupabase()) {
    const all = getMockEquipment();
    const idx = all.findIndex((e) => e.id === id && e.status === "archived");
    if (idx === -1) return fail("Archived equipment not found.");
    all[idx] = { ...all[idx], status: "active", updated_by: actorId, updated_at: now };
    saveMockEquipment(all);
    await logAction({
      action: "equipment.restored",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: id,
    });
    return mockOk(toEquipmentView(all[idx]));
  }

  try {
    const { data, error } = await getDb()
      .from("equipment_lists")
      .update({ status: "active", updated_by: actorId })
      .eq("id", id)
      .eq("status", "archived")
      .select()
      .single();

    if (error || !data) return fail("Archived equipment not found.");

    await logAction({
      action: "equipment.restored",
      resource_type: RESOURCE_TYPES.EQUIPMENT_LIST,
      resource_id: id,
    });
    return ok(toEquipmentView(data as EquipmentList));
  } catch (err) {
    return fail(err);
  }
}

// ─── Overview, timeline, revisions ──────────────────────────────────────────

export async function getElectricalOverviewStats(): Promise<
  ServiceResult<ElectricalOverviewStats>
> {
  if (!shouldUseSupabase()) {
    const panels = getMockPanels().filter((p) => !p.deleted_at && p.status !== "archived");
    const loadCalcs = getMockLoadCalcs().filter((lc) => !lc.deleted_at && lc.status !== "archived");
    const circuits = getMockCircuits();
    const equipment = getMockEquipment().filter((e) => !e.deleted_at && e.status !== "archived");

    let warningCount = 0;
    let totalLoad = 0;
    for (const panel of panels) {
      const panelCircuits = circuitsForPanel(panel.id, circuits).map(toCircuitView);
      warningCount += buildPanelWarnings(panelCircuits).length;
      totalLoad += computePanelTotalLoadVa(panelCircuits);
    }

    const stats: ElectricalOverviewStats = {
      panel_count: panels.length,
      approved_panel_count: panels.filter((p) => p.status === "approved").length,
      open_review_count:
        panels.filter((p) => p.status === "under_review").length +
        loadCalcs.filter((lc) => lc.status === "under_review").length,
      total_connected_load_va: totalLoad,
      equipment_count: equipment.length,
      warning_count: warningCount,
    };

    return mockOk(stats);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail("No active session.");

  try {
    const [{ data: panels }, { data: loadCalcs }, { data: equipment }] = await Promise.all([
      getDb()
        .from("panel_schedules")
        .select("id, status")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .neq("status", "archived"),
      getDb()
        .from("load_calculations")
        .select("status")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .neq("status", "archived"),
      getDb()
        .from("equipment_lists")
        .select("id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .neq("status", "archived"),
    ]);

    const panelRows = (panels ?? []) as Pick<PanelSchedule, "id" | "status">[];
    let warningCount = 0;
    let totalLoad = 0;

    for (const panel of panelRows) {
      const { data: circuitRows } = await getDb()
        .from("circuits")
        .select("*")
        .eq("panel_schedule_id", panel.id)
        .is("deleted_at", null);
      const panelCircuits = (circuitRows ?? []).map((c) => toCircuitView(c as Circuit));
      warningCount += buildPanelWarnings(panelCircuits).length;
      totalLoad += computePanelTotalLoadVa(panelCircuits);
    }

    const stats: ElectricalOverviewStats = {
      panel_count: panelRows.length,
      approved_panel_count: panelRows.filter((p) => p.status === "approved").length,
      open_review_count:
        panelRows.filter((p) => p.status === "under_review").length +
        (loadCalcs ?? []).filter((lc) => lc.status === "under_review").length,
      total_connected_load_va: totalLoad,
      equipment_count: (equipment ?? []).length,
      warning_count: warningCount,
    };

    return ok(stats);
  } catch (err) {
    return fail(err);
  }
}

export async function getElectricalTimeline(
  entityType: "panel_schedule" | "load_calculation",
  entityId: string,
): Promise<ServiceResult<ElectricalTimelineItem[]>> {
  const resourceType =
    entityType === "panel_schedule"
      ? RESOURCE_TYPES.PANEL_SCHEDULE
      : RESOURCE_TYPES.LOAD_CALCULATION;

  const [auditRes, activityRes, revisionsRes] = await Promise.all([
    listAuditLogsForResource(resourceType, entityId, 50),
    listActivityEvents({ entity_type: resourceType, entity_id: entityId, limit: 50 }),
    listElectricalRevisions(entityType, entityId),
  ]);

  const auditItems: ElectricalTimelineItem[] = (auditRes.data ?? []).map((l) => ({
    id: `audit-${l.id}`,
    source: "audit",
    created_at: l.created_at,
    actor_name: l.user_id ?? "System",
    title: l.action.replace(/\./g, " ").replace(/_/g, " "),
    message: l.resource_id ? `Resource: ${l.resource_id}` : null,
  }));

  const activityItems: ElectricalTimelineItem[] = (activityRes.data?.items ?? []).map((e) => ({
    id: `activity-${e.id}`,
    source: "activity",
    created_at: e.created_at,
    actor_name: e.actor_profile_id ?? "System",
    title: e.event_type.replace(/\./g, " ").replace(/_/g, " "),
    message: e.message,
  }));

  const revisionItems: ElectricalTimelineItem[] = (revisionsRes.data ?? []).map((r) => ({
    id: `revision-${r.id}`,
    source: "revision",
    created_at: r.created_at,
    actor_name: r.changed_by_name ?? "System",
    title: `Revision ${r.revision_number}`,
    message: r.change_summary,
  }));

  const merged = [...auditItems, ...activityItems, ...revisionItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const isMock = auditRes.isMockData || activityRes.isMockData || revisionsRes.isMockData;
  return isMock ? mockOk(merged) : ok(merged);
}

export async function listElectricalRevisions(
  entityType: "panel_schedule" | "load_calculation",
  entityId: string,
): Promise<ServiceResult<ElectricalRevisionView[]>> {
  if (!shouldUseSupabase()) {
    const items = getMockRevisions()
      .filter((r) => r.entity_type === entityType && r.entity_id === entityId)
      .sort((a, b) => b.revision_number - a.revision_number)
      .map((r) => ({ ...r, changed_by_name: profileName(r.changed_by) }));
    return mockOk(items);
  }

  try {
    const { data, error } = await getDb()
      .from("electrical_revisions")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("revision_number", { ascending: false });

    if (error) return fail(error);

    const rows = (data ?? []) as ElectricalRevision[];
    const profileIds = rows.map((r) => r.changed_by).filter(Boolean) as string[];
    let nameMap = new Map<string, string>();
    if (profileIds.length) {
      const { data: profiles } = await getDb()
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      nameMap = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
    }

    return ok(
      rows.map((r) => ({
        ...r,
        changed_by_name: r.changed_by ? (nameMap.get(r.changed_by) ?? "Former User") : null,
      })),
    );
  } catch (err) {
    return fail(err);
  }
}

/** Exposed for testing / widget registry */
export function resetMockElectrical(): void {
  try {
    sessionStorage.removeItem(MOCK_PANELS_KEY);
    sessionStorage.removeItem(MOCK_CIRCUITS_KEY);
    sessionStorage.removeItem(MOCK_LOAD_CALCS_KEY);
    sessionStorage.removeItem(MOCK_EQUIPMENT_KEY);
    sessionStorage.removeItem(MOCK_REVISIONS_KEY);
    // eslint-disable-next-line no-empty
  } catch {}
}
