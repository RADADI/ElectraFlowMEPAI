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
