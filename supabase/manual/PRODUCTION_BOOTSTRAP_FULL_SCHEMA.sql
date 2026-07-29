-- ===========================================================================
-- ElectraFlow AI — PRODUCTION BOOTSTRAP (full schema)
-- ===========================================================================
-- ⚠️  RUN ONLY ON A BRAND-NEW EMPTY SUPABASE PROJECT.
-- ⚠️  DO NOT run on a partially migrated database.
-- ⚠️  DO NOT run seed.sql on production.
-- ⚠️  Stop immediately on any error.
--
-- After success:
--   1. supabase/manual/VERIFY_PRODUCTION_SCHEMA.sql
--   2. supabase/manual/storage_buckets_and_policies.sql (create buckets first)
--   3. supabase/manual/realtime_publication.sql
--   4. Clerk JWT setup (docs/phase-5-clerk-supabase-setup.md)
--
-- Execution model:
--   • NO BEGIN/COMMIT wrappers (Supabase SQL Editor may use one outer transaction).
--   • rfi_status + submittal_status include all final values in schema.sql.
--   • Phase 7/8 ALTER TYPE ADD VALUE are idempotent no-ops on fresh DB.
--   • No COMMIT statements (safe inside Supabase SQL Editor single-transaction runs).
-- ===========================================================================


-- =====================================================
-- 001 core_schema
-- Source: schema.sql
-- =====================================================

-- ============================================================================
-- ElectraFlow AI — Database Schema (Phase 3)
-- Scope: Core SaaS + Projects + Documents + Submittals + RFI + NCR + Resources
-- ============================================================================
-- Paste this file into the Supabase SQL editor (or run with psql).
-- Run schema.sql BEFORE rls-policies.sql and seed.sql.
-- ============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type user_role as enum (
  'admin',
  'project_manager',
  'senior_electrical_engineer',
  'electrical_engineer',
  'qa_qc_engineer',
  'hr',
  'executive',
  'client'
);

create type project_status as enum (
  'planning', 'active', 'on_hold', 'completed', 'cancelled'
);

create type project_priority as enum ('low', 'medium', 'high', 'critical');

create type risk_level as enum ('low', 'medium', 'high', 'critical');

create type document_status as enum (
  'draft', 'under_review', 'approved', 'rejected', 'superseded', 'archived'
);

create type submittal_status as enum (
  'draft', 'submitted', 'under_review',
  'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected',
  'archived'
);

create type review_action as enum (
  'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected', 'for_record_only'
);

create type rfi_status as enum (
  'open', 'under_review', 'answered', 'closed', 'cancelled',
  'draft', 'submitted', 'reopened', 'voided', 'archived'
);

create type ncr_status as enum (
  'open', 'under_review', 'action_required', 'resolved', 'closed', 'voided'
);

create type milestone_status as enum (
  'pending', 'in_progress', 'completed', 'delayed'
);

create type invitation_status as enum (
  'pending', 'accepted', 'expired', 'cancelled'
);

-- ─── Core SaaS ───────────────────────────────────────────────────────────────

