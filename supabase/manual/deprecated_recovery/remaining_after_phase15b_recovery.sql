-- ===========================================================================
-- ElectraFlow AI — Remaining migrations after Phase 15B recovery
-- ===========================================================================
-- ⚠️  BEFORE RUNNING: verify Phase 12 financial tables exist.
--     Run inspect_database_state.sql first.
--     If invoices / project_budgets / payments are missing, run:
--       supabase/manual/recovery_phase12_financials_if_missing.sql
--     Phase 15D WILL FAIL without invoices (client_can_view_invoice).
--
-- Run AFTER:
--   • recovery_phase15b_electrical_after_partial_failure.sql
--   • recovery_phase12_financials_if_missing.sql (if inspection shows gaps)
--   • recovery_phase15a_meetings_after_partial_failure.sql (if meetings missing)
--
-- Contains Phase 15C (AI) and Phase 15D (Client Portal).
--
-- If Phase 15C already applied (chat_sessions exists) but 15D failed:
--   1. recovery_phase12_financials_if_missing.sql
--   2. recovery_phase15d_client_portal_after_partial_failure.sql
--   Do NOT re-run this full file.
--
-- See: supabase/manual/recovery_runbook_after_partial_migration.md
-- No seed data. Stop on first error.
-- ===========================================================================

-- =====================================================
-- Migration 014: 202607010014_phase15c_ai.sql
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

-- =====================================================
-- Migration 015: 202607010015_phase15d_client_portal.sql
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

-- ✅ END remaining_after_phase15b_recovery
