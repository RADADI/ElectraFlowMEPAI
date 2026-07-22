/**
 * First-tenant bootstrap via SECURITY DEFINER RPC.
 * Requires supabase/manual/bootstrap_first_user_rpc.sql applied in Supabase.
 */
import { supabase, IS_SUPABASE_CONFIGURED } from "@/lib/supabase";
import type { UserRole } from "@/types/database";

export interface BootstrapFirstUserResult {
  profileId: string;
  organizationId: string;
  role: UserRole;
  email: string;
  fullName: string;
  created: boolean;
  organizationCreated: boolean;
}

export async function bootstrapFirstUser(params: {
  clerkUserId: string;
  email: string;
  fullName: string;
  companyName: string;
  role: UserRole;
}): Promise<{ data: BootstrapFirstUserResult | null; error: string | null }> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return { data: null, error: "Supabase is not configured." };
  }

  const { data, error } = await supabase.rpc("bootstrap_first_user", {
    p_clerk_user_id: params.clerkUserId,
    p_email: params.email,
    p_full_name: params.fullName,
    p_company_name: params.companyName,
    p_role: params.role,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  if (!row?.profile_id) {
    return { data: null, error: "Bootstrap RPC returned no profile." };
  }

  return {
    data: {
      profileId: String(row.profile_id),
      organizationId: String(row.organization_id),
      role: row.role as UserRole,
      email: String(row.email),
      fullName: String(row.full_name),
      created: row.created === true,
      organizationCreated: row.organization_created === true,
    },
    error: null,
  };
}