create table organizations (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,
  plan          text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  logo_url      text,
  website       text,
  industry      text,
  country       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table profiles (
  id               uuid primary key,          -- matches auth.uid() / Clerk user ID
  organization_id  uuid not null references organizations(id) on delete cascade,
  full_name        text not null,
  email            text not null,
  role             user_role not null default 'electrical_engineer',
  title            text,
  department       text,
  phone            text,
  avatar_url       text,
  is_active        boolean not null default true,
  onboarding_done  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table organization_members (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  profile_id       uuid not null references profiles(id) on delete cascade,
  role             user_role not null,
  joined_at        timestamptz not null default now(),
  invited_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table invitations (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  email            text not null,
  role             user_role not null,
  status           invitation_status not null default 'pending',
  token            text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by       uuid not null references profiles(id),
  expires_at       timestamptz not null default (now() + interval '7 days'),
  accepted_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table audit_logs (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references profiles(id),
  action           text not null,
  resource_type    text not null,
  resource_id      uuid,
  old_data         jsonb,
  new_data         jsonb,
  ip_address       inet,
  created_at       timestamptz not null default now()
);

-- ─── Clients ─────────────────────────────────────────────────────────────────

create table clients (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  address          text,
  country          text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id),
  deleted_at       timestamptz
);

-- ─── Projects ────────────────────────────────────────────────────────────────

create table projects (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  project_number    text not null,
  name              text not null,
  description       text,
  client_id         uuid references clients(id),
  status            project_status not null default 'planning',
  priority          project_priority not null default 'medium',
  risk_level        risk_level not null default 'low',
  location          text,
  discipline        text,
  start_date        date,
  end_date          date,
  budget            numeric(15, 2),
  progress_percent  integer not null default 0 check (progress_percent between 0 and 100),
  pm_id             uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references profiles(id),
  updated_by        uuid references profiles(id),
  deleted_at        timestamptz,
  unique (organization_id, project_number)
);

create table project_members (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  profile_id       uuid not null references profiles(id) on delete cascade,
  role             user_role not null,
  assigned_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (project_id, profile_id)
);

create table project_milestones (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  name             text not null,
  description      text,
  due_date         date,
  completed_date   date,
  status           milestone_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id),
  deleted_at       timestamptz
);

-- ─── Documents ───────────────────────────────────────────────────────────────

create table documents (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  project_id       uuid references projects(id),
  title            text not null,
  document_number  text,
  discipline       text,
  document_type    text,
  revision         text not null default 'A',
  status           document_status not null default 'draft',
  file_url         text,
  file_size_bytes  bigint,
  mime_type        text,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id),
  deleted_at       timestamptz
);

create table document_versions (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  document_id      uuid not null references documents(id) on delete cascade,
  version_number   integer not null,
  revision         text not null,
  file_url         text,
  change_summary   text,
  created_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  deleted_at       timestamptz
);

create table document_approvals (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  document_id      uuid not null references documents(id) on delete cascade,
  approver_id      uuid not null references profiles(id),
  action           text not null check (action in ('approved', 'rejected', 'requested_changes')),
  comments         text,
  approved_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ─── Submittals ───────────────────────────────────────────────────────────────

create table submittals (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  submittal_number text not null,
  title            text not null,
  discipline       text,
  spec_section     text,
  status           submittal_status not null default 'draft',
  submitted_date   date,
  required_date    date,
  returned_date    date,
  submitted_by     uuid references profiles(id),
  reviewer_id      uuid references profiles(id),
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id),
  deleted_at       timestamptz,
  unique (project_id, submittal_number)
);

create table submittal_items (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  submittal_id     uuid not null references submittals(id) on delete cascade,
  description      text not null,
  quantity         numeric,
  unit             text,
  manufacturer     text,
  model_number     text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table submittal_reviews (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  submittal_id     uuid not null references submittals(id) on delete cascade,
  reviewer_id      uuid not null references profiles(id),
  action           review_action not null,
  comments         text,
  reviewed_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ─── RFI ─────────────────────────────────────────────────────────────────────

create table rfi (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  rfi_number       text not null,
  title            text not null,
  description      text not null,
  discipline       text,
  status           rfi_status not null default 'open',
  priority         project_priority not null default 'medium',
  submitted_by     uuid references profiles(id),
  assigned_to      uuid references profiles(id),
  submitted_date   date,
  required_date    date,
  answered_date    date,
  cost_impact      boolean not null default false,
  schedule_impact  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id),
  deleted_at       timestamptz,
  unique (project_id, rfi_number)
);

create table rfi_responses (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  rfi_id           uuid not null references rfi(id) on delete cascade,
  respondent_id    uuid not null references profiles(id),
  response_text    text not null,
  attachments      text[],
  responded_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- ─── NCR ─────────────────────────────────────────────────────────────────────

create table ncr (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  project_id        uuid not null references projects(id) on delete cascade,
  ncr_number        text not null,
  title             text not null,
  description       text not null,
  discipline        text,
  status            ncr_status not null default 'open',
  severity          risk_level not null default 'medium',
  raised_by         uuid references profiles(id),
  assigned_to       uuid references profiles(id),
  raised_date       date,
  due_date          date,
  closed_date       date,
  root_cause        text,
  corrective_action text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references profiles(id),
  updated_by        uuid references profiles(id),
  deleted_at        timestamptz,
  unique (project_id, ncr_number)
);

create table ncr_actions (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  ncr_id           uuid not null references ncr(id) on delete cascade,
  action_type      text not null check (action_type in ('corrective', 'preventive', 'observation')),
  description      text not null,
  assigned_to      uuid references profiles(id),
  due_date         date,
  completed_date   date,
  is_completed     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  deleted_at       timestamptz
);

-- ─── Employees / Resources ────────────────────────────────────────────────────

create table employees (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  profile_id       uuid references profiles(id),
  employee_number  text,
  full_name        text not null,
  email            text not null,
  role             user_role not null,
  department       text,
  title            text,
  phone            text,
  hire_date        date,
  employment_type  text not null default 'full_time'
                     check (employment_type in ('full_time','part_time','contractor','consultant')),
  is_active        boolean not null default true,
  hourly_rate      numeric(10, 2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  updated_by       uuid references profiles(id),
  deleted_at       timestamptz
);

create table employee_skills (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete cascade,
  skill_name       text not null,
  proficiency_level text not null check (proficiency_level in ('beginner','intermediate','advanced','expert')),
  years_experience integer,
  certified        boolean not null default false,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table resource_allocations (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete cascade,
  project_id          uuid not null references projects(id) on delete cascade,
  role_on_project     text,
  allocation_percent  integer not null default 100 check (allocation_percent between 1 and 100),
  start_date          date not null,
  end_date            date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id),
  updated_by          uuid references profiles(id),
  deleted_at          timestamptz
);

-- ─── Triggers: updated_at ────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','profiles','invitations','clients','projects',
    'project_members','project_milestones','documents','submittals',
    'submittal_items','rfi','ncr','ncr_actions','employees','resource_allocations'
  ]
  loop
    execute format(
      'create trigger trg_%s_updated_at before update on %s
       for each row execute function set_updated_at();', t, t
    );
  end loop;
end;
$$;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index on projects (organization_id, status) where deleted_at is null;
create index on projects (organization_id, pm_id) where deleted_at is null;
create index on documents (organization_id, project_id) where deleted_at is null;
create index on submittals (project_id, status) where deleted_at is null;
create index on rfi (project_id, status) where deleted_at is null;
create index on ncr (project_id, status) where deleted_at is null;
create index on employees (organization_id, is_active) where deleted_at is null;
create index on resource_allocations (employee_id) where deleted_at is null;
create index on audit_logs (organization_id, created_at desc);

-- ✅ END 001 core_schema

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

-- =====================================================
-- 004 phase6_documents
-- Source: migration-phase6.sql
-- =====================================================

-- ============================================================================
-- ElectraFlow AI — Phase 6 Migration: Documents, Invite System, User Admin
-- ============================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5.sql
-- Run in Supabase SQL Editor. Idempotent where possible (IF NOT EXISTS / IF EXISTS).
-- ============================================================================

-- ─── 1. Documents table — new columns ────────────────────────────────────────

alter table documents
  add column if not exists storage_path          text,
  add column if not exists file_name             text,
  add column if not exists current_version_number integer not null default 1;

-- ─── 2. Document versions — new columns ──────────────────────────────────────

alter table document_versions
  add column if not exists storage_path    text,
  add column if not exists file_name       text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type       text;

-- ─── 3. Invitations — replace raw token with SHA-256 hash ────────────────────
-- The raw token is NEVER stored in the database.
-- Only the SHA-256 hash is stored; the URL carries the raw token.
-- This means a leaked database dump cannot be used to accept invitations.

-- Rename token → token_hash (if column exists under the old name)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'invitations' and column_name = 'token'
  ) then
    alter table invitations rename column token to token_hash;
  end if;
end;
$$;

-- Make sure the column exists after potential rename
alter table invitations
  add column if not exists token_hash          text unique,
  add column if not exists accepted_by_clerk_id text;

-- ─── 4. New: document_shares ─────────────────────────────────────────────────
-- Explicit sharing replaces the simple shared_with_client boolean.
-- A client can only view a document if an un-deleted, non-expired share row exists.

create table if not exists document_shares (
  id                     uuid primary key default uuid_generate_v4(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  document_id            uuid not null references documents(id)     on delete cascade,
  shared_with_profile_id uuid not null references profiles(id)      on delete cascade,
  shared_by              uuid not null references profiles(id),
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  unique (document_id, shared_with_profile_id)
);

-- ─── 5. New: upload_sessions ─────────────────────────────────────────────────
-- Schema-only in Phase 6; UI deferred.  Used for tracking long uploads and
-- orphan-detection in future phases.

create table if not exists upload_sessions (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          text not null,           -- clerk_user_id (not profiles.id)
  document_id      uuid references documents(id),
  status           text not null default 'pending'
                     check (status in ('pending','uploading','processing','completed','failed','cancelled')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  storage_path     text,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── 6. Enable RLS on new tables ─────────────────────────────────────────────

alter table document_shares  enable row level security;
alter table upload_sessions  enable row level security;

-- ─── 7. Updated helper functions ─────────────────────────────────────────────

-- Returns the UUID primary key of the current user's profiles row.
-- Used in document_shares policy and document_approvals self-approval guard.
create or replace function get_my_profile_id()
returns uuid language sql stable security definer as $$
  select id
  from profiles
  where clerk_user_id = auth.jwt() ->> 'sub'
    and deleted_at is null
  limit 1;
$$;

-- ─── 8. Updated RLS: documents (Phase 6 replaces Phase 3) ────────────────────
-- Non-clients see all org documents (excluding hard-deleted).
-- Clients see ONLY approved documents that have an active, non-expired share row.

drop policy if exists "docs: member can view org documents" on documents;

create policy "docs: role-based document access"
  on documents for select
  using (
    organization_id = get_my_org_id()
    and (
      -- All non-client roles: see all org docs (including archived in list — soft
      -- deleted docs are filtered by service layer; admin/pm can restore)
      get_my_role() != 'client'
      or
      -- Client role: only approved + explicitly shared + not expired
      (
        status = 'approved'
        and deleted_at is null
        and exists (
          select 1
          from document_shares ds
          where ds.document_id = documents.id
            and ds.shared_with_profile_id = get_my_profile_id()
            and ds.deleted_at is null
            and (ds.expires_at is null or ds.expires_at > now())
        )
      )
    )
  );

-- ─── 9. Updated document_approvals — no self-approval ────────────────────────
-- Approver cannot be the uploader (created_by) of the same document.
-- Approver can only submit on their own behalf (approver_id = get_my_profile_id()).

drop policy if exists "doc_approvals: approvers can insert" on document_approvals;

create policy "doc_approvals: approvers can insert"
  on document_approvals for insert
  with check (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager', 'qa_qc_engineer', 'senior_electrical_engineer')
    -- Can only approve on behalf of yourself
    and approver_id = get_my_profile_id()
    -- Cannot approve your own uploaded document
    and approver_id is distinct from (
      select created_by from documents where id = document_id limit 1
    )
  );

-- ─── 10. document_shares RLS ─────────────────────────────────────────────────

drop policy if exists "doc_shares: org members can view"  on document_shares;
drop policy if exists "doc_shares: admin/pm can manage"   on document_shares;

create policy "doc_shares: org members can view"
  on document_shares for select
  using (organization_id = get_my_org_id() and deleted_at is null);

create policy "doc_shares: admin/pm can manage"
  on document_shares for all
  using (
    organization_id = get_my_org_id()
    and get_my_role() in ('admin', 'project_manager')
  );

-- ─── 11. upload_sessions RLS ─────────────────────────────────────────────────

drop policy if exists "upload_sessions: user can manage own" on upload_sessions;

create policy "upload_sessions: user can manage own"
  on upload_sessions for all
  using (
    organization_id = get_my_org_id()
    and user_id = get_my_clerk_id()
  );

-- ─── 12. Updated invitations RLS ─────────────────────────────────────────────
-- Add policy so:
--   • Authenticated users can read their own pending invite (by email match).
--   • Anonymous users can read pending invites by token (token is 256-bit secret).

drop policy if exists "invitations: user can read own pending invite" on invitations;

create policy "invitations: user can read own pending invite"
  on invitations for select
  using (
    status = 'pending'
    and expires_at > now()
    and (
      -- Authenticated: only their own invite (email match in JWT)
      (auth.role() = 'authenticated' and email = lower(coalesce(auth.jwt() ->> 'email', '')))
      -- Anon: anyone who has the raw token can look up the hashed version
      or auth.role() = 'anon'
    )
  );

-- ─── 13. Indexes on new tables ───────────────────────────────────────────────

create index if not exists idx_document_shares_document_id
  on document_shares(document_id) where deleted_at is null;

create index if not exists idx_document_shares_profile_id
  on document_shares(shared_with_profile_id) where deleted_at is null;

create index if not exists idx_upload_sessions_user
  on upload_sessions(organization_id, user_id);

create index if not exists idx_documents_storage_path
  on documents(organization_id, storage_path) where deleted_at is null;

-- ─── 14. Trigger for upload_sessions ─────────────────────────────────────────

drop trigger if exists trg_upload_sessions_updated_at on upload_sessions;
create trigger trg_upload_sessions_updated_at
  before update on upload_sessions
  for each row execute function set_updated_at();

-- ─── 15. Storage bucket policies ─────────────────────────────────────────────
-- NOTE: These policies require the buckets 'project-documents' and 'avatars'
-- to already exist.  Create them in Supabase Dashboard → Storage before
-- running these policies.  Mark both buckets as PRIVATE (no public access).
--
-- Run manually in SQL Editor after creating the buckets:

/*
-- project-documents bucket
drop policy if exists "doc_storage: org members can upload" on storage.objects;
create policy "doc_storage: org members can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'project-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );

drop policy if exists "doc_storage: org members can read" on storage.objects;
create policy "doc_storage: org members can read"
  on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );

-- avatars bucket
drop policy if exists "avatars: org members can read" on storage.objects;
create policy "avatars: org members can read"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );

drop policy if exists "avatars: user can upload own avatar" on storage.objects;
create policy "avatars: user can upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = get_my_org_id()::text
  );
*/

-- ─── Verification ─────────────────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
--   where table_name = 'documents' order by ordinal_position;
-- select column_name from information_schema.columns
--   where table_name = 'invitations' order by ordinal_position;
-- select tablename from pg_tables where schemaname = 'public' order by tablename;

-- ✅ END 004 phase6_documents

-- =====================================================
-- 005 phase7_submittals_enum
-- Source: migration-phase7.sql (split enum_only)
-- =====================================================

-- NOTE: Enum extension (idempotent no-op on fresh DB — values defined in schema.sql).

-- ===========================================================================
-- ElectraFlow AI — Phase 7 Migration: Submittals Workflow
-- ===========================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5.sql + migration-phase6.sql
-- Run in Supabase SQL Editor.  Idempotent where possible (IF NOT EXISTS / IF EXISTS).
--
-- IMPORTANT: The ALTER TYPE statement must run outside a multi-statement
-- transaction.  In the Supabase SQL Editor each statement is its own
-- implicit transaction, so this is safe to paste and run as a single block.
-- ===========================================================================

-- ─── 1. Extend submittal_status enum ─────────────────────────────────────────

ALTER TYPE submittal_status ADD VALUE IF NOT EXISTS 'archived';

-- ✅ END 005 phase7_submittals_enum

-- =====================================================
-- 005 phase7_submittals_rest
-- Source: migration-phase7.sql (split rest)
-- =====================================================


-- ─── 2. submittals — new columns ─────────────────────────────────────────────

ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS revision_number  integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS review_due_date  date,
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz;

-- ─── 3. submittal_items — new columns ────────────────────────────────────────
-- Phase 3 submittal_items only had: description, quantity, unit,
-- manufacturer, model_number, notes.  Phase 7 adds rich fields.

ALTER TABLE submittal_items
  ADD COLUMN IF NOT EXISTS spec_section    text,
  ADD COLUMN IF NOT EXISTS equipment_name  text,
  ADD COLUMN IF NOT EXISTS status          submittal_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS revision_number integer          NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by      uuid REFERENCES profiles(id);

-- ─── 4. submittal_item_documents — new table ─────────────────────────────────
-- Stores references (not copies) between submittal items and existing
-- project documents.  No file duplication — document_id is a FK to documents.

CREATE TABLE IF NOT EXISTS submittal_item_documents (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  submittal_id       uuid        NOT NULL REFERENCES submittals(id)       ON DELETE CASCADE,
  submittal_item_id  uuid        NOT NULL REFERENCES submittal_items(id)  ON DELETE CASCADE,
  document_id        uuid        NOT NULL REFERENCES documents(id)        ON DELETE CASCADE,
  attached_by        uuid        REFERENCES profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (submittal_item_id, document_id)
);

ALTER TABLE submittal_item_documents ENABLE ROW LEVEL SECURITY;

-- ─── 5. Unique constraint — submittal_number per project ─────────────────────
-- Enforced here AND in the service layer (catches 23505 with a friendly message).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_submittals_number_project'
  ) THEN
    ALTER TABLE submittals
      ADD CONSTRAINT uq_submittals_number_project
      UNIQUE (project_id, submittal_number);
  END IF;
END;
$$;

-- ─── 6. Updated RLS: submittals ──────────────────────────────────────────────
-- Phase 3 had a single open policy.  Phase 7 splits into internal vs client.

DROP POLICY IF EXISTS "submittals: member can view org submittals" ON submittals;
DROP POLICY IF EXISTS "submittals: internal members can view"      ON submittals;
DROP POLICY IF EXISTS "submittals: client can view approved"       ON submittals;

CREATE POLICY "submittals: internal members can view"
  ON submittals FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() != 'client'
  );

CREATE POLICY "submittals: client can view approved"
  ON submittals FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND status IN ('approved', 'approved_as_noted')
    AND deleted_at IS NULL
  );

-- Insert: Engineers, Senior EE, PM, Admin can create
DROP POLICY IF EXISTS "submittals: engineers can insert" ON submittals;
CREATE POLICY "submittals: engineers can insert"
  ON submittals FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer'
    )
  );

-- Update: same roles as insert (workflow actions use UPDATE)
DROP POLICY IF EXISTS "submittals: engineers can update" ON submittals;
CREATE POLICY "submittals: engineers can update"
  ON submittals FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer',
      'qa_qc_engineer'
    )
  );

-- ─── 7. Updated RLS: submittal_reviews ───────────────────────────────────────
-- No self-review: reviewer_id must not be the same as submitted_by.

DROP POLICY IF EXISTS "submittal_reviews: reviewers can insert"              ON submittal_reviews;
DROP POLICY IF EXISTS "submittal_reviews: reviewers can insert (no self)"    ON submittal_reviews;

CREATE POLICY "submittal_reviews: reviewers can insert (no self)"
  ON submittal_reviews FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'qa_qc_engineer'
    )
    AND reviewer_id = get_my_profile_id()
    AND reviewer_id IS DISTINCT FROM (
      SELECT submitted_by FROM submittals WHERE id = submittal_id LIMIT 1
    )
  );

CREATE POLICY "submittal_reviews: members can view"
  ON submittal_reviews FOR SELECT
  USING (organization_id = get_my_org_id());

-- ─── 8. Updated RLS: submittal_items ─────────────────────────────────────────

DROP POLICY IF EXISTS "submittal_items: member can view"    ON submittal_items;
DROP POLICY IF EXISTS "submittal_items: engineers can write" ON submittal_items;

CREATE POLICY "submittal_items: members can view"
  ON submittal_items FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "submittal_items: engineers can write"
  ON submittal_items FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer'
    )
  );

-- ─── 9. RLS: submittal_item_documents ────────────────────────────────────────

DROP POLICY IF EXISTS "sub_item_docs: org members can view"  ON submittal_item_documents;
DROP POLICY IF EXISTS "sub_item_docs: engineers can manage"  ON submittal_item_documents;

CREATE POLICY "sub_item_docs: org members can view"
  ON submittal_item_documents FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "sub_item_docs: engineers can manage"
  ON submittal_item_documents FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer'
    )
  );

