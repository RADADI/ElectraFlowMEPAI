-- ElectraFlow AI — Bootstrap chunk (run in numeric order on EMPTY database only)
-- See supabase/manual/RESET_AND_RUN_INSTRUCTIONS.md


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

-- ✅ PRODUCTION BOOTSTRAP COMPLETE
