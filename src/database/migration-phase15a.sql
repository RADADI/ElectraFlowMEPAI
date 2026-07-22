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
