-- ===========================================================================
-- ElectraFlow AI — Phase 10 Migration: Resource Management & Workforce
-- ===========================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5..9.sql
-- Run in Supabase SQL Editor.  All ALTER TYPE run as own statements.
-- ===========================================================================

-- ─── 1. employees — new columns ──────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS discipline                    text,
  ADD COLUMN IF NOT EXISTS employment_status            text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','terminated','contractor')),
  ADD COLUMN IF NOT EXISTS default_weekly_capacity_hours numeric(5,1) NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS billable_target_percent       integer DEFAULT 80
    CHECK (billable_target_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS location                     text,
  ADD COLUMN IF NOT EXISTS manager_id                   uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS start_date                   date,
  ADD COLUMN IF NOT EXISTS end_date                     date,
  ADD COLUMN IF NOT EXISTS updated_by                   uuid REFERENCES profiles(id);

-- ─── 2. Unique constraint on employee_number per org ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_employees_number_org'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT uq_employees_number_org
      UNIQUE (organization_id, employee_number);
  END IF;
END;
$$;

-- ─── 3. employee_skills — new columns ────────────────────────────────────────

ALTER TABLE employee_skills
  ADD COLUMN IF NOT EXISTS skill_category  text,
  ADD COLUMN IF NOT EXISTS last_used_date  date,
  ADD COLUMN IF NOT EXISTS notes           text;

-- ─── 4. employee_certifications — new table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_certifications (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id          uuid        NOT NULL REFERENCES employees(id)     ON DELETE CASCADE,
  certification_name   text        NOT NULL,
  issuing_body         text,
  certification_number text,
  issue_date           date,
  expiry_date          date,
  attachment_url       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES profiles(id),
  deleted_at           timestamptz
);

ALTER TABLE employee_certifications ENABLE ROW LEVEL SECURITY;

-- ─── 5. resource_allocations — new columns ────────────────────────────────────

ALTER TABLE resource_allocations
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','on_hold','ended')),
  ADD COLUMN IF NOT EXISTS weekly_hours numeric(5,1),
  ADD COLUMN IF NOT EXISTS updated_by   uuid REFERENCES profiles(id);

-- ─── 6. Updated RLS: employees ────────────────────────────────────────────────
-- Phase 3 only allowed admin/hr/executive to view. Phase 10 adds engineer
-- self-view and expands management view to include PM.

DROP POLICY IF EXISTS "employees: hr/admin/executive can view" ON employees;
DROP POLICY IF EXISTS "employees: hr/admin can manage"         ON employees;
DROP POLICY IF EXISTS "employees: management view"             ON employees;
DROP POLICY IF EXISTS "employees: engineer self view"          ON employees;

CREATE POLICY "employees: management view"
  ON employees FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

-- Engineers can see all employees (read-only) for team awareness
CREATE POLICY "employees: engineering team view"
  ON employees FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "employees: hr/admin can insert"
  ON employees FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

CREATE POLICY "employees: hr/admin can update"
  ON employees FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 7. Updated RLS: employee_skills ─────────────────────────────────────────

DROP POLICY IF EXISTS "employee_skills: hr/admin can view"   ON employee_skills;
DROP POLICY IF EXISTS "employee_skills: hr/admin can manage" ON employee_skills;

CREATE POLICY "employee_skills: management view"
  ON employee_skills FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_skills: engineer own view"
  ON employee_skills FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_skills: hr/admin can manage"
  ON employee_skills FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 8. RLS: employee_certifications ─────────────────────────────────────────

CREATE POLICY "employee_certs: management view"
  ON employee_certifications FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_certs: engineer own view"
  ON employee_certifications FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "employee_certs: hr/admin can manage"
  ON employee_certifications FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 9. Updated RLS: resource_allocations ────────────────────────────────────

DROP POLICY IF EXISTS "resource_allocations: pm/hr/admin can view"   ON resource_allocations;
DROP POLICY IF EXISTS "resource_allocations: pm/hr/admin can manage" ON resource_allocations;

CREATE POLICY "resource_allocations: management view"
  ON resource_allocations FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "resource_allocations: engineer own view"
  ON resource_allocations FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN (
      'senior_electrical_engineer','electrical_engineer','qa_qc_engineer'
    )
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "resource_allocations: pm/hr/admin can insert"
  ON resource_allocations FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager')
  );

CREATE POLICY "resource_allocations: pm/hr/admin can update"
  ON resource_allocations FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','project_manager')
  );

-- ─── 10. Triggers ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_employee_certifications_updated_at ON employee_certifications;
CREATE TRIGGER trg_employee_certifications_updated_at
  BEFORE UPDATE ON employee_certifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 11. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_certs_employee
  ON employee_certifications(employee_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certs_expiry
  ON employee_certifications(expiry_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_employee_dates
  ON resource_allocations(employee_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_project
  ON resource_allocations(project_id) WHERE deleted_at IS NULL;

-- ─── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'employees' ORDER BY ordinal_position;
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
