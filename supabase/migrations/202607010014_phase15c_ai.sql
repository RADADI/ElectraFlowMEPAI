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
