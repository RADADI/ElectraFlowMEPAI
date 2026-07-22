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
