/**
 * Invite service — Phase 6
 *
 * Manages organisation invitations with SHA-256 token security.
 *
 * Token security model:
 *   • The service generates a raw random token (32 bytes → 64 hex chars).
 *   • Only the SHA-256 hash is stored in invitations.token_hash.
 *   • The URL carries the raw token: /invite/{rawToken}
 *   • Validation: hash(incomingToken) === stored token_hash
 *   • A compromised DB dump cannot be used to accept invitations.
 *
 * Mock fallback:
 *   • When Supabase is not configured or JWT is not ready, all operations
 *     work against sessionStorage so the demo flow remains functional.
 */

import { supabase, IS_SUPABASE_CONFIGURED, isJwtReady } from "@/lib/supabase";
import { getSessionContext } from "@/lib/auth-bridge";
import { sha256Hex } from "@/lib/auth-bridge";
import { logAction } from "@/services/audit.service";
import { ok, mockOk, fail, type ServiceResult } from "./_base.service";
import type { Invitation, InvitationStatus, UserRole } from "@/types/database";

// ─── View type ────────────────────────────────────────────────────────────────

export interface InvitationView {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  inviter_name: string | null;
  /** Raw token — only present when returned from createInvite(). Never stored. */
  rawToken?: string;
}

// ─── Routing guard ────────────────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  if (!IS_SUPABASE_CONFIGURED || !supabase) return false;
  if (!isJwtReady()) return false;
  return true;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_KEY = "mep-invites-mock";

function getMockInvites(): InvitationView[] {
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    return raw ? (JSON.parse(raw) as InvitationView[]) : [];
  } catch {
    return [];
  }
}

function saveMockInvites(invites: InvitationView[]): void {
  try {
    sessionStorage.setItem(MOCK_KEY, JSON.stringify(invites));
  } catch {
    // ignore
  }
}

// ─── Token generation ─────────────────────────────────────────────────────────

/** Generates a cryptographically random 32-byte token as a hex string. */
function generateRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Create invite ────────────────────────────────────────────────────────────

export async function createInvite(
  email: string,
  role: UserRole,
): Promise<ServiceResult<InvitationView>> {
  if (!shouldUseSupabase()) {
    const { userId } = getSessionContext();
    const rawToken = generateRawToken();
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite: InvitationView = {
      id: crypto.randomUUID(),
      organization_id: "mock-org",
      email: email.toLowerCase().trim(),
      role,
      status: "pending",
      invited_by: userId ?? "mock-user",
      expires_at: expires.toISOString(),
      accepted_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      inviter_name: "You (Demo)",
      rawToken,
    };

    const all = getMockInvites();
    // Block duplicate pending invites
    const existing = all.find((i) => i.email === invite.email && i.status === "pending");
    if (existing) {
      return fail<InvitationView>("A pending invitation already exists for this email address.");
    }

    saveMockInvites([invite, ...all]);
    return mockOk(invite);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId || !userId) return fail<InvitationView>("No active session.");

  const normalizedEmail = email.toLowerCase().trim();

  // Block duplicate pending invites
  const { data: dup } = await supabase!
    .from("invitations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (dup) {
    return fail<InvitationView>("A pending invitation already exists for this email address.");
  }

  const rawToken = generateRawToken();
  const tokenHash = await sha256Hex(rawToken);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const { data, error } = await supabase!
      .from("invitations")
      .insert({
        organization_id: organizationId,
        email: normalizedEmail,
        role,
        status: "pending",
        token_hash: tokenHash,
        invited_by: userId,
        expires_at: expires.toISOString(),
      })
      .select(`*, inviter:profiles!invited_by(full_name)`)
      .single();

    if (error) return fail<InvitationView>(error);

    await logAction({
      action: "invite.created",
      resource_type: "invitation",
      resource_id: (data as Invitation).id,
      new_data: { email: normalizedEmail, role },
    });

    const row = data as Record<string, unknown>;
    const view: InvitationView = {
      ...(row as Omit<InvitationView, "inviter_name" | "rawToken">),
      inviter_name: (row.inviter as { full_name: string } | null)?.full_name ?? null,
      rawToken,
    };

    return ok(view);
  } catch (err) {
    return fail<InvitationView>(err);
  }
}

// ─── List invites ─────────────────────────────────────────────────────────────