-- ─── 10. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_submittals_project_status
  ON submittals(project_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_submittals_review_due
  ON submittals(review_due_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_submittal_item_docs_item
  ON submittal_item_documents(submittal_item_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_submittal_item_docs_doc
  ON submittal_item_documents(document_id) WHERE deleted_at IS NULL;

-- ─── 11. Updated_at trigger for submittal_item_documents ─────────────────────
-- submittal_item_documents has no updated_at column so no trigger needed.
-- submittal_items already has the trigger from Phase 3.

-- ─── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'submittals' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'submittal_items' ORDER BY ordinal_position;
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- ✅ END 005 phase7_submittals_rest

-- =====================================================
-- 006 phase8_rfi_enum
-- Source: migration-phase8.sql (split enum_only)
-- =====================================================

-- NOTE: Enum extension (idempotent no-op on fresh DB — values defined in schema.sql).

-- ===========================================================================
-- ElectraFlow AI — Phase 8 Migration: RFI Workflow
-- ===========================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5..7.sql
-- Run in Supabase SQL Editor.  Each ALTER TYPE runs as its own statement.
-- ===========================================================================

-- ─── 1. Extend rfi_status enum ───────────────────────────────────────────────
-- Phase 3 values: open | under_review | answered | closed | cancelled
-- Phase 8 adds: draft | submitted | reopened | voided | archived

ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'reopened';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'voided';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'archived';

-- ✅ END 006 phase8_rfi_enum

-- =====================================================
-- 006 phase8_rfi_rest
-- Source: migration-phase8.sql (split rest)
-- =====================================================


-- ─── 2. rfi table — new columns ──────────────────────────────────────────────

ALTER TABLE rfi
  ADD COLUMN IF NOT EXISTS question         text,
  ADD COLUMN IF NOT EXISTS revision_number  integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_status  rfi_status,          -- for restore
  ADD COLUMN IF NOT EXISTS submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at      timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason      text;                -- Admin-only void

-- Backfill question from description so existing rows keep their text
UPDATE rfi SET question = description WHERE question IS NULL;

-- ─── 3. rfi_responses — new columns ──────────────────────────────────────────

ALTER TABLE rfi_responses
  ADD COLUMN IF NOT EXISTS response_type  text NOT NULL DEFAULT 'answer'
    CHECK (response_type IN ('clarification','answer','request_more_info','internal_note')),
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- ─── 4. rfi_documents — new table ────────────────────────────────────────────
-- Links an RFI to existing project documents; no file duplication.

CREATE TABLE IF NOT EXISTS rfi_documents (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rfi_id          uuid        NOT NULL REFERENCES rfi(id)           ON DELETE CASCADE,
  document_id     uuid        NOT NULL REFERENCES documents(id)     ON DELETE CASCADE,
  attached_by     uuid        REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (rfi_id, document_id)
);

ALTER TABLE rfi_documents ENABLE ROW LEVEL SECURITY;

-- ─── 5. Updated_at trigger for rfi_responses ─────────────────────────────────

DROP TRIGGER IF EXISTS trg_rfi_responses_updated_at ON rfi_responses;
CREATE TRIGGER trg_rfi_responses_updated_at
  BEFORE UPDATE ON rfi_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 6. Updated RLS: rfi (replace Phase 3 single policy) ────────────────────

DROP POLICY IF EXISTS "rfi: member can view org rfis"    ON rfi;
DROP POLICY IF EXISTS "rfi: engineers/pm/admin can manage" ON rfi;
DROP POLICY IF EXISTS "rfi: internal members can view"   ON rfi;
DROP POLICY IF EXISTS "rfi: client can view"             ON rfi;
DROP POLICY IF EXISTS "rfi: engineers can insert"        ON rfi;
DROP POLICY IF EXISTS "rfi: engineers can update"        ON rfi;

-- SELECT: internal staff see all org RFIs (including archived — service filters)
CREATE POLICY "rfi: internal members can view"
  ON rfi FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() != 'client'
  );

-- SELECT: clients see only non-archived, non-voided RFIs
CREATE POLICY "rfi: client can view"
  ON rfi FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND status NOT IN ('archived', 'voided')
    AND deleted_at IS NULL
  );

-- INSERT: Engineers and PM/Admin can create
CREATE POLICY "rfi: engineers can insert"
  ON rfi FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer'
    )
  );

-- UPDATE: all workflow roles can update (service enforces fine-grained rules)
CREATE POLICY "rfi: engineers can update"
  ON rfi FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── 7. Updated RLS: rfi_responses ───────────────────────────────────────────

DROP POLICY IF EXISTS "rfi_responses: member can view"           ON rfi_responses;
DROP POLICY IF EXISTS "rfi_responses: respondents can insert"    ON rfi_responses;
DROP POLICY IF EXISTS "rfi_responses: internal members can view all" ON rfi_responses;
DROP POLICY IF EXISTS "rfi_responses: client cannot see internal notes" ON rfi_responses;
DROP POLICY IF EXISTS "rfi_responses: respondents can insert (no self)" ON rfi_responses;

-- SELECT: internal staff see everything
CREATE POLICY "rfi_responses: internal members can view all"
  ON rfi_responses FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() != 'client'
    AND deleted_at IS NULL
  );

-- SELECT: clients cannot see internal notes
CREATE POLICY "rfi_responses: client visible responses"
  ON rfi_responses FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND response_type != 'internal_note'
    AND deleted_at IS NULL
  );

-- INSERT: prevent self-response (unless Admin/PM)
CREATE POLICY "rfi_responses: respondents can insert (no self)"
  ON rfi_responses FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager', 'senior_electrical_engineer',
      'electrical_engineer', 'qa_qc_engineer', 'client'
    )
    AND (
      get_my_role() IN ('admin', 'project_manager')
      OR respondent_id IS DISTINCT FROM (
        SELECT submitted_by FROM rfi WHERE id = rfi_id LIMIT 1
      )
    )
  );

-- ─── 8. RLS: rfi_documents ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "rfi_docs: org members can view"         ON rfi_documents;
DROP POLICY IF EXISTS "rfi_docs: engineers/pm/admin can manage" ON rfi_documents;

CREATE POLICY "rfi_docs: org members can view"
  ON rfi_documents FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "rfi_docs: engineers/pm/admin can manage"
  ON rfi_documents FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'admin', 'project_manager',
      'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer'
    )
  );

