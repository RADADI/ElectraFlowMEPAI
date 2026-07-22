-- =====================================================
-- ElectraFlow AI — Manual SQL Editor run order
-- =====================================================
-- Run these files in order on a FRESH Supabase project only.
-- Do NOT run seed.sql. Stop on first error.
--
--   1. manual_run_001_004.sql
--   2. manual_run_005_phase7_enum_only.sql
--   3. manual_run_005_phase7_rest.sql
--   4. manual_run_006_phase8_enum_only.sql
--   5. manual_run_006_phase8_rest.sql
--   6. manual_run_007_015.sql
--
-- After all chunks succeed, apply separately:
--   • manual/storage_buckets_and_policies.sql
--   • manual/realtime_publication.sql
--   • Clerk JWT setup (see docs/phase-5-clerk-supabase-setup.md)
-- =====================================================

-- >>> RUN STEP 1 of 6: 001–004 schema through phase6_documents_invites
-- Source: 202607010001_schema.sql + 002 + 003 + 004
-- Next: manual_run_005_phase7_enum_only.sql
-- =====================================================

-- =====================================================
-- Migration 001: 202607010001_schema.sql
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
  'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected'
);

create type review_action as enum (
  'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected', 'for_record_only'
);

create type rfi_status as enum (
  'open', 'under_review', 'answered', 'closed', 'cancelled'
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

-- =====================================================
-- Migration 002: 202607010002_rls_policies.sql
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

-- =====================================================
-- Migration 003: 202607010003_phase5_clerk_jwt.sql
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

-- =====================================================
-- Migration 004: 202607010004_phase6_documents_invites.sql
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
