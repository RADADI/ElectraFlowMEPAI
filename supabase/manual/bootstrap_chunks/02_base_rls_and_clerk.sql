-- ElectraFlow AI — Bootstrap chunk (run in numeric order on EMPTY database only)
-- See supabase/manual/RESET_AND_RUN_INSTRUCTIONS.md


-- =====================================================
-- 002 base_rls
-- Source: rls-policies.sql
-- =====================================================

-- ============================================================================
-- ElectraFlow AI — Row-Level Security Policies (Phase 3)
-- Run AFTER schema.sql, BEFORE seed.sql.
-- ============================================================================
-- Strategy:
--   1. Every table has RLS enabled.
--   2. All authenticated users can only see rows belonging to THEIR organisation.
--   3. Role-specific write restrictions are layered on top.
--   4. Phase 4 will tighten policies once Clerk JWTs are wired in.
--
-- The helper function get_my_org_id() reads from the profiles table using
-- auth.uid(), which resolves to the Clerk sub claim in Phase 4.
-- ============================================================================

-- ─── Helper function ─────────────────────────────────────────────────────────

create or replace function get_my_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from profiles where id = auth.uid() limit 1;
$$;

-- ─── Helper: current user role ───────────────────────────────────────────────

create or replace function get_my_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid() limit 1;
$$;

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

alter table organizations         enable row level security;
alter table profiles              enable row level security;
alter table organization_members  enable row level security;
alter table invitations           enable row level security;
alter table audit_logs            enable row level security;
alter table clients               enable row level security;
alter table projects              enable row level security;
alter table project_members       enable row level security;
alter table project_milestones    enable row level security;
alter table documents             enable row level security;
alter table document_versions     enable row level security;
alter table document_approvals    enable row level security;
alter table submittals            enable row level security;
alter table submittal_items       enable row level security;
alter table submittal_reviews     enable row level security;
alter table rfi                   enable row level security;
alter table rfi_responses         enable row level security;
alter table ncr                   enable row level security;
alter table ncr_actions           enable row level security;
alter table employees             enable row level security;
alter table employee_skills       enable row level security;
alter table resource_allocations  enable row level security;

-- ─── Organizations ───────────────────────────────────────────────────────────

create policy "org: member can view own org"
  on organizations for select
  using (id = get_my_org_id());

create policy "org: admin can update own org"
  on organizations for update
  using (id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Profiles ────────────────────────────────────────────────────────────────

create policy "profiles: member can view org profiles"
  on profiles for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "profiles: user can update own profile"
  on profiles for update
  using (id = auth.uid());

create policy "profiles: admin can insert profiles"
  on profiles for insert
  with check (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Organization members ─────────────────────────────────────────────────────

create policy "org_members: member can view org members"
  on organization_members for select
  using (organization_id = get_my_org_id());

create policy "org_members: admin can manage members"
  on organization_members for all
  using (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Invitations ─────────────────────────────────────────────────────────────

create policy "invitations: admin/pm can view org invitations"
  on invitations for select
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

create policy "invitations: admin can manage invitations"
  on invitations for all
  using (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Audit logs ──────────────────────────────────────────────────────────────

create policy "audit: admin/executive can read logs"
  on audit_logs for select
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'executive'));

create policy "audit: service role can insert"
  on audit_logs for insert
  with check (organization_id = get_my_org_id());

-- ─── Clients ─────────────────────────────────────────────────────────────────

create policy "clients: member can view org clients"
  on clients for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "clients: admin/pm can manage clients"
  on clients for all
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

-- ─── Projects ────────────────────────────────────────────────────────────────

create policy "projects: member can view accessible projects"
  on projects for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and (
      -- Admin and Executive see all
      get_my_role() in ('admin', 'executive')
      -- PM sees projects they manage
      or (get_my_role() = 'project_manager' and pm_id = auth.uid())
      -- Engineers/QA see projects they are members of
      or exists (
        select 1 from project_members pm
        where pm.project_id = projects.id
          and pm.profile_id = auth.uid()
          and pm.deleted_at is null
      )
    )
  );

create policy "projects: admin/pm can insert"
  on projects for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager')
  );

create policy "projects: admin/pm can update"
  on projects for update
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager')
    and deleted_at is null
  );