-- ─── 9. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rfi_project_status
  ON rfi(project_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rfi_assigned_to
  ON rfi(assigned_to) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rfi_documents_rfi
  ON rfi_documents(rfi_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rfi_responses_rfi
  ON rfi_responses(rfi_id) WHERE deleted_at IS NULL;

-- ─── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'rfi' ORDER BY ordinal_position;
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- ✅ END 006 phase8_rfi_rest

-- =====================================================
-- 007 phase10_resources
-- Source: migration-phase10.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 10 Migration: Resource Management & Workforce
-- ===========================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5..9.sql
-- Run in Supabase SQL Editor.  All ALTER TYPE run as own statements.
-- ===========================================================================

-- ─── 1. employees — new columns ──────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS discipline                    text,
  ADD COLUMN IF NOT EXISTS employment_status            text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','terminated','contractor')),
  ADD COLUMN IF NOT EXISTS default_weekly_capacity_hours numeric(5,1) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS billable_target_percent       integer DEFAULT 80
    CHECK (billable_target_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS location                     text,
  ADD COLUMN IF NOT EXISTS manager_id                   uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS start_date                   date,
  ADD COLUMN IF NOT EXISTS end_date                     date,
  ADD COLUMN IF NOT EXISTS updated_by                   uuid REFERENCES profiles(id);

-- ─── 2. Unique constraint on employee_number per org ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_employees_number_org'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT uq_employees_number_org
      UNIQUE (organization_id, employee_number);
  END IF;
END;
$$;

-- ─── 3. employee_skills — new columns ────────────────────────────────────────

ALTER TABLE employee_skills
  ADD COLUMN IF NOT EXISTS skill_category  text,
  ADD COLUMN IF NOT EXISTS last_used_date  date,
  ADD COLUMN IF NOT EXISTS notes           text;

-- ─── 4. employee_certifications — new table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_certifications (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id          uuid        NOT NULL REFERENCES employees(id)     ON DELETE CASCADE,
  certification_name   text        NOT NULL,
  issuing_body         text,
  certification_number text,
  issue_date           date,
  expiry_date          date,
  attachment_url       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES profiles(id),
  deleted_at           timestamptz
);

ALTER TABLE employee_certifications ENABLE ROW LEVEL SECURITY;

-- ─── 5. resource_allocations — new columns ────────────────────────────────────

ALTER TABLE resource_allocations
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','on_hold','ended')),
  ADD COLUMN IF NOT EXISTS weekly_hours numeric(5,1),
  ADD COLUMN IF NOT EXISTS updated_by   uuid REFERENCES profiles(id);

-- ─── 6. Updated RLS: employees ────────────────────────────────────────────────
-- Phase 3 only allowed admin/hr/executive to view. Phase 10 adds engineer
-- self-view and expands management view to include PM.

DROP POLICY IF EXISTS "employees: hr/admin/executive can view" ON employees;
DROP POLICY IF EXISTS "employees: hr/admin can manage"         ON employees;
DROP POLICY IF EXISTS "employees: management view"             ON employees;
DROP POLICY IF EXISTS "employees: engineer self view"          ON employees;

CREATE POLICY "employees: management view"
  ON employees FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

-- Engineers can see all employees (read-only) for team awareness
CREATE POLICY "employees: engineering team view"
  ON employees FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "employees: hr/admin can insert"
  ON employees FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

CREATE POLICY "employees: hr/admin can update"
  ON employees FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 7. Updated RLS: employee_skills ─────────────────────────────────────────

DROP POLICY IF EXISTS "employee_skills: hr/admin can view"   ON employee_skills;
DROP POLICY IF EXISTS "employee_skills: hr/admin can manage" ON employee_skills;

CREATE POLICY "employee_skills: management view"
  ON employee_skills FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_skills: engineer own view"
  ON employee_skills FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_skills: hr/admin can manage"
  ON employee_skills FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 8. RLS: employee_certifications ─────────────────────────────────────────

CREATE POLICY "employee_certs: management view"
  ON employee_certifications FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_certs: engineer own view"
  ON employee_certifications FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_certs: hr/admin can manage"
  ON employee_certifications FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 9. Updated RLS: resource_allocations ────────────────────────────────────

DROP POLICY IF EXISTS "resource_allocations: pm/hr/admin can view"   ON resource_allocations;
DROP POLICY IF EXISTS "resource_allocations: pm/hr/admin can manage" ON resource_allocations;

CREATE POLICY "resource_allocations: management view"
  ON resource_allocations FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "resource_allocations: engineer own view"
  ON resource_allocations FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "resource_allocations: pm/hr/admin can insert"
  ON resource_allocations FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager')
  );

CREATE POLICY "resource_allocations: pm/hr/admin can update"
  ON resource_allocations FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager')
  );

-- ─── 10. Triggers ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_employee_certifications_updated_at ON employee_certifications;
CREATE TRIGGER trg_employee_certifications_updated_at
  BEFORE UPDATE ON employee_certifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 11. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_certs_employee
  ON employee_certifications(employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certs_expiry
  ON employee_certifications(expiry_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_employee_dates
  ON resource_allocations(employee_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_project
  ON resource_allocations(project_id) WHERE deleted_at IS NULL;

-- ─── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'employees' ORDER BY ordinal_position;
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- ✅ END 007 phase10_resources

-- =====================================================
-- 008 phase11_timesheets
-- Source: migration-phase11.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 11 Migration: Timesheets & Leave Management
-- ===========================================================================
-- Prerequisites: schema.sql + all previous migrations (phase5 – phase10)
-- Run in Supabase SQL Editor (top to bottom, each statement separately if needed).
-- ===========================================================================

-- ─── Helper function: get_my_profile_id() ────────────────────────────────────
-- Returns the profiles.id for the authenticated Clerk user.
-- Used in RLS policies to scope employee/timesheet access.

CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM profiles
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

-- ─── 1. holidays ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holidays (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  holiday_date    date        NOT NULL,
  recurring       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  deleted_at      timestamptz,
  CONSTRAINT uq_holiday_org_date UNIQUE (organization_id, holiday_date)
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- ─── 2. timesheets ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timesheets (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       uuid        NOT NULL REFERENCES employees(id),
  week_start_date   date        NOT NULL,   -- always Monday (ISO week)
  week_end_date     date        NOT NULL,   -- always Sunday
  status            text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','archived')),
  total_hours       numeric(6,2) NOT NULL DEFAULT 0,
  regular_hours     numeric(6,2) NOT NULL DEFAULT 0,
  overtime_hours    numeric(6,2) NOT NULL DEFAULT 0,
  submitted_at      timestamptz,
  approved_by       uuid REFERENCES profiles(id),
  approved_at       timestamptz,
  rejected_by       uuid REFERENCES profiles(id),
  rejected_at       timestamptz,
  rejection_reason  text,
  unlock_reason     text,
  revision_number   integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id),
  updated_by        uuid REFERENCES profiles(id),
  deleted_at        timestamptz,
  CONSTRAINT uq_timesheet_emp_week UNIQUE (employee_id, week_start_date)
);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

-- ─── 3. timesheet_entries ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  timesheet_id    uuid        NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  project_id      uuid        NOT NULL REFERENCES projects(id),
  entry_date      date        NOT NULL,
  hours           numeric(4,2) NOT NULL
    CHECK (hours > 0 AND hours <= 24),
  work_type       text        NOT NULL DEFAULT 'regular'
    CHECK (work_type IN ('regular','overtime','travel','training','admin')),
  description     text,
  billable        boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- ─── 4. leave_requests ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_requests (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id      uuid        NOT NULL REFERENCES employees(id),
  leave_type       text        NOT NULL
    CHECK (leave_type IN ('pto','sick','unpaid','holiday','bereavement','other')),
  start_date       date        NOT NULL,
  end_date         date        NOT NULL,
  total_days       numeric(5,2) NOT NULL DEFAULT 0,
  reason           text,
  status           text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by      uuid REFERENCES profiles(id),
  approved_at      timestamptz,
  rejected_by      uuid REFERENCES profiles(id),
  rejected_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES profiles(id),
  deleted_at       timestamptz,
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- ─── 5. Updated triggers ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_holidays_updated_at ON holidays;
CREATE TRIGGER trg_holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_timesheets_updated_at ON timesheets;
CREATE TRIGGER trg_timesheets_updated_at
  BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ts_entries_updated_at ON timesheet_entries;
CREATE TRIGGER trg_ts_entries_updated_at
  BEFORE UPDATE ON timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_leave_updated_at ON leave_requests;
CREATE TRIGGER trg_leave_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 6. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_timesheets_emp_week
  ON timesheets(employee_id, week_start_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_timesheets_org_status
  ON timesheets(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ts_entries_timesheet
  ON timesheet_entries(timesheet_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ts_entries_project_date
  ON timesheet_entries(project_id, entry_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_emp_dates
  ON leave_requests(employee_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_org_status
  ON leave_requests(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_holidays_org_date
  ON holidays(organization_id, holiday_date)
  WHERE deleted_at IS NULL;

-- ─── 7. RLS: holidays ────────────────────────────────────────────────────────

CREATE POLICY "holidays: org members can view"
  ON holidays FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "holidays: hr/admin can manage"
  ON holidays FOR ALL
  USING (organization_id = get_my_org_id() AND get_my_role() IN ('admin','hr'));

-- ─── 8. RLS: timesheets ──────────────────────────────────────────────────────

-- Employee views own timesheets
CREATE POLICY "timesheets: self view"
  ON timesheets FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

-- PM views team timesheets (employees allocated to PM's projects)
CREATE POLICY "timesheets: pm view team"
  ON timesheets FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'project_manager'
    AND employee_id IN (
      SELECT DISTINCT ra.employee_id
      FROM resource_allocations ra
      JOIN projects p ON p.id = ra.project_id
      WHERE p.created_by = get_my_profile_id()
        AND ra.organization_id = get_my_org_id()
        AND ra.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- HR / Admin / Executive view all
CREATE POLICY "timesheets: management view"
  ON timesheets FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','executive')
    AND deleted_at IS NULL
  );

-- Employee can create own timesheet
CREATE POLICY "timesheets: employee insert"
  ON timesheets FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
  );

-- Employee can update own draft; PM/HR/Admin can update status transitions
CREATE POLICY "timesheets: update"
  ON timesheets FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (
      (
        employee_id IN (
          SELECT id FROM employees
          WHERE profile_id = get_my_profile_id()
            AND organization_id = get_my_org_id()
        )
        AND status IN ('draft','rejected')
      )
      OR get_my_role() IN ('admin','hr','project_manager')
    )
  );

-- ─── 9. RLS: timesheet_entries ───────────────────────────────────────────────

-- Entries inherit access from parent timesheet via organization_id + timesheet_id
CREATE POLICY "ts_entries: self view"
  ON timesheet_entries FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT id FROM employees
        WHERE profile_id = get_my_profile_id()
          AND organization_id = get_my_org_id()
      )
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "ts_entries: pm view team"
  ON timesheet_entries FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'project_manager'
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT DISTINCT ra.employee_id
        FROM resource_allocations ra
        JOIN projects p ON p.id = ra.project_id
        WHERE p.created_by = get_my_profile_id()
          AND ra.organization_id = get_my_org_id()
          AND ra.deleted_at IS NULL
      )
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "ts_entries: management view"
  ON timesheet_entries FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "ts_entries: employee insert"
  ON timesheet_entries FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT id FROM employees
        WHERE profile_id = get_my_profile_id()
          AND organization_id = get_my_org_id()
      )
      AND status IN ('draft','rejected')
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "ts_entries: employee update/delete"
  ON timesheet_entries FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT id FROM employees
        WHERE profile_id = get_my_profile_id()
          AND organization_id = get_my_org_id()
      )
      AND status IN ('draft','rejected')
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "ts_entries: hr/admin can manage"
  ON timesheet_entries FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 10. RLS: leave_requests ─────────────────────────────────────────────────

CREATE POLICY "leave: self view"
  ON leave_requests FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "leave: pm view team"
  ON leave_requests FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'project_manager'
    AND employee_id IN (
      SELECT DISTINCT ra.employee_id
      FROM resource_allocations ra
      JOIN projects p ON p.id = ra.project_id
      WHERE p.created_by = get_my_profile_id()
        AND ra.organization_id = get_my_org_id()
        AND ra.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "leave: management view"
  ON leave_requests FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "leave: employee insert"
  ON leave_requests FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
  );

-- Employee can cancel own pending; HR/Admin/PM can update status
CREATE POLICY "leave: update"
  ON leave_requests FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (
      (
        employee_id IN (
          SELECT id FROM employees
          WHERE profile_id = get_my_profile_id()
            AND organization_id = get_my_org_id()
        )
        AND status = 'pending'
      )
      OR get_my_role() IN ('admin','hr','project_manager')
    )
  );

-- ─── Verification ─────────────────────────────────────────────────────────────
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT policyname FROM pg_policies WHERE tablename IN
--   ('holidays','timesheets','timesheet_entries','leave_requests');

-- ✅ END 008 phase11_timesheets

-- =====================================================
-- 009 phase12_financials
-- Source: migration-phase12.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 12 Migration: Financials & Cost Management
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase11
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── 1. project_budgets ──────────────────────────────────────────────────────
-- One row per project.  Stores the baseline budget + accumulated approved
-- change-order amounts.  Contingency is kept as a percentage so PMs can
-- adjust the buffer without touching the raw budget figure.

CREATE TABLE IF NOT EXISTS project_budgets (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          uuid          NOT NULL UNIQUE REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id     uuid          NOT NULL       REFERENCES organizations(id)  ON DELETE CASCADE,
  total_budget        numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_budget >= 0),
  approved_changes    numeric(15,2) NOT NULL DEFAULT 0,  -- running sum of approved CO amounts
  contingency_percent numeric(5,2)  NOT NULL DEFAULT 10
    CHECK (contingency_percent >= 0 AND contingency_percent <= 100),
  notes               text,
  created_by          uuid          REFERENCES profiles(id),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

-- ─── 2. expenses ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category         text          NOT NULL DEFAULT 'other'
    CHECK (category IN ('labor','material','equipment','subcontractor','software','travel','other')),
  description      text          NOT NULL,
  amount           numeric(15,2) NOT NULL CHECK (amount >= 0),
  expense_date     date          NOT NULL,
  vendor           text,
  reference_number text,
  billable         boolean       NOT NULL DEFAULT true,
  status           text          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  approved_by      uuid          REFERENCES profiles(id),
  approved_at      timestamptz,
  rejection_reason text,
  created_by       uuid          REFERENCES profiles(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ─── 3. change_orders ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS change_orders (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  co_number        text          NOT NULL,
  title            text          NOT NULL,
  description      text,
  amount           numeric(15,2) NOT NULL,  -- negative = credit change order
  status           text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','voided')),
  submitted_by     uuid          REFERENCES profiles(id),
  submitted_at     timestamptz,
  reviewed_by      uuid          REFERENCES profiles(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  void_reason      text,
  revision_number  integer       NOT NULL DEFAULT 1,
  created_by       uuid          REFERENCES profiles(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT uq_co_project_number UNIQUE (project_id, co_number)
);

ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;

-- ─── 4. invoices ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number  text          NOT NULL,
  title           text          NOT NULL,
  client_name     text,
  status          text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','voided')),
  issue_date      date          NOT NULL,
  due_date        date          NOT NULL,
  subtotal        numeric(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate        numeric(5,2)  NOT NULL DEFAULT 0
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount      numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount    numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount     numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  notes           text,
  created_by      uuid          REFERENCES profiles(id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_invoice_org_number UNIQUE (organization_id, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ─── 5. invoice_items ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_items (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      uuid          NOT NULL REFERENCES invoices(id)      ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description     text          NOT NULL,
  quantity        numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  amount          numeric(15,2) NOT NULL CHECK (amount >= 0),
  sort_order      integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- ─── 6. payments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       uuid          NOT NULL REFERENCES invoices(id)      ON DELETE CASCADE,
  project_id       uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount           numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_date     date          NOT NULL,
  method           text          NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer','check','cash','credit_card','other')),
  reference_number text,
  notes            text,
  created_by       uuid          REFERENCES profiles(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ─── Triggers: keep updated_at fresh ─────────────────────────────────────────
-- The set_updated_at() function is created by earlier migrations.
-- These triggers are idempotent (OR REPLACE not available on triggers, so
-- drop-if-exists first).

DROP TRIGGER IF EXISTS trg_project_budgets_updated_at ON project_budgets;
CREATE TRIGGER trg_project_budgets_updated_at
  BEFORE UPDATE ON project_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_change_orders_updated_at ON change_orders;
CREATE TRIGGER trg_change_orders_updated_at
  BEFORE UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoice_items_updated_at ON invoice_items;
CREATE TRIGGER trg_invoice_items_updated_at
  BEFORE UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- project_budgets
DROP POLICY IF EXISTS "budgets: org members read" ON project_budgets;
CREATE POLICY "budgets: org members read"
  ON project_budgets FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "budgets: admin/pm insert" ON project_budgets;
CREATE POLICY "budgets: admin/pm insert"
  ON project_budgets FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "budgets: admin/pm update" ON project_budgets;
CREATE POLICY "budgets: admin/pm update"
  ON project_budgets FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- expenses
DROP POLICY IF EXISTS "expenses: org members read" ON expenses;
CREATE POLICY "expenses: org members read"
  ON expenses FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "expenses: admin/pm insert" ON expenses;
CREATE POLICY "expenses: admin/pm insert"
  ON expenses FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','executive'));

DROP POLICY IF EXISTS "expenses: admin/pm update" ON expenses;
CREATE POLICY "expenses: admin/pm update"
  ON expenses FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "expenses: admin delete (soft)" ON expenses;
CREATE POLICY "expenses: admin delete (soft)"
  ON expenses FOR DELETE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- change_orders
DROP POLICY IF EXISTS "change_orders: org members read" ON change_orders;
CREATE POLICY "change_orders: org members read"
  ON change_orders FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "change_orders: admin/pm insert" ON change_orders;
CREATE POLICY "change_orders: admin/pm insert"
  ON change_orders FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "change_orders: admin/pm update" ON change_orders;
CREATE POLICY "change_orders: admin/pm update"
  ON change_orders FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- invoices
DROP POLICY IF EXISTS "invoices: org members read" ON invoices;
CREATE POLICY "invoices: org members read"
  ON invoices FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "invoices: admin/pm insert" ON invoices;
CREATE POLICY "invoices: admin/pm insert"
  ON invoices FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "invoices: admin/pm update" ON invoices;
CREATE POLICY "invoices: admin/pm update"
  ON invoices FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- invoice_items
DROP POLICY IF EXISTS "invoice_items: org members read" ON invoice_items;
CREATE POLICY "invoice_items: org members read"
  ON invoice_items FOR SELECT
  USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "invoice_items: admin/pm manage" ON invoice_items;
CREATE POLICY "invoice_items: admin/pm manage"
  ON invoice_items FOR ALL
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- payments
DROP POLICY IF EXISTS "payments: org members read" ON payments;
CREATE POLICY "payments: org members read"
  ON payments FOR SELECT
  USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "payments: admin/pm insert" ON payments;
CREATE POLICY "payments: admin/pm insert"
  ON payments FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- ─── Performance indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id   ON project_budgets  (project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_org_id       ON project_budgets  (organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id          ON expenses         (project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_status          ON expenses         (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_change_orders_project_id     ON change_orders    (project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_org_status     ON change_orders    (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id          ON invoices         (project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status          ON invoices         (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id     ON invoice_items    (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id          ON payments         (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_project_id          ON payments         (project_id);

-- ✅ END 009 phase12_financials

-- =====================================================
-- 010 phase13_notifications
-- Source: migration-phase13.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 13 Migration: Notifications, Activity & Realtime
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase12
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── Ensure get_my_profile_id() exists (defined in phase11) ──────────────────
-- Re-declare defensively in case migrations are run out of order.
CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM profiles
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

-- ─── 1. notifications ─────────────────────────────────────────────────────────
-- One row per (recipient, event). Soft-deleted, snoozeable, pinnable.

CREATE TABLE IF NOT EXISTS notifications (
  id                   uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_profile_id uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_profile_id     uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  event_type           text          NOT NULL,
  title                text          NOT NULL,
  message              text,
  entity_type          text,
  entity_id            text,
  route                text,         -- stored at creation time; may become stale if entity deleted
  priority             text          NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  category             text          NOT NULL DEFAULT 'system'
    CHECK (category IN (
      'project','document','submittal','rfi','ncr','resource',
      'timesheet','financial','user','system','client','ai',
      'report','meeting','electrical','billing'
    )),
  severity             text          NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','success','warning','error')),
  is_pinned            boolean       NOT NULL DEFAULT false,
  read_at              timestamptz,
  dismissed_at         timestamptz,
  snoozed_until        timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ─── 2. notification_preferences ─────────────────────────────────────────────
-- Sparse model: absence of row implies default (enabled, immediate).

CREATE TABLE IF NOT EXISTS notification_preferences (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel         text          NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app','email','future_webhook')),
  event_type      text          NOT NULL,
  enabled         boolean       NOT NULL DEFAULT true,
  frequency       text          NOT NULL DEFAULT 'immediate'
    CHECK (frequency IN ('immediate','daily_digest','weekly_digest','disabled')),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pref_profile_channel_event UNIQUE (profile_id, channel, event_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ─── 3. activity_events ───────────────────────────────────────────────────────
-- Immutable audit/activity log. Visibility controls client access.

CREATE TABLE IF NOT EXISTS activity_events (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  event_type       text          NOT NULL,
  entity_type      text,
  entity_id        text,
  entity_label     text,         -- snapshot of entity name/number at event time
  message          text          NOT NULL,
  metadata         jsonb         NOT NULL DEFAULT '{}',
  category         text          NOT NULL DEFAULT 'system'
    CHECK (category IN (
      'project','document','submittal','rfi','ncr','resource',
      'timesheet','financial','user','system','client','ai',
      'report','meeting','electrical','billing'
    )),
  visibility       text          NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','client_visible','private')),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- ─── 4. notification_deliveries ──────────────────────────────────────────────
-- Tracks per-channel delivery state. Admin-only reads.

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_id uuid          NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         text          NOT NULL
    CHECK (channel IN ('in_app','email','future_webhook')),
  status          text          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  attempted_at    timestamptz,
  delivered_at    timestamptz,
  error_message   text
);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- ─── Triggers: updated_at ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Performance indexes ──────────────────────────────────────────────────────

-- notifications: unread count (most frequent query)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_profile_id, read_at)
  WHERE deleted_at IS NULL AND dismissed_at IS NULL;

-- notifications: cursor-paginated list (pinned first, then latest)
CREATE INDEX IF NOT EXISTS idx_notifications_cursor
  ON notifications (recipient_profile_id, is_pinned DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- notifications: snoozed filter
CREATE INDEX IF NOT EXISTS idx_notifications_snoozed
  ON notifications (recipient_profile_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL AND deleted_at IS NULL;

-- notifications: org-wide (admin view)
CREATE INDEX IF NOT EXISTS idx_notifications_org
  ON notifications (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- notifications: full-text search on message
CREATE INDEX IF NOT EXISTS idx_notifications_message_fts
  ON notifications USING gin (to_tsvector('english', coalesce(message, '')));

-- notification_preferences
CREATE INDEX IF NOT EXISTS idx_notif_prefs_profile
  ON notification_preferences (profile_id, channel);

-- activity_events: chronological org feed
CREATE INDEX IF NOT EXISTS idx_activity_org_chrono
  ON activity_events (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: per-entity history
CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity_events (organization_id, entity_type, entity_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: visibility filter (client feed)
CREATE INDEX IF NOT EXISTS idx_activity_visibility
  ON activity_events (organization_id, visibility, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: category filter
CREATE INDEX IF NOT EXISTS idx_activity_category
  ON activity_events (organization_id, category, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: full-text search on message
CREATE INDEX IF NOT EXISTS idx_activity_message_fts
  ON activity_events USING gin (to_tsvector('english', message));

-- activity_events: GIN index on metadata jsonb
CREATE INDEX IF NOT EXISTS idx_activity_metadata_gin
  ON activity_events USING gin (metadata);

-- notification_deliveries
CREATE INDEX IF NOT EXISTS idx_deliveries_notification
  ON notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_org_status
  ON notification_deliveries (organization_id, status);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- notifications: recipient reads their own
CREATE POLICY "notif: recipient select"
  ON notifications FOR SELECT
  USING (
    recipient_profile_id = get_my_profile_id()
    AND organization_id = get_my_org_id()
    AND deleted_at IS NULL
  );

-- notifications: org members can insert (fan-out creates notifs for others)
CREATE POLICY "notif: org member insert"
  ON notifications FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- notifications: recipient can update own (mark read, dismiss, snooze, pin)
CREATE POLICY "notif: recipient update"
  ON notifications FOR UPDATE
  USING (
    recipient_profile_id = get_my_profile_id()
    AND organization_id = get_my_org_id()
  );

-- notification_preferences: own profile only
CREATE POLICY "notif_prefs: select own"
  ON notification_preferences FOR SELECT
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "notif_prefs: insert own"
  ON notification_preferences FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "notif_prefs: update own"
  ON notification_preferences FOR UPDATE
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

-- activity_events: internal users see internal + client_visible
CREATE POLICY "activity: internal users"
  ON activity_events FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND visibility IN ('internal', 'client_visible')
    AND get_my_role() NOT IN ('client')
  );

-- activity_events: client sees only client_visible
CREATE POLICY "activity: client users"
  ON activity_events FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND visibility = 'client_visible'
    AND get_my_role() = 'client'
  );

-- activity_events: private events visible only to actor
CREATE POLICY "activity: private actor only"
  ON activity_events FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND visibility = 'private'
    AND actor_profile_id = get_my_profile_id()
  );

-- activity_events: org members can insert
CREATE POLICY "activity: org member insert"
  ON activity_events FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- activity_events: admin can soft-delete
CREATE POLICY "activity: admin soft delete"
  ON activity_events FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- notification_deliveries: admin can read all
CREATE POLICY "deliveries: admin read"
  ON notification_deliveries FOR SELECT
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- notification_deliveries: org members can insert
CREATE POLICY "deliveries: org member insert"
  ON notification_deliveries FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- ─── Supabase Realtime: enable for live updates ───────────────────────────────
-- Only notifications and activity_events need realtime.
-- Run this AFTER enabling realtime in the Supabase Dashboard:
--   Database → Replication → Supabase Realtime → Add table

-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;

-- (Commented out because ALTER PUBLICATION requires superuser on some Supabase tiers.
--  Enable via Dashboard: Database → Replication → Tables → Add both tables.)

-- ✅ END 010 phase13_notifications

-- =====================================================
-- 011 phase14_analytics
-- Source: migration-phase14.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 14 Migration: Analytics, Reports & Enterprise Intelligence
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase13
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── 1. saved_reports ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_reports (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       uuid          NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  name             text          NOT NULL,
  description      text,
  report_type      text          NOT NULL,
  report_category  text          NOT NULL DEFAULT 'operational',
  entity_type      text,
  filters          jsonb         NOT NULL DEFAULT '{}',
  columns          jsonb         NOT NULL DEFAULT '[]',
  sort             jsonb         NOT NULL DEFAULT '{}',
  schedule         jsonb,
  visibility       text          NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','org_shared','executive_shared','admin_only')),
  version_number   integer       NOT NULL DEFAULT 1,
  parent_report_id uuid          REFERENCES saved_reports(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT chk_report_type CHECK (report_type IN (
    'projects','documents','submittals','rfi','ncr','resources','timesheets',
    'leave','financials','notifications','activity','audit',
    'meetings','electrical','ai','client_portal','saas_billing','super_admin','system_health'
  )),
  CONSTRAINT chk_report_category CHECK (report_category IN (
    'operational','financial','workforce','compliance','executive','system','future'
  ))
);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- ─── 2. report_runs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_runs (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  saved_report_id  uuid          REFERENCES saved_reports(id) ON DELETE SET NULL,
  requested_by     uuid          NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  report_type      text          NOT NULL,
  format           text          NOT NULL DEFAULT 'csv'
    CHECK (format IN ('csv','xlsx','pdf','json')),
  status           text          NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  file_path        text,
  row_count        integer       NOT NULL DEFAULT 0,
  started_at       timestamptz,
  completed_at     timestamptz,
  error_message    text,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

-- ─── 3. dashboard_preferences ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dashboard_type   text          NOT NULL DEFAULT 'executive'
    CHECK (dashboard_type IN ('executive','pm','hr','personal')),
  layout           jsonb         NOT NULL DEFAULT '[]',
  favorite_widgets jsonb         NOT NULL DEFAULT '[]',
  hidden_widgets   jsonb         NOT NULL DEFAULT '[]',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_dashboard_pref UNIQUE (profile_id, dashboard_type)
);

ALTER TABLE dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- ─── 4. system_metrics ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_metrics (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_name      text          NOT NULL,
  metric_category  text          NOT NULL DEFAULT 'system'
    CHECK (metric_category IN (
      'projects','documents','submittals','rfi','ncr','resources',
      'timesheets','financials','notifications','system','ai',
      'saas','electrical','meetings','client_portal'
    )),
  metric_value     numeric       NOT NULL DEFAULT 0,
  metadata         jsonb         NOT NULL DEFAULT '{}',
  captured_at      timestamptz   NOT NULL DEFAULT now(),
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- ─── 5. analytics_snapshots ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_type    text          NOT NULL DEFAULT 'daily'
    CHECK (snapshot_type IN ('daily','weekly','monthly')),
  period_start     date          NOT NULL,
  period_end       date          NOT NULL,
  data             jsonb         NOT NULL DEFAULT '{}',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_analytics_snapshot UNIQUE (organization_id, snapshot_type, period_start)
);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- ─── 6. threshold_rules ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS threshold_rules (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  metric_name      text          NOT NULL,
  metric_category  text          NOT NULL DEFAULT 'system',
  operator         text          NOT NULL DEFAULT 'gt'
    CHECK (operator IN ('gt','gte','lt','lte','eq')),
  threshold_value  numeric       NOT NULL,
  severity         text          NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','error','critical')),
  notify_roles     text[]        NOT NULL DEFAULT ARRAY['admin','executive'],
  is_active        boolean       NOT NULL DEFAULT true,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE threshold_rules ENABLE ROW LEVEL SECURITY;

-- ─── Triggers ──────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_saved_reports_updated_at ON saved_reports;
CREATE TRIGGER trg_saved_reports_updated_at
  BEFORE UPDATE ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_dashboard_preferences_updated_at ON dashboard_preferences;
CREATE TRIGGER trg_dashboard_preferences_updated_at
  BEFORE UPDATE ON dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_threshold_rules_updated_at ON threshold_rules;
CREATE TRIGGER trg_threshold_rules_updated_at
  BEFORE UPDATE ON threshold_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_saved_reports_org
  ON saved_reports (organization_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_reports_profile
  ON saved_reports (profile_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_saved_reports_type
  ON saved_reports (organization_id, report_type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_saved_reports_category
  ON saved_reports (organization_id, report_category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_runs_org
  ON report_runs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_runs_requester
  ON report_runs (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_runs_status
  ON report_runs (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_profile
  ON dashboard_preferences (profile_id, dashboard_type);

CREATE INDEX IF NOT EXISTS idx_system_metrics_org
  ON system_metrics (organization_id, metric_name, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_metrics_category
  ON system_metrics (organization_id, metric_category, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_metrics_metadata_gin
  ON system_metrics USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_org
  ON analytics_snapshots (organization_id, snapshot_type, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_data_gin
  ON analytics_snapshots USING gin (data);

CREATE INDEX IF NOT EXISTS idx_threshold_rules_org
  ON threshold_rules (organization_id, is_active) WHERE deleted_at IS NULL;

-- ─── RLS: saved_reports ──────────────────────────────────────────────────────

CREATE POLICY "saved_reports: owner select"
  ON saved_reports FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND (
      profile_id = get_my_profile_id()
      OR visibility = 'org_shared'
      OR (visibility = 'executive_shared' AND get_my_role() IN ('admin','executive'))
      OR (visibility = 'admin_only' AND get_my_role() = 'admin')
    )
  );

CREATE POLICY "saved_reports: org member insert"
  ON saved_reports FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND profile_id = get_my_profile_id());

CREATE POLICY "saved_reports: owner or admin update"
  ON saved_reports FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (profile_id = get_my_profile_id() OR get_my_role() = 'admin')
  );

-- ─── RLS: report_runs ────────────────────────────────────────────────────────

CREATE POLICY "report_runs: requester select"
  ON report_runs FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND (
      requested_by = get_my_profile_id()
      OR get_my_role() = 'admin'
      OR (get_my_role() = 'executive')
    )
  );

CREATE POLICY "report_runs: org member insert"
  ON report_runs FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND requested_by = get_my_profile_id());

CREATE POLICY "report_runs: requester or admin update"
  ON report_runs FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (requested_by = get_my_profile_id() OR get_my_role() = 'admin')
  );

-- ─── RLS: dashboard_preferences ──────────────────────────────────────────────

CREATE POLICY "dashboard_prefs: own select"
  ON dashboard_preferences FOR SELECT
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "dashboard_prefs: own insert"
  ON dashboard_preferences FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "dashboard_prefs: own update"
  ON dashboard_preferences FOR UPDATE
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "dashboard_prefs: own delete"
  ON dashboard_preferences FOR DELETE
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

-- ─── RLS: system_metrics ─────────────────────────────────────────────────────

CREATE POLICY "system_metrics: admin executive select"
  ON system_metrics FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','executive')
  );

CREATE POLICY "system_metrics: admin insert"
  ON system_metrics FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "system_metrics: admin update"
  ON system_metrics FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- ─── RLS: analytics_snapshots ─────────────────────────────────────────────────

CREATE POLICY "analytics_snapshots: org read"
  ON analytics_snapshots FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','executive','project_manager')
  );

CREATE POLICY "analytics_snapshots: admin insert"
  ON analytics_snapshots FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "analytics_snapshots: admin update"
  ON analytics_snapshots FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- ─── RLS: threshold_rules ────────────────────────────────────────────────────

CREATE POLICY "threshold_rules: admin executive select"
  ON threshold_rules FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() IN ('admin','executive')
  );

CREATE POLICY "threshold_rules: admin insert"
  ON threshold_rules FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "threshold_rules: admin update"
  ON threshold_rules FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- ─── RLS: audit_logs (strengthen Admin-only read if not already present) ─────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'audit_logs: admin select'
  ) THEN
    CREATE POLICY "audit_logs: admin select"
      ON audit_logs FOR SELECT
      USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');
  END IF;
END $$;

-- ✅ END 011 phase14_analytics

-- =====================================================
-- 012 phase15a_meetings
-- Source: migration-phase15a.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 15A Migration: Meetings & Action Items
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase14
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── Helper functions (existing Phase 3/4 tables) ────────────────────────────

CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM profiles
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND profile_id = get_my_profile_id()
      AND deleted_at IS NULL
  );
$$;

-- ─── 1. meetings ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meetings (
  id                uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id        uuid          REFERENCES projects(id) ON DELETE SET NULL,
  title             text          NOT NULL,
  meeting_type      text          NOT NULL DEFAULT 'coordination'
    CHECK (meeting_type IN (
      'standup','coordination','design_review','client','kickoff','closeout','other'
    )),
  status            text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','completed','cancelled','archived')),
  visibility        text          NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','client_visible')),
  scheduled_start   timestamptz   NOT NULL,
  scheduled_end     timestamptz   NOT NULL,
  location          text,
  video_link        text,
  agenda            text,
  minutes           text,
  cancel_reason     text,
  created_by        uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  chair_profile_id  uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT meetings_end_after_start CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_meetings_org_status_start
  ON meetings (organization_id, status, scheduled_start DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_project_start
  ON meetings (project_id, scheduled_start DESC)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_org_visibility
  ON meetings (organization_id, visibility)
  WHERE deleted_at IS NULL;

-- ─── 2. meeting_attendees ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_attendees (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id       uuid          NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  profile_id       uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  external_name    text,
  external_email   text,
  role             text          NOT NULL DEFAULT 'attendee'
    CHECK (role IN ('chair','attendee','optional','recorder')),
  response_status  text          NOT NULL DEFAULT 'pending'
    CHECK (response_status IN ('pending','accepted','declined','tentative')),
  attended         boolean       NOT NULL DEFAULT false,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT attendee_internal_or_external CHECK (
    profile_id IS NOT NULL
    OR (external_name IS NOT NULL AND external_email IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_attendees_profile
  ON meeting_attendees (meeting_id, profile_id)
  WHERE profile_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting
  ON meeting_attendees (meeting_id)
  WHERE deleted_at IS NULL;

-- ─── 3. meeting_action_items ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_action_items (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id       uuid          NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  project_id       uuid          REFERENCES projects(id) ON DELETE SET NULL,
  title            text          NOT NULL,
  description      text,
  assigned_to      uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  due_date         date,
  status           text          NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','completed','cancelled')),
  priority         text          NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  completed_at     timestamptz,
  completed_by     uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_by       uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting_status
  ON meeting_action_items (meeting_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_actions_assignee_due
  ON meeting_action_items (assigned_to, due_date)
  WHERE deleted_at IS NULL AND status IN ('open','in_progress');

CREATE INDEX IF NOT EXISTS idx_meeting_actions_org_due
  ON meeting_action_items (organization_id, due_date)
  WHERE deleted_at IS NULL;

-- ─── updated_at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON meetings;
CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_action_items_updated_at ON meeting_action_items;
CREATE TRIGGER trg_meeting_action_items_updated_at
  BEFORE UPDATE ON meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Helper functions (meeting tables — after CREATE TABLE) ──────────────────

CREATE OR REPLACE FUNCTION is_meeting_attendee(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM meeting_attendees
    WHERE meeting_id = p_meeting_id
      AND profile_id = get_my_profile_id()
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION can_view_meeting(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = p_meeting_id
      AND m.deleted_at IS NULL
      AND m.organization_id = get_my_org_id()
      AND (
        (
          get_my_role() = 'client'
          AND m.visibility = 'client_visible'
          AND is_meeting_attendee(m.id)
        )
        OR (
          get_my_role() <> 'client'
          AND (
            m.project_id IS NULL
            OR get_my_role() IN ('admin', 'project_manager')
            OR is_project_member(m.project_id)
            OR is_meeting_attendee(m.id)
            OR m.chair_profile_id = get_my_profile_id()
            OR m.created_by = get_my_profile_id()
          )
        )
      )
  );
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;

-- meetings SELECT
DROP POLICY IF EXISTS "meetings: view" ON meetings;
CREATE POLICY "meetings: view"
  ON meetings FOR SELECT
  USING (can_view_meeting(id));

-- meetings INSERT
DROP POLICY IF EXISTS "meetings: insert" ON meetings;
CREATE POLICY "meetings: insert"
  ON meetings FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer')
    AND (
      project_id IS NULL
      OR get_my_role() IN ('admin','project_manager')
      OR is_project_member(project_id)
    )
  );

-- meetings UPDATE
DROP POLICY IF EXISTS "meetings: update" ON meetings;
CREATE POLICY "meetings: update"
  ON meetings FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND (
      get_my_role() IN ('admin','project_manager')
      OR created_by = get_my_profile_id()
      OR chair_profile_id = get_my_profile_id()
    )
  );

-- meeting_attendees
DROP POLICY IF EXISTS "meeting_attendees: view" ON meeting_attendees;
CREATE POLICY "meeting_attendees: view"
  ON meeting_attendees FOR SELECT
  USING (can_view_meeting(meeting_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "meeting_attendees: manage" ON meeting_attendees;
CREATE POLICY "meeting_attendees: manage"
  ON meeting_attendees FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_attendees.meeting_id
        AND m.deleted_at IS NULL
        AND (
          get_my_role() IN ('admin','project_manager')
          OR m.created_by = get_my_profile_id()
          OR m.chair_profile_id = get_my_profile_id()
        )
    )
  );

-- meeting_action_items SELECT
DROP POLICY IF EXISTS "meeting_action_items: view" ON meeting_action_items;
CREATE POLICY "meeting_action_items: view"
  ON meeting_action_items FOR SELECT
  USING (can_view_meeting(meeting_id) AND deleted_at IS NULL);

-- meeting_action_items INSERT/UPDATE
DROP POLICY IF EXISTS "meeting_action_items: manage" ON meeting_action_items;
CREATE POLICY "meeting_action_items: manage"
  ON meeting_action_items FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_action_items.meeting_id
        AND m.deleted_at IS NULL
        AND (
          get_my_role() IN ('admin','project_manager')
          OR m.created_by = get_my_profile_id()
          OR m.chair_profile_id = get_my_profile_id()
        )
    )
  );

DROP POLICY IF EXISTS "meeting_action_items: update" ON meeting_action_items;
CREATE POLICY "meeting_action_items: update"
  ON meeting_action_items FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND (
      get_my_role() IN ('admin','project_manager')
      OR created_by = get_my_profile_id()
      OR assigned_to = get_my_profile_id()
      OR EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.id = meeting_action_items.meeting_id
          AND (m.chair_profile_id = get_my_profile_id() OR m.created_by = get_my_profile_id())
      )
    )
  );

-- ✅ END 012 phase15a_meetings

-- =====================================================
-- 013 phase15b_electrical
-- Source: migration-phase15b.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 15B Migration: Electrical Engineering Core
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase15a
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── Helper functions (existing prior-phase tables) ──────────────────────────

CREATE OR REPLACE FUNCTION can_view_electrical_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    get_my_role() IN ('admin', 'executive', 'project_manager', 'senior_electrical_engineer', 'electrical_engineer', 'qa_qc_engineer')
    AND get_my_role() NOT IN ('hr', 'client')
    AND (
      get_my_role() IN ('admin', 'executive', 'project_manager', 'qa_qc_engineer')
      OR is_project_member(p_project_id)
    );
$$;

-- ─── 1. panel_schedules ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panel_schedules (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  panel_name          text          NOT NULL,
  panel_type          text          NOT NULL DEFAULT 'distribution',
  voltage             numeric       NOT NULL DEFAULT 480,
  phase               text          NOT NULL DEFAULT 'three'
    CHECK (phase IN ('single','three')),
  location            text,
  fed_from            text,
  main_breaker_size   numeric,
  bus_rating          numeric,
  mounting            text,
  enclosure_type      text,
  status              text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','under_review','approved','rejected','archived')),
  revision_number     integer       NOT NULL DEFAULT 1,
  previous_status     text,
  created_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by         uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by         uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  approved_at         timestamptz,
  rejection_reason    text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_panel_schedules_project_name
  ON panel_schedules (project_id, panel_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_panel_schedules_org_status
  ON panel_schedules (organization_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ─── 2. circuits ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS circuits (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  panel_schedule_id   uuid          NOT NULL REFERENCES panel_schedules(id) ON DELETE CASCADE,
  circuit_number      text          NOT NULL,
  circuit_side        text          NOT NULL DEFAULT 'na'
    CHECK (circuit_side IN ('left','right','both','na')),
  description         text,
  load_va             numeric       NOT NULL DEFAULT 0 CHECK (load_va >= 0),
  breaker_size        numeric       CHECK (breaker_size IS NULL OR breaker_size > 0),
  poles               integer,
  phase               text,
  wire_size           text,
  conduit_size        text,
  voltage             numeric,
  remarks             text,
  created_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_circuits_panel_number
  ON circuits (panel_schedule_id, circuit_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_circuits_panel
  ON circuits (panel_schedule_id)
  WHERE deleted_at IS NULL;

-- ─── 3. load_calculations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS load_calculations (
  id                      uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id              uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  calculation_name        text          NOT NULL,
  calculation_type        text          NOT NULL DEFAULT 'panel_load'
    CHECK (calculation_type IN ('service_load','feeder_load','panel_load','equipment_load','other')),
  source_panel_id         uuid          REFERENCES panel_schedules(id) ON DELETE SET NULL,
  total_connected_load_va numeric       NOT NULL DEFAULT 0 CHECK (total_connected_load_va >= 0),
  demand_factor           numeric       NOT NULL DEFAULT 1 CHECK (demand_factor >= 0 AND demand_factor <= 1),
  demand_load_va          numeric       CHECK (demand_load_va IS NULL OR demand_load_va >= 0),
  voltage                 numeric       NOT NULL DEFAULT 480,
  phase                   text          NOT NULL DEFAULT 'three'
    CHECK (phase IN ('single','three')),
  calculated_current_a    numeric       CHECK (calculated_current_a IS NULL OR calculated_current_a >= 0),
  source_panel_revision   integer,
  status                  text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','under_review','approved','rejected','archived')),
  revision_number         integer       NOT NULL DEFAULT 1,
  previous_status         text,
  created_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by              uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by             uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by             uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,
  approved_at             timestamptz,
  rejection_reason        text,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_load_calculations_org_status
  ON load_calculations (organization_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ─── 4. equipment_lists ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_lists (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id          uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag                 text          NOT NULL,
  equipment_type      text          NOT NULL DEFAULT 'other',
  description         text,
  manufacturer        text,
  model               text,
  voltage             numeric,
  phase               text          CHECK (phase IS NULL OR phase IN ('single','three')),
  load_va             numeric       NOT NULL DEFAULT 0 CHECK (load_va >= 0),
  location            text,
  status              text          NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','archived')),
  created_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_project_tag
  ON equipment_lists (project_id, tag)
  WHERE deleted_at IS NULL;

-- ─── 5. electrical_revisions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS electrical_revisions (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type         text          NOT NULL
    CHECK (entity_type IN ('panel_schedule','load_calculation')),
  entity_id           uuid          NOT NULL,
  revision_number     integer       NOT NULL,
  change_summary      text          NOT NULL,
  changed_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_electrical_revisions_entity
  ON electrical_revisions (entity_type, entity_id, revision_number DESC);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_panel_schedules_updated_at ON panel_schedules;
CREATE TRIGGER trg_panel_schedules_updated_at
  BEFORE UPDATE ON panel_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_circuits_updated_at ON circuits;
CREATE TRIGGER trg_circuits_updated_at
  BEFORE UPDATE ON circuits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_load_calculations_updated_at ON load_calculations;
CREATE TRIGGER trg_load_calculations_updated_at
  BEFORE UPDATE ON load_calculations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_equipment_lists_updated_at ON equipment_lists;
CREATE TRIGGER trg_equipment_lists_updated_at
  BEFORE UPDATE ON equipment_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Helper functions (Phase 15B tables — after CREATE TABLE) ──────────────────

CREATE OR REPLACE FUNCTION can_view_panel(p_panel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM panel_schedules ps
    WHERE ps.id = p_panel_id
      AND ps.deleted_at IS NULL
      AND ps.organization_id = get_my_org_id()
      AND can_view_electrical_project(ps.project_id)
  );
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE panel_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE electrical_revisions ENABLE ROW LEVEL SECURITY;

-- panel_schedules SELECT
DROP POLICY IF EXISTS "panel_schedules: view" ON panel_schedules;
CREATE POLICY "panel_schedules: view"
  ON panel_schedules FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = get_my_org_id()
    AND get_my_role() NOT IN ('hr','client')
    AND can_view_electrical_project(project_id)
  );

DROP POLICY IF EXISTS "panel_schedules: insert" ON panel_schedules;
CREATE POLICY "panel_schedules: insert"
  ON panel_schedules FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer')
    AND can_view_electrical_project(project_id)
  );

DROP POLICY IF EXISTS "panel_schedules: update" ON panel_schedules;
CREATE POLICY "panel_schedules: update"
  ON panel_schedules FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer','qa_qc_engineer')
    AND (
      get_my_role() IN ('admin','project_manager','qa_qc_engineer')
      OR created_by = get_my_profile_id()
    )
  );

-- circuits
DROP POLICY IF EXISTS "circuits: view" ON circuits;
CREATE POLICY "circuits: view"
  ON circuits FOR SELECT
  USING (can_view_panel(panel_schedule_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "circuits: manage" ON circuits;
CREATE POLICY "circuits: manage"
  ON circuits FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer')
    AND EXISTS (
      SELECT 1 FROM panel_schedules ps
      WHERE ps.id = circuits.panel_schedule_id
        AND ps.status IN ('draft','rejected')
        AND can_view_electrical_project(ps.project_id)
    )
  );

-- load_calculations
DROP POLICY IF EXISTS "load_calculations: view" ON load_calculations;
CREATE POLICY "load_calculations: view"
  ON load_calculations FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = get_my_org_id()
    AND get_my_role() NOT IN ('hr','client')
    AND can_view_electrical_project(project_id)
  );

DROP POLICY IF EXISTS "load_calculations: insert" ON load_calculations;
CREATE POLICY "load_calculations: insert"
  ON load_calculations FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer')
    AND can_view_electrical_project(project_id)
  );

DROP POLICY IF EXISTS "load_calculations: update" ON load_calculations;
CREATE POLICY "load_calculations: update"
  ON load_calculations FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer','qa_qc_engineer')
    AND (
      get_my_role() IN ('admin','project_manager','qa_qc_engineer')
      OR created_by = get_my_profile_id()
    )
  );

-- equipment_lists
DROP POLICY IF EXISTS "equipment_lists: view" ON equipment_lists;
CREATE POLICY "equipment_lists: view"
  ON equipment_lists FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = get_my_org_id()
    AND get_my_role() NOT IN ('hr','client')
    AND can_view_electrical_project(project_id)
  );

DROP POLICY IF EXISTS "equipment_lists: insert" ON equipment_lists;
CREATE POLICY "equipment_lists: insert"
  ON equipment_lists FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer')
    AND can_view_electrical_project(project_id)
  );

DROP POLICY IF EXISTS "equipment_lists: update" ON equipment_lists;
CREATE POLICY "equipment_lists: update"
  ON equipment_lists FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() IN ('admin','project_manager','senior_electrical_engineer','electrical_engineer')
  );

-- electrical_revisions
DROP POLICY IF EXISTS "electrical_revisions: view" ON electrical_revisions;
CREATE POLICY "electrical_revisions: view"
  ON electrical_revisions FOR SELECT
  USING (organization_id = get_my_org_id() AND get_my_role() NOT IN ('hr','client'));

DROP POLICY IF EXISTS "electrical_revisions: insert" ON electrical_revisions;
CREATE POLICY "electrical_revisions: insert"
  ON electrical_revisions FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() NOT IN ('hr','client')
  );

-- ✅ END 013 phase15b_electrical

-- =====================================================
-- 014 phase15c_ai
-- Source: migration-phase15c.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 15C Migration: AI Copilot Foundation
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase15b
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── Helper functions (existing prior-phase tables) ────────────────────────────

CREATE OR REPLACE FUNCTION can_access_ai_features()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT get_my_role() NOT IN ('hr', 'client');
$$;

CREATE OR REPLACE FUNCTION can_manage_ai_mutations()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT get_my_role() IN (
    'admin', 'project_manager', 'senior_electrical_engineer',
    'electrical_engineer', 'qa_qc_engineer'
  );
$$;

-- ─── 1. chat_sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_sessions (
  id                      uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id              uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                   text          NOT NULL DEFAULT 'New chat',
  context_type            text
    CHECK (context_type IS NULL OR context_type IN (
      'general','project','document','submittal','rfi','ncr','meeting','load_calculation'
    )),
  context_id              uuid,
  attachment_document_id  uuid          REFERENCES documents(id) ON DELETE SET NULL,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_profile
  ON chat_sessions (organization_id, profile_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ─── 2. conversation_contexts ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_contexts (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chat_session_id     uuid          NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  context_type        text          NOT NULL
    CHECK (context_type IN (
      'general','project','document','submittal','rfi','ncr','meeting','load_calculation'
    )),
  context_id          uuid          NOT NULL,
  label               text,
  metadata            jsonb         NOT NULL DEFAULT '{}',
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_contexts_session
  ON conversation_contexts (chat_session_id);

-- ─── 3. chat_messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chat_session_id     uuid          NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role                text          NOT NULL CHECK (role IN ('user','assistant','system')),
  content             text          NOT NULL,
  citations           jsonb         NOT NULL DEFAULT '[]',
  metadata            jsonb         NOT NULL DEFAULT '{}',
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages (chat_session_id, created_at ASC);

-- ─── 4. document_chunks ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_chunks (
  id                    uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id           uuid          NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id   uuid          NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  chunk_index           integer       NOT NULL CHECK (chunk_index >= 0),
  content               text          NOT NULL,
  metadata              jsonb         NOT NULL DEFAULT '{}',
  embedding_status      text          NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending','queued','indexed','failed','stale')),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_chunks_version_index
  ON document_chunks (document_version_id, chunk_index)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_chunks_document
  ON document_chunks (document_id, embedding_status)
  WHERE deleted_at IS NULL;

-- ─── 5. embedding_jobs ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type         text          NOT NULL
    CHECK (source_type IN ('document','document_version','project','manual')),
  source_id           uuid          NOT NULL,
  status              text          NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  error_message       text,
  queue_metadata      jsonb         NOT NULL DEFAULT '{}',
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_org_status
  ON embedding_jobs (organization_id, status, created_at DESC);

-- ─── 6. ai_suggestions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  suggestion_type     text          NOT NULL
    CHECK (suggestion_type IN (
      'document_summary','submittal_review','rfi_summary','ncr_summary',
      'meeting_summary','load_calculation_summary','timesheet_summary','financial_summary'
    )),
  entity_type         text          NOT NULL,
  entity_id           uuid          NOT NULL,
  title               text          NOT NULL,
  content             text          NOT NULL,
  confidence          numeric       CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status              text          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','dismissed')),
  created_by_ai       boolean       NOT NULL DEFAULT true,
  reviewed_by         uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_org_status
  ON ai_suggestions (organization_id, status, created_at DESC);

-- ─── 7. ai_usage_metrics ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_metrics (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  event_type          text          NOT NULL
    CHECK (event_type IN (
      'chat_message','embedding_job','suggestion_review','chunk_search','provider_call'
    )),
  provider_id         text,
  model               text,
  tokens_in           integer       NOT NULL DEFAULT 0,
  tokens_out          integer       NOT NULL DEFAULT 0,
  metadata            jsonb         NOT NULL DEFAULT '{}',
  created_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_metrics_org
  ON ai_usage_metrics (organization_id, created_at DESC);

-- ─── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_suggestions_updated_at ON ai_suggestions;
CREATE TRIGGER trg_ai_suggestions_updated_at
  BEFORE UPDATE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Helper functions (Phase 15C tables — after CREATE TABLE) ──────────────────

CREATE OR REPLACE FUNCTION user_owns_chat_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_sessions cs
    WHERE cs.id = p_session_id
      AND cs.deleted_at IS NULL
      AND cs.organization_id = get_my_org_id()
      AND cs.profile_id = get_my_profile_id()
  );
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_metrics ENABLE ROW LEVEL SECURITY;

-- chat_sessions
DROP POLICY IF EXISTS "chat_sessions: view" ON chat_sessions;
CREATE POLICY "chat_sessions: view"
  ON chat_sessions FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
    AND can_access_ai_features()
  );

DROP POLICY IF EXISTS "chat_sessions: insert" ON chat_sessions;
CREATE POLICY "chat_sessions: insert"
  ON chat_sessions FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
    AND can_manage_ai_mutations()
  );

DROP POLICY IF EXISTS "chat_sessions: update" ON chat_sessions;
CREATE POLICY "chat_sessions: update"
  ON chat_sessions FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
    AND deleted_at IS NULL
    AND can_manage_ai_mutations()
  );

-- conversation_contexts
DROP POLICY IF EXISTS "conversation_contexts: view" ON conversation_contexts;
CREATE POLICY "conversation_contexts: view"
  ON conversation_contexts FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND can_access_ai_features()
    AND user_owns_chat_session(chat_session_id)
  );

DROP POLICY IF EXISTS "conversation_contexts: manage" ON conversation_contexts;
CREATE POLICY "conversation_contexts: manage"
  ON conversation_contexts FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND can_manage_ai_mutations()
    AND user_owns_chat_session(chat_session_id)
  );

-- chat_messages
DROP POLICY IF EXISTS "chat_messages: view" ON chat_messages;
CREATE POLICY "chat_messages: view"
  ON chat_messages FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND can_access_ai_features()
    AND user_owns_chat_session(chat_session_id)
  );

DROP POLICY IF EXISTS "chat_messages: insert" ON chat_messages;
CREATE POLICY "chat_messages: insert"
  ON chat_messages FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND can_manage_ai_mutations()
    AND user_owns_chat_session(chat_session_id)
  );

-- document_chunks
DROP POLICY IF EXISTS "document_chunks: view" ON document_chunks;
CREATE POLICY "document_chunks: view"
  ON document_chunks FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = get_my_org_id()
    AND can_access_ai_features()
  );

DROP POLICY IF EXISTS "document_chunks: manage" ON document_chunks;
CREATE POLICY "document_chunks: manage"
  ON document_chunks FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND can_manage_ai_mutations()
  );

-- embedding_jobs
DROP POLICY IF EXISTS "embedding_jobs: view" ON embedding_jobs;
CREATE POLICY "embedding_jobs: view"
  ON embedding_jobs FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND can_access_ai_features()
  );

DROP POLICY IF EXISTS "embedding_jobs: manage" ON embedding_jobs;
CREATE POLICY "embedding_jobs: manage"
  ON embedding_jobs FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND can_manage_ai_mutations()
  );

-- ai_suggestions
DROP POLICY IF EXISTS "ai_suggestions: view" ON ai_suggestions;
CREATE POLICY "ai_suggestions: view"
  ON ai_suggestions FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND can_access_ai_features()
  );

DROP POLICY IF EXISTS "ai_suggestions: insert" ON ai_suggestions;
CREATE POLICY "ai_suggestions: insert"
  ON ai_suggestions FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND can_manage_ai_mutations()
  );

DROP POLICY IF EXISTS "ai_suggestions: update" ON ai_suggestions;
CREATE POLICY "ai_suggestions: update"
  ON ai_suggestions FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND can_manage_ai_mutations()
  );

-- ai_usage_metrics
DROP POLICY IF EXISTS "ai_usage_metrics: view" ON ai_usage_metrics;
CREATE POLICY "ai_usage_metrics: view"
  ON ai_usage_metrics FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND can_access_ai_features()
  );

DROP POLICY IF EXISTS "ai_usage_metrics: insert" ON ai_usage_metrics;
CREATE POLICY "ai_usage_metrics: insert"
  ON ai_usage_metrics FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND can_access_ai_features()
  );

-- ✅ END 014 phase15c_ai

-- =====================================================
-- 015 phase15d_client_portal
-- Source: migration-phase15d.sql
-- =====================================================

-- ===========================================================================
-- ElectraFlow AI — Phase 15D Migration: Client Portal Polish
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase15c
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── 1. profiles.client_id ───────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_client_id
  ON profiles (client_id)
  WHERE client_id IS NOT NULL;

-- ─── 2. client_visible flags ─────────────────────────────────────────────────

ALTER TABLE rfi
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;

ALTER TABLE submittals
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rfi_client_visible
  ON rfi (client_visible, project_id)
  WHERE client_visible = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_submittals_client_visible
  ON submittals (client_visible, project_id)
  WHERE client_visible = true AND deleted_at IS NULL;

-- ─── 3. client_portal_preferences ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_portal_preferences (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id          uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  default_tab         text          NOT NULL DEFAULT 'dashboard'
    CHECK (default_tab IN ('dashboard','documents','rfi','submittals','invoices','activity','meetings','downloads')),
  notification_opt_in boolean       NOT NULL DEFAULT true,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

ALTER TABLE client_portal_preferences ENABLE ROW LEVEL SECURITY;

-- ─── 4. client_download_logs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_download_logs (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type     text          NOT NULL
    CHECK (entity_type IN ('document','invoice','report','other')),
  entity_id       uuid          NOT NULL,
  file_name       text          NOT NULL,
  downloaded_at   timestamptz   NOT NULL DEFAULT now(),
  ip_metadata     jsonb         NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE client_download_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_download_logs_org_profile
  ON client_download_logs (organization_id, profile_id, downloaded_at DESC);

-- ─── 5. client_portal_announcements ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_portal_announcements (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           text          NOT NULL,
  message         text          NOT NULL,
  starts_at       timestamptz   NOT NULL DEFAULT now(),
  ends_at         timestamptz,
  is_active       boolean       NOT NULL DEFAULT true,
  created_by      uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE client_portal_announcements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_portal_announcements_active
  ON client_portal_announcements (organization_id, is_active, starts_at, ends_at)
  WHERE deleted_at IS NULL;

-- ─── 6. updated_at triggers ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_client_portal_preferences_updated_at ON client_portal_preferences;
CREATE TRIGGER trg_client_portal_preferences_updated_at
  BEFORE UPDATE ON client_portal_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_client_portal_announcements_updated_at ON client_portal_announcements;
CREATE TRIGGER trg_client_portal_announcements_updated_at
  BEFORE UPDATE ON client_portal_announcements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 7. Helper functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_client_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT client_id FROM profiles
  WHERE id = get_my_profile_id()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION client_can_view_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
      AND p.deleted_at IS NULL
      AND p.organization_id = get_my_org_id()
      AND get_my_client_id() IS NOT NULL
      AND p.client_id = get_my_client_id()
  );
$$;

CREATE OR REPLACE FUNCTION client_can_view_document(p_document_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM documents d
    JOIN document_shares ds ON ds.document_id = d.id
    WHERE d.id = p_document_id
      AND d.organization_id = get_my_org_id()
      AND d.status = 'approved'
      AND d.deleted_at IS NULL
      AND ds.shared_with_profile_id = get_my_profile_id()
      AND ds.deleted_at IS NULL
      AND (ds.expires_at IS NULL OR ds.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION client_can_view_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM invoices i
    JOIN projects p ON p.id = i.project_id
    WHERE i.id = p_invoice_id
      AND i.organization_id = get_my_org_id()
      AND i.deleted_at IS NULL
      AND i.status IN ('sent', 'paid', 'overdue')
      AND get_my_client_id() IS NOT NULL
      AND p.client_id = get_my_client_id()
  );
$$;

-- ─── 8. RLS tightening ───────────────────────────────────────────────────────

-- Projects: allow clients to see their linked projects
DROP POLICY IF EXISTS "projects: client can view linked" ON projects;
CREATE POLICY "projects: client can view linked"
  ON projects FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() = 'client'
    AND get_my_client_id() IS NOT NULL
    AND client_id = get_my_client_id()
  );

-- RFI: scoped to client_visible + project client match
DROP POLICY IF EXISTS "rfi: client can view" ON rfi;
CREATE POLICY "rfi: client can view"
  ON rfi FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND client_visible = true
    AND status NOT IN ('archived', 'voided')
    AND deleted_at IS NULL
    AND client_can_view_project(project_id)
  );

-- Submittals: approved + client_visible + project client match
DROP POLICY IF EXISTS "submittals: client can view approved" ON submittals;
CREATE POLICY "submittals: client can view approved"
  ON submittals FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND client_visible = true
    AND status IN ('approved', 'approved_as_noted')
    AND deleted_at IS NULL
    AND client_can_view_project(project_id)
  );

-- Submittal reviews: internal only
DROP POLICY IF EXISTS "submittal_reviews: member can view" ON submittal_reviews;
DROP POLICY IF EXISTS "submittal_reviews: members can view" ON submittal_reviews;
CREATE POLICY "submittal_reviews: internal members can view"
  ON submittal_reviews FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() != 'client'
  );

-- Invoices: split client vs internal
DROP POLICY IF EXISTS "invoices: org members read" ON invoices;
CREATE POLICY "invoices: internal members read"
  ON invoices FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() != 'client'
  );

DROP POLICY IF EXISTS "invoices: client can view" ON invoices;
CREATE POLICY "invoices: client can view"
  ON invoices FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() = 'client'
    AND status IN ('sent', 'paid', 'overdue')
    AND client_can_view_project(project_id)
  );

-- Invoice items: follow invoice access
DROP POLICY IF EXISTS "invoice_items: org members read" ON invoice_items;
CREATE POLICY "invoice_items: internal members read"
  ON invoice_items FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() != 'client'
  );

DROP POLICY IF EXISTS "invoice_items: client can view" ON invoice_items;
CREATE POLICY "invoice_items: client can view"
  ON invoice_items FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
        AND client_can_view_invoice(i.id)
    )
  );

-- Payments: split client vs internal
DROP POLICY IF EXISTS "payments: org members read" ON payments;
CREATE POLICY "payments: internal members read"
  ON payments FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() != 'client'
  );

DROP POLICY IF EXISTS "payments: client can view" ON payments;
CREATE POLICY "payments: client can view"
  ON payments FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
        AND client_can_view_invoice(i.id)
    )
  );

-- NCR: exclude clients entirely
DROP POLICY IF EXISTS "ncr: member can view org ncrs" ON ncr;
CREATE POLICY "ncr: internal members can view"
  ON ncr FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() != 'client'
  );

DROP POLICY IF EXISTS "ncr_actions: member can view" ON ncr_actions;
CREATE POLICY "ncr_actions: internal members can view"
  ON ncr_actions FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() != 'client'
  );

-- ─── 9. RLS: new Phase 15D tables ───────────────────────────────────────────

-- client_portal_preferences
CREATE POLICY "cpp: own row read"
  ON client_portal_preferences FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "cpp: own row insert"
  ON client_portal_preferences FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "cpp: own row update"
  ON client_portal_preferences FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "cpp: admin read org"
  ON client_portal_preferences FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'admin'
  );

-- client_download_logs
CREATE POLICY "cdl: insert own"
  ON client_download_logs FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "cdl: read own"
  ON client_download_logs FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "cdl: admin/pm read org"
  ON client_download_logs FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin', 'project_manager')
  );

-- client_portal_announcements
CREATE POLICY "cpa: client read active"
  ON client_portal_announcements FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at >= now())
  );

CREATE POLICY "cpa: admin/pm manage"
  ON client_portal_announcements FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin', 'project_manager')
  );

-- ✅ END 015 phase15d_client_portal

-- =====================================================
-- 016 phase5b_bootstrap_first_user
-- Source: migration-phase5b-bootstrap-first-user.sql
-- =====================================================

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

-- ✅ END 016 phase5b_bootstrap_first_user

-- ✅ PRODUCTION BOOTSTRAP COMPLETE
