-- ElectraFlow AI — Bootstrap chunk (run in numeric order on EMPTY database only)
-- See supabase/manual/RESET_AND_RUN_INSTRUCTIONS.md


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

-- ✅ PRODUCTION BOOTSTRAP COMPLETE
