-- ===========================================================================
-- ElectraFlow AI — Recovery: Phase 15D Client Portal (after partial failure)
-- ===========================================================================
-- Run when remaining_after_phase15b_recovery.sql failed at client_can_view_invoice
-- because invoices (Phase 12) was missing.
--
-- Prerequisites:
--   • recovery_phase07_to_11_prerequisites.sql completed (includes invoices)
--   • Phase 15C already applied (remaining file section 014 succeeded)
--
-- Safe to re-run: uses IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS.
-- No seed data. Does not drop unrelated tables.
-- ===========================================================================

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

-- ✅ END recovery_phase15d_client_portal_after_partial_failure
