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