create policy "projects: admin can soft-delete"
  on projects for update
  using (organization_id = get_my_org_id() and get_my_role() = 'admin');

-- ─── Project members ─────────────────────────────────────────────────────────

create policy "project_members: member can view"
  on project_members for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "project_members: admin/pm can manage"
  on project_members for all
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

-- ─── Project milestones ───────────────────────────────────────────────────────

create policy "milestones: project member can view"
  on project_milestones for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "milestones: admin/pm can manage"
  on project_milestones for all
  using (organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager'));

-- ─── Documents ───────────────────────────────────────────────────────────────

create policy "docs: member can view org documents"
  on documents for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "docs: engineers/pm/admin can insert"
  on documents for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer'
    )
  );

create policy "docs: author/admin/pm can update"
  on documents for update
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and (created_by = auth.uid() or get_my_role() in ('admin', 'project_manager'))
  );

-- ─── Document versions ───────────────────────────────────────────────────────

create policy "doc_versions: member can view"
  on document_versions for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "doc_versions: author can insert"
  on document_versions for insert
  with check (organization_id = get_my_org_id());

-- ─── Document approvals ───────────────────────────────────────────────────────

create policy "doc_approvals: member can view"
  on document_approvals for select
  using (organization_id = get_my_org_id());

create policy "doc_approvals: approvers can insert"
  on document_approvals for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'senior_electrical_engineer', 'qa_qc_engineer')
  );

-- ─── Submittals ───────────────────────────────────────────────────────────────

create policy "submittals: member can view org submittals"
  on submittals for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "submittals: engineers/pm/admin can manage"
  on submittals for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── Submittal items ─────────────────────────────────────────────────────────

create policy "submittal_items: member can view"
  on submittal_items for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "submittal_items: engineers can manage"
  on submittal_items for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── Submittal reviews ───────────────────────────────────────────────────────

create policy "submittal_reviews: member can view"
  on submittal_reviews for select
  using (organization_id = get_my_org_id());

create policy "submittal_reviews: reviewers can insert"
  on submittal_reviews for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'senior_electrical_engineer', 'qa_qc_engineer')
  );

-- ─── RFI ─────────────────────────────────────────────────────────────────────

create policy "rfi: member can view org rfis"
  on rfi for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "rfi: engineers/pm/admin can manage"
  on rfi for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── RFI responses ───────────────────────────────────────────────────────────

create policy "rfi_responses: member can view"
  on rfi_responses for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "rfi_responses: respondents can insert"
  on rfi_responses for insert
  with check (organization_id = get_my_org_id());

-- ─── NCR ─────────────────────────────────────────────────────────────────────

create policy "ncr: member can view org ncrs"
  on ncr for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "ncr: qa/pm/admin can manage"
  on ncr for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'qa_qc_engineer', 'senior_electrical_engineer')
  );

-- ─── NCR actions ─────────────────────────────────────────────────────────────

create policy "ncr_actions: member can view"
  on ncr_actions for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "ncr_actions: qa/pm/admin can manage"
  on ncr_actions for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'qa_qc_engineer')
  );

-- ─── Employees ───────────────────────────────────────────────────────────────

create policy "employees: hr/admin/executive can view"
  on employees for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and get_my_role() in ('admin', 'hr', 'executive')
  );

create policy "employees: hr/admin can manage"
  on employees for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'hr')
  );

-- ─── Employee skills ─────────────────────────────────────────────────────────

create policy "employee_skills: hr/admin can view"
  on employee_skills for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and get_my_role() in ('admin', 'hr', 'executive')
  );

create policy "employee_skills: hr/admin can manage"
  on employee_skills for all
  using (organization_id = get_my_org_id() and get_my_role() in ('admin', 'hr'));

-- ─── Resource allocations ────────────────────────────────────────────────────

create policy "resource_allocations: pm/hr/admin can view"
  on resource_allocations for select
  using (
    organization_id = get_my_org_id()
    and deleted_at is null
    and get_my_role() in ('admin', 'hr', 'project_manager', 'executive')
  );

create policy "resource_allocations: pm/hr/admin can manage"
  on resource_allocations for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'hr', 'project_manager')
  );

-- ✅ END 002 base_rls

-- =====================================================
-- 003 phase5_clerk_jwt
-- Source: migration-phase5.sql
-- =====================================================

