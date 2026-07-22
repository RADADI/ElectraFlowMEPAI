-- ============================================================================
-- ElectraFlow AI — Phase 5B: First-user bootstrap RPC
-- ============================================================================
-- Run AFTER migration-phase5.sql (Clerk JWT + clerk_user_id on profiles).
-- Run in Supabase SQL Editor on production if not included in full bootstrap.
--
-- Creates org + profile + organization_members for the FIRST tenant only,
-- using SECURITY DEFINER so RLS does not block empty-database bootstrap.
-- Caller must present a Clerk JWT whose `sub` matches p_clerk_user_id.
-- ============================================================================

create or replace function bootstrap_first_user(
  p_clerk_user_id text,
  p_email text,
  p_full_name text,
  p_company_name text,
  p_role user_role default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_sub text;
  v_org_id uuid;
  v_profile_id uuid;
  v_slug text;
  v_suffix text;
  v_existing_role user_role;
begin
  v_jwt_sub := auth.jwt() ->> 'sub';
  if v_jwt_sub is null or v_jwt_sub is distinct from p_clerk_user_id then
    raise exception 'Unauthorized: Clerk identity mismatch';
  end if;

  if p_company_name is null or length(trim(p_company_name)) = 0 then
    raise exception 'Company name is required for first-user bootstrap';
  end if;

  -- Return existing profile if already provisioned for this Clerk user.
  select id, organization_id, role
    into v_profile_id, v_org_id, v_existing_role
  from profiles
  where clerk_user_id = p_clerk_user_id
    and deleted_at is null
  limit 1;

  if v_profile_id is not null then
    return jsonb_build_object(
      'profile_id', v_profile_id,
      'organization_id', v_org_id,
      'role', v_existing_role,
      'email', lower(trim(p_email)),
      'full_name', p_full_name,
      'created', false,
      'organization_created', false
    );
  end if;

  -- First tenant only: block when any live organization already exists.
  if exists (select 1 from organizations where deleted_at is null limit 1) then
    raise exception
      'First-user bootstrap unavailable: an organization already exists. Ask your admin for an invite.';
  end if;

  v_slug := lower(regexp_replace(trim(p_company_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if length(v_slug) = 0 then
    v_slug := 'workspace';
  end if;

  while exists (select 1 from organizations where slug = v_slug and deleted_at is null) loop
    v_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    v_slug := v_slug || '-' || v_suffix;
  end loop;

  insert into organizations (name, slug, plan)
  values (trim(p_company_name), v_slug, 'free')
  returning id into v_org_id;

  v_profile_id := gen_random_uuid();

  insert into profiles (
    id,
    clerk_user_id,
    organization_id,
    full_name,
    email,
    role,
    onboarding_done,
    is_active
  )
  values (
    v_profile_id,
    p_clerk_user_id,
    v_org_id,
    trim(p_full_name),
    lower(trim(p_email)),
    p_role,
    false,
    true
  );

  insert into organization_members (organization_id, profile_id, role)
  values (v_org_id, v_profile_id, p_role);

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'organization_id', v_org_id,
    'role', p_role,
    'email', lower(trim(p_email)),
    'full_name', trim(p_full_name),
    'created', true,
    'organization_created', true
  );
end;
$$;

revoke all on function bootstrap_first_user(text, text, text, text, user_role) from public;
grant execute on function bootstrap_first_user(text, text, text, text, user_role) to authenticated;
