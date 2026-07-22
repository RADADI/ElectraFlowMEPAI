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

-- >>> RUN STEP 3 of 6: 005 phase7 — remainder (DDL, RLS, indexes)
-- Source: 202607010005_phase7_submittals.sql (lines 16–end)
-- Previous: manual_run_005_phase7_enum_only.sql
-- Next: manual_run_006_phase8_enum_only.sql
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