-- ============================================================================
-- ElectraFlow AI — Phase 5 Migration: Clerk JWT ↔ Supabase RLS Bridge
-- ============================================================================
-- Run this AFTER schema.sql and rls-policies.sql (Phase 3).
-- Run in Supabase SQL Editor or with psql.
--
-- What this migration does:
--   1. Adds clerk_user_id to profiles (links Clerk identity to DB profile).
--   2. Creates an index for fast JTW-sub lookups.
--   3. Replaces get_my_org_id() and get_my_role() to use auth.jwt() ->> 'sub'
--      instead of auth.uid() — because Clerk user IDs are text (user_2abc…),
--      not UUIDs, so the UUID cast in auth.uid() would return null.
--   4. Adds a helper get_my_clerk_id() for policies that need the raw sub.
--   5. Replaces the profile update policy that used id = auth.uid().
--   6. Adds a self-registration INSERT policy so Clerk users can bootstrap
--      their own profile row on first login (no service-role key needed).
-- ============================================================================

-- ─── 1. Add clerk_user_id column ─────────────────────────────────────────────

alter table profiles
  add column if not exists clerk_user_id text unique;

-- ─── 2. Index for JWT sub lookup ─────────────────────────────────────────────

create index if not exists idx_profiles_clerk_user_id
  on profiles (clerk_user_id)
  where deleted_at is null;

-- ─── 3. Updated RLS helper functions ─────────────────────────────────────────
-- These now use auth.jwt() ->> 'sub' (text match on clerk_user_id) instead of
-- auth.uid() (UUID cast on id).  The query is still fast via the index above.

create or replace function get_my_org_id()
returns uuid language sql stable security definer as $$
  select organization_id
  from profiles
  where clerk_user_id = auth.jwt() ->> 'sub'
    and deleted_at is null
  limit 1;
$$;

create or replace function get_my_role()
returns user_role language sql stable security definer as $$
  select role
  from profiles
  where clerk_user_id = auth.jwt() ->> 'sub'
    and deleted_at is null
  limit 1;
$$;

-- New helper: returns the raw Clerk user ID from the JWT sub claim.
create or replace function get_my_clerk_id()
returns text language sql stable as $$
  select auth.jwt() ->> 'sub';
$$;

-- ─── 4. Fix profiles update policy ───────────────────────────────────────────
-- The Phase 3 policy used "id = auth.uid()" which fails when auth.uid() is
-- null (Clerk sub cast fails on UUID type).  Replace it.

drop policy if exists "profiles: user can update own profile" on profiles;

create policy "profiles: user can update own profile"
  on profiles for update
  using (clerk_user_id = auth.jwt() ->> 'sub');

-- ─── 5. Profile self-registration policy ────────────────────────────────────
-- Allows a Clerk user to create their own profile row on first login.
-- The constraint "clerk_user_id = auth.jwt() ->> 'sub'" ensures they can
-- only create a profile for themselves, never for another user.
--
-- ⚠️  organization_id must still be provided in the INSERT payload.
--     If the user has no org (not invited yet), the INSERT will fail.
--     The app shows "Account not configured" in this case.

drop policy if exists "profiles: user can create own profile" on profiles;

create policy "profiles: user can create own profile"
  on profiles for insert
  with check (clerk_user_id = auth.jwt() ->> 'sub');

-- ─── 6. Allow authenticated users to read their own profile ─────────────────
-- The Phase 3 SELECT policy requires get_my_org_id() to be non-null, which
-- creates a bootstrapping problem: we need to read the profile to GET the org,
-- but the policy blocks the read if we don't have the org yet.
-- This additional policy breaks the chicken-and-egg: users can always read
-- their own profile row by clerk_user_id, even before org is resolved.

drop policy if exists "profiles: user can read own profile" on profiles;

create policy "profiles: user can read own profile"
  on profiles for select
  using (clerk_user_id = auth.jwt() ->> 'sub');

-- ─── Verification queries (run manually to confirm migration) ────────────────
-- select clerk_user_id, organization_id, role, full_name from profiles limit 5;
-- select get_my_clerk_id();   -- should return your Clerk user ID after signing in
-- select get_my_org_id();     -- should return your organization UUID
-- select get_my_role();       -- should return your role enum value

-- ✅ END 003 phase5_clerk_jwt

-- ✅ PRODUCTION BOOTSTRAP COMPLETE
