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
