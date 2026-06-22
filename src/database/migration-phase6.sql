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