export async function listInvites(
  status?: InvitationStatus,
): Promise<ServiceResult<InvitationView[]>> {
  if (!shouldUseSupabase()) {
    let invites = getMockInvites();
    if (status) invites = invites.filter((i) => i.status === status);
    return mockOk(invites);
  }

  const orgId = getSessionContext().organizationId;
  if (!orgId) return fail<InvitationView[]>("No active organisation.");

  try {
    let query = supabase!
      .from("invitations")
      .select(`*, inviter:profiles!invited_by(full_name)`)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return fail<InvitationView[]>(error);

    const views: InvitationView[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Omit<InvitationView, "inviter_name" | "rawToken">),
      inviter_name: (row.inviter as { full_name: string } | null)?.full_name ?? null,
    }));

    return ok(views);
  } catch (err) {
    return fail<InvitationView[]>(err);
  }
}

// ─── Cancel invite ────────────────────────────────────────────────────────────

export async function cancelInvite(id: string): Promise<ServiceResult<InvitationView>> {
  if (!shouldUseSupabase()) {
    const all = getMockInvites();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) return fail<InvitationView>("Invitation not found.");
    all[idx] = { ...all[idx], status: "cancelled", updated_at: new Date().toISOString() };
    saveMockInvites(all);
    return mockOk(all[idx]);
  }

  const { organizationId, userId } = getSessionContext();
  if (!organizationId || !userId) return fail<InvitationView>("No active session.");

  try {
    const { data, error } = await supabase!
      .from("invitations")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .select(`*, inviter:profiles!invited_by(full_name)`)
      .single();

    if (error) return fail<InvitationView>(error);

    await logAction({
      action: "invite.cancelled",
      resource_type: "invitation",
      resource_id: id,
    });

    const row = data as Record<string, unknown>;
    return ok({
      ...(row as Omit<InvitationView, "inviter_name" | "rawToken">),
      inviter_name: (row.inviter as { full_name: string } | null)?.full_name ?? null,
    });
  } catch (err) {
    return fail<InvitationView>(err);
  }
}

// ─── Resend invite (new token, extended expiry) ───────────────────────────────

export async function resendInvite(id: string): Promise<ServiceResult<InvitationView>> {
  if (!shouldUseSupabase()) {
    const all = getMockInvites();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) return fail<InvitationView>("Invitation not found.");
    const rawToken = generateRawToken();
    all[idx] = {
      ...all[idx],
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      updated_at: new Date().toISOString(),
      rawToken,
    };
    saveMockInvites(all);
    return mockOk(all[idx]);
  }

  const { organizationId } = getSessionContext();
  if (!organizationId) return fail<InvitationView>("No active session.");

  const rawToken = generateRawToken();
  const tokenHash = await sha256Hex(rawToken);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const { data, error } = await supabase!
      .from("invitations")
      .update({
        token_hash: tokenHash,
        expires_at: expires.toISOString(),
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(`*, inviter:profiles!invited_by(full_name)`)
      .single();

    if (error) return fail<InvitationView>(error);

    const row = data as Record<string, unknown>;
    return ok({
      ...(row as Omit<InvitationView, "inviter_name" | "rawToken">),
      inviter_name: (row.inviter as { full_name: string } | null)?.full_name ?? null,
      rawToken,
    });
  } catch (err) {
    return fail<InvitationView>(err);
  }
}

// ─── Get invite by raw token (for invite acceptance page) ────────────────────

export interface InviteWithOrg extends InvitationView {
  organization_name: string | null;
}

export async function getInviteByToken(rawToken: string): Promise<ServiceResult<InviteWithOrg>> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    // In demo mode, simulate looking up a mock invite
    const all = getMockInvites();
    const found = all.find((i) => i.status === "pending" && i.rawToken === rawToken);
    if (!found) return fail<InviteWithOrg>("Invitation not found or has expired.");
    return mockOk({ ...found, organization_name: "Demo Organisation" });
  }

  try {
    const tokenHash = await sha256Hex(rawToken);

    const { data, error } = await supabase
      .from("invitations")
      .select(`*, org:organizations!organization_id(name), inviter:profiles!invited_by(full_name)`)
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) return fail<InviteWithOrg>(error);
    if (!data) return fail<InviteWithOrg>("Invitation not found or has expired.");

    const row = data as Record<string, unknown>;
    const invite = row as unknown as Invitation;

    if (invite.status === "accepted") {
      return fail<InviteWithOrg>("This invitation has already been accepted.");
    }
    if (invite.status === "cancelled") {
      return fail<InviteWithOrg>("This invitation has been cancelled.");
    }
    if (invite.status === "expired" || new Date(invite.expires_at) < new Date()) {
      return fail<InviteWithOrg>("This invitation has expired. Ask your Admin for a new one.");
    }

    return ok({
      ...(invite as Omit<InviteWithOrg, "inviter_name" | "organization_name" | "rawToken">),
      inviter_name: (row.inviter as { full_name: string } | null)?.full_name ?? null,
      organization_name: (row.org as { name: string } | null)?.name ?? null,
    });
  } catch (err) {
    return fail<InviteWithOrg>(err);
  }
}
