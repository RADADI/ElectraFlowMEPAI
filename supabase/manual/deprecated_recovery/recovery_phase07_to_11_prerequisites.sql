-- ===========================================================================
-- ElectraFlow AI — Recovery: Phase 07–11 prerequisites (after chunk 6 rollback)
-- ===========================================================================
-- Run when Phase 15D fails with: relation "invoices" does not exist
-- (or other missing tables from phases 10–14).
--
-- Cause: manual_run_007_015.sql likely rolled back migrations 007–011 when
-- Phase 15A failed, because those sections ran in the same SQL Editor batch.
--
-- Safe on a database where chunks 001–006 + 15A/15B recoveries succeeded.
-- Uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS throughout.
-- No seed data. Does not drop unrelated tables.
--
-- AFTER this succeeds, run:
--   supabase/manual/recovery_phase15d_client_portal_after_partial_failure.sql
-- ===========================================================================


-- =====================================================
-- Migration 007: 202607010007_phase10_resources.sql
-- =====================================================


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

-- =====================================================
-- Migration 008: 202607010008_phase11_timesheets_leave.sql
-- =====================================================


-- ===========================================================================
-- ElectraFlow AI — Phase 11 Migration: Timesheets & Leave Management
-- ===========================================================================
-- Prerequisites: schema.sql + all previous migrations (phase5 – phase10)
-- Run in Supabase SQL Editor (top to bottom, each statement separately if needed).
-- ===========================================================================

-- ─── Helper function: get_my_profile_id() ────────────────────────────────────
-- Returns the profiles.id for the authenticated Clerk user.
-- Used in RLS policies to scope employee/timesheet access.

CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM profiles
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

-- ─── 1. holidays ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holidays (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  holiday_date    date        NOT NULL,
  recurring       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  deleted_at      timestamptz,
  CONSTRAINT uq_holiday_org_date UNIQUE (organization_id, holiday_date)
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- ─── 2. timesheets ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timesheets (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id       uuid        NOT NULL REFERENCES employees(id),
  week_start_date   date        NOT NULL,   -- always Monday (ISO week)
  week_end_date     date        NOT NULL,   -- always Sunday
  status            text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','archived')),
  total_hours       numeric(6,2) NOT NULL DEFAULT 0,
  regular_hours     numeric(6,2) NOT NULL DEFAULT 0,
  overtime_hours    numeric(6,2) NOT NULL DEFAULT 0,
  submitted_at      timestamptz,
  approved_by       uuid REFERENCES profiles(id),
  approved_at       timestamptz,
  rejected_by       uuid REFERENCES profiles(id),
  rejected_at       timestamptz,
  rejection_reason  text,
  unlock_reason     text,
  revision_number   integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id),
  updated_by        uuid REFERENCES profiles(id),
  deleted_at        timestamptz,
  CONSTRAINT uq_timesheet_emp_week UNIQUE (employee_id, week_start_date)
);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

-- ─── 3. timesheet_entries ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  timesheet_id    uuid        NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  project_id      uuid        NOT NULL REFERENCES projects(id),
  entry_date      date        NOT NULL,
  hours           numeric(4,2) NOT NULL
    CHECK (hours > 0 AND hours <= 24),
  work_type       text        NOT NULL DEFAULT 'regular'
    CHECK (work_type IN ('regular','overtime','travel','training','admin')),
  description     text,
  billable        boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- ─── 4. leave_requests ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leave_requests (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id      uuid        NOT NULL REFERENCES employees(id),
  leave_type       text        NOT NULL
    CHECK (leave_type IN ('pto','sick','unpaid','holiday','bereavement','other')),
  start_date       date        NOT NULL,
  end_date         date        NOT NULL,
  total_days       numeric(5,2) NOT NULL DEFAULT 0,
  reason           text,
  status           text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by      uuid REFERENCES profiles(id),
  approved_at      timestamptz,
  rejected_by      uuid REFERENCES profiles(id),
  rejected_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES profiles(id),
  deleted_at       timestamptz,
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- ─── 5. Updated triggers ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_holidays_updated_at ON holidays;
CREATE TRIGGER trg_holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_timesheets_updated_at ON timesheets;
CREATE TRIGGER trg_timesheets_updated_at
  BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ts_entries_updated_at ON timesheet_entries;
CREATE TRIGGER trg_ts_entries_updated_at
  BEFORE UPDATE ON timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_leave_updated_at ON leave_requests;
CREATE TRIGGER trg_leave_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 6. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_timesheets_emp_week
  ON timesheets(employee_id, week_start_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_timesheets_org_status
  ON timesheets(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ts_entries_timesheet
  ON timesheet_entries(timesheet_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ts_entries_project_date
  ON timesheet_entries(project_id, entry_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_emp_dates
  ON leave_requests(employee_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_org_status
  ON leave_requests(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_holidays_org_date
  ON holidays(organization_id, holiday_date)
  WHERE deleted_at IS NULL;

-- ─── 7. RLS: holidays ────────────────────────────────────────────────────────

CREATE POLICY "holidays: org members can view"
  ON holidays FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "holidays: hr/admin can manage"
  ON holidays FOR ALL
  USING (organization_id = get_my_org_id() AND get_my_role() IN ('admin','hr'));

-- ─── 8. RLS: timesheets ──────────────────────────────────────────────────────

-- Employee views own timesheets
CREATE POLICY "timesheets: self view"
  ON timesheets FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

-- PM views team timesheets (employees allocated to PM's projects)
CREATE POLICY "timesheets: pm view team"
  ON timesheets FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'project_manager'
    AND employee_id IN (
      SELECT DISTINCT ra.employee_id
      FROM resource_allocations ra
      JOIN projects p ON p.id = ra.project_id
      WHERE p.created_by = get_my_profile_id()
        AND ra.organization_id = get_my_org_id()
        AND ra.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- HR / Admin / Executive view all
CREATE POLICY "timesheets: management view"
  ON timesheets FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','executive')
    AND deleted_at IS NULL
  );

-- Employee can create own timesheet
CREATE POLICY "timesheets: employee insert"
  ON timesheets FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
  );

-- Employee can update own draft; PM/HR/Admin can update status transitions
CREATE POLICY "timesheets: update"
  ON timesheets FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (
      (
        employee_id IN (
          SELECT id FROM employees
          WHERE profile_id = get_my_profile_id()
            AND organization_id = get_my_org_id()
        )
        AND status IN ('draft','rejected')
      )
      OR get_my_role() IN ('admin','hr','project_manager')
    )
  );

-- ─── 9. RLS: timesheet_entries ───────────────────────────────────────────────

-- Entries inherit access from parent timesheet via organization_id + timesheet_id
CREATE POLICY "ts_entries: self view"
  ON timesheet_entries FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT id FROM employees
        WHERE profile_id = get_my_profile_id()
          AND organization_id = get_my_org_id()
      )
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "ts_entries: pm view team"
  ON timesheet_entries FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'project_manager'
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT DISTINCT ra.employee_id
        FROM resource_allocations ra
        JOIN projects p ON p.id = ra.project_id
        WHERE p.created_by = get_my_profile_id()
          AND ra.organization_id = get_my_org_id()
          AND ra.deleted_at IS NULL
      )
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "ts_entries: management view"
  ON timesheet_entries FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "ts_entries: employee insert"
  ON timesheet_entries FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT id FROM employees
        WHERE profile_id = get_my_profile_id()
          AND organization_id = get_my_org_id()
      )
      AND status IN ('draft','rejected')
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "ts_entries: employee update/delete"
  ON timesheet_entries FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND timesheet_id IN (
      SELECT id FROM timesheets
      WHERE employee_id IN (
        SELECT id FROM employees
        WHERE profile_id = get_my_profile_id()
          AND organization_id = get_my_org_id()
      )
      AND status IN ('draft','rejected')
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "ts_entries: hr/admin can manage"
  ON timesheet_entries FOR ALL
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr')
  );

-- ─── 10. RLS: leave_requests ─────────────────────────────────────────────────

CREATE POLICY "leave: self view"
  ON leave_requests FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "leave: pm view team"
  ON leave_requests FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() = 'project_manager'
    AND employee_id IN (
      SELECT DISTINCT ra.employee_id
      FROM resource_allocations ra
      JOIN projects p ON p.id = ra.project_id
      WHERE p.created_by = get_my_profile_id()
        AND ra.organization_id = get_my_org_id()
        AND ra.deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "leave: management view"
  ON leave_requests FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','hr','executive')
    AND deleted_at IS NULL
  );

CREATE POLICY "leave: employee insert"
  ON leave_requests FOR INSERT
  WITH CHECK (
    organization_id = get_my_org_id()
    AND employee_id IN (
      SELECT id FROM employees
      WHERE profile_id = get_my_profile_id()
        AND organization_id = get_my_org_id()
    )
  );

-- Employee can cancel own pending; HR/Admin/PM can update status
CREATE POLICY "leave: update"
  ON leave_requests FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (
      (
        employee_id IN (
          SELECT id FROM employees
          WHERE profile_id = get_my_profile_id()
            AND organization_id = get_my_org_id()
        )
        AND status = 'pending'
      )
      OR get_my_role() IN ('admin','hr','project_manager')
    )
  );

-- ─── Verification ─────────────────────────────────────────────────────────────
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT policyname FROM pg_policies WHERE tablename IN
--   ('holidays','timesheets','timesheet_entries','leave_requests');

-- =====================================================
-- Migration 009: 202607010009_phase12_financials.sql
-- =====================================================


-- ===========================================================================
-- ElectraFlow AI — Phase 12 Migration: Financials & Cost Management
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase11
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── 1. project_budgets ──────────────────────────────────────────────────────
-- One row per project.  Stores the baseline budget + accumulated approved
-- change-order amounts.  Contingency is kept as a percentage so PMs can
-- adjust the buffer without touching the raw budget figure.

CREATE TABLE IF NOT EXISTS project_budgets (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          uuid          NOT NULL UNIQUE REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id     uuid          NOT NULL       REFERENCES organizations(id)  ON DELETE CASCADE,
  total_budget        numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_budget >= 0),
  approved_changes    numeric(15,2) NOT NULL DEFAULT 0,  -- running sum of approved CO amounts
  contingency_percent numeric(5,2)  NOT NULL DEFAULT 10
    CHECK (contingency_percent >= 0 AND contingency_percent <= 100),
  notes               text,
  created_by          uuid          REFERENCES profiles(id),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;

-- ─── 2. expenses ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category         text          NOT NULL DEFAULT 'other'
    CHECK (category IN ('labor','material','equipment','subcontractor','software','travel','other')),
  description      text          NOT NULL,
  amount           numeric(15,2) NOT NULL CHECK (amount >= 0),
  expense_date     date          NOT NULL,
  vendor           text,
  reference_number text,
  billable         boolean       NOT NULL DEFAULT true,
  status           text          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  approved_by      uuid          REFERENCES profiles(id),
  approved_at      timestamptz,
  rejection_reason text,
  created_by       uuid          REFERENCES profiles(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ─── 3. change_orders ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS change_orders (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  co_number        text          NOT NULL,
  title            text          NOT NULL,
  description      text,
  amount           numeric(15,2) NOT NULL,  -- negative = credit change order
  status           text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','voided')),
  submitted_by     uuid          REFERENCES profiles(id),
  submitted_at     timestamptz,
  reviewed_by      uuid          REFERENCES profiles(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  void_reason      text,
  revision_number  integer       NOT NULL DEFAULT 1,
  created_by       uuid          REFERENCES profiles(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT uq_co_project_number UNIQUE (project_id, co_number)
);

ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;

-- ─── 4. invoices ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number  text          NOT NULL,
  title           text          NOT NULL,
  client_name     text,
  status          text          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','voided')),
  issue_date      date          NOT NULL,
  due_date        date          NOT NULL,
  subtotal        numeric(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate        numeric(5,2)  NOT NULL DEFAULT 0
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount      numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount    numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount     numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  notes           text,
  created_by      uuid          REFERENCES profiles(id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT uq_invoice_org_number UNIQUE (organization_id, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ─── 5. invoice_items ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_items (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      uuid          NOT NULL REFERENCES invoices(id)      ON DELETE CASCADE,
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description     text          NOT NULL,
  quantity        numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  amount          numeric(15,2) NOT NULL CHECK (amount >= 0),
  sort_order      integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- ─── 6. payments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id       uuid          NOT NULL REFERENCES invoices(id)      ON DELETE CASCADE,
  project_id       uuid          NOT NULL REFERENCES projects(id)      ON DELETE CASCADE,
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount           numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_date     date          NOT NULL,
  method           text          NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer','check','cash','credit_card','other')),
  reference_number text,
  notes            text,
  created_by       uuid          REFERENCES profiles(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ─── Triggers: keep updated_at fresh ─────────────────────────────────────────
-- The set_updated_at() function is created by earlier migrations.
-- These triggers are idempotent (OR REPLACE not available on triggers, so
-- drop-if-exists first).

DROP TRIGGER IF EXISTS trg_project_budgets_updated_at ON project_budgets;
CREATE TRIGGER trg_project_budgets_updated_at
  BEFORE UPDATE ON project_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_change_orders_updated_at ON change_orders;
CREATE TRIGGER trg_change_orders_updated_at
  BEFORE UPDATE ON change_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_invoice_items_updated_at ON invoice_items;
CREATE TRIGGER trg_invoice_items_updated_at
  BEFORE UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- project_budgets
CREATE POLICY "budgets: org members read"
  ON project_budgets FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "budgets: admin/pm insert"
  ON project_budgets FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

CREATE POLICY "budgets: admin/pm update"
  ON project_budgets FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- expenses
CREATE POLICY "expenses: org members read"
  ON expenses FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "expenses: admin/pm insert"
  ON expenses FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','executive'));

CREATE POLICY "expenses: admin/pm update"
  ON expenses FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

CREATE POLICY "expenses: admin delete (soft)"
  ON expenses FOR DELETE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- change_orders
CREATE POLICY "change_orders: org members read"
  ON change_orders FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "change_orders: admin/pm insert"
  ON change_orders FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

CREATE POLICY "change_orders: admin/pm update"
  ON change_orders FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- invoices
CREATE POLICY "invoices: org members read"
  ON invoices FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "invoices: admin/pm insert"
  ON invoices FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

CREATE POLICY "invoices: admin/pm update"
  ON invoices FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- invoice_items
CREATE POLICY "invoice_items: org members read"
  ON invoice_items FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "invoice_items: admin/pm manage"
  ON invoice_items FOR ALL
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- payments
CREATE POLICY "payments: org members read"
  ON payments FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "payments: admin/pm insert"
  ON payments FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- ─── Performance indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id   ON project_budgets  (project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_org_id       ON project_budgets  (organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id          ON expenses         (project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_status          ON expenses         (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_change_orders_project_id     ON change_orders    (project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_org_status     ON change_orders    (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id          ON invoices         (project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status          ON invoices         (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id     ON invoice_items    (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id          ON payments         (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_project_id          ON payments         (project_id);

-- =====================================================
-- Migration 010: 202607010010_phase13_notifications_activity.sql
-- =====================================================


-- ===========================================================================
-- ElectraFlow AI — Phase 13 Migration: Notifications, Activity & Realtime
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase12
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── Ensure get_my_profile_id() exists (defined in phase11) ──────────────────
-- Re-declare defensively in case migrations are run out of order.
CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM profiles
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
  LIMIT 1;
$$;

-- ─── 1. notifications ─────────────────────────────────────────────────────────
-- One row per (recipient, event). Soft-deleted, snoozeable, pinnable.

CREATE TABLE IF NOT EXISTS notifications (
  id                   uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_profile_id uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_profile_id     uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  event_type           text          NOT NULL,
  title                text          NOT NULL,
  message              text,
  entity_type          text,
  entity_id            text,
  route                text,         -- stored at creation time; may become stale if entity deleted
  priority             text          NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  category             text          NOT NULL DEFAULT 'system'
    CHECK (category IN (
      'project','document','submittal','rfi','ncr','resource',
      'timesheet','financial','user','system','client','ai',
      'report','meeting','electrical','billing'
    )),
  severity             text          NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','success','warning','error')),
  is_pinned            boolean       NOT NULL DEFAULT false,
  read_at              timestamptz,
  dismissed_at         timestamptz,
  snoozed_until        timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ─── 2. notification_preferences ─────────────────────────────────────────────
-- Sparse model: absence of row implies default (enabled, immediate).

CREATE TABLE IF NOT EXISTS notification_preferences (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel         text          NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app','email','future_webhook')),
  event_type      text          NOT NULL,
  enabled         boolean       NOT NULL DEFAULT true,
  frequency       text          NOT NULL DEFAULT 'immediate'
    CHECK (frequency IN ('immediate','daily_digest','weekly_digest','disabled')),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_pref_profile_channel_event UNIQUE (profile_id, channel, event_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ─── 3. activity_events ───────────────────────────────────────────────────────
-- Immutable audit/activity log. Visibility controls client access.

CREATE TABLE IF NOT EXISTS activity_events (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  event_type       text          NOT NULL,
  entity_type      text,
  entity_id        text,
  entity_label     text,         -- snapshot of entity name/number at event time
  message          text          NOT NULL,
  metadata         jsonb         NOT NULL DEFAULT '{}',
  category         text          NOT NULL DEFAULT 'system'
    CHECK (category IN (
      'project','document','submittal','rfi','ncr','resource',
      'timesheet','financial','user','system','client','ai',
      'report','meeting','electrical','billing'
    )),
  visibility       text          NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal','client_visible','private')),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- ─── 4. notification_deliveries ──────────────────────────────────────────────
-- Tracks per-channel delivery state. Admin-only reads.

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_id uuid          NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         text          NOT NULL
    CHECK (channel IN ('in_app','email','future_webhook')),
  status          text          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  attempted_at    timestamptz,
  delivered_at    timestamptz,
  error_message   text
);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- ─── Triggers: updated_at ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Performance indexes ──────────────────────────────────────────────────────

-- notifications: unread count (most frequent query)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_profile_id, read_at)
  WHERE deleted_at IS NULL AND dismissed_at IS NULL;

-- notifications: cursor-paginated list (pinned first, then latest)
CREATE INDEX IF NOT EXISTS idx_notifications_cursor
  ON notifications (recipient_profile_id, is_pinned DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- notifications: snoozed filter
CREATE INDEX IF NOT EXISTS idx_notifications_snoozed
  ON notifications (recipient_profile_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL AND deleted_at IS NULL;

-- notifications: org-wide (admin view)
CREATE INDEX IF NOT EXISTS idx_notifications_org
  ON notifications (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- notifications: full-text search on message
CREATE INDEX IF NOT EXISTS idx_notifications_message_fts
  ON notifications USING gin (to_tsvector('english', coalesce(message, '')));

-- notification_preferences
CREATE INDEX IF NOT EXISTS idx_notif_prefs_profile
  ON notification_preferences (profile_id, channel);

-- activity_events: chronological org feed
CREATE INDEX IF NOT EXISTS idx_activity_org_chrono
  ON activity_events (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: per-entity history
CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity_events (organization_id, entity_type, entity_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: visibility filter (client feed)
CREATE INDEX IF NOT EXISTS idx_activity_visibility
  ON activity_events (organization_id, visibility, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: category filter
CREATE INDEX IF NOT EXISTS idx_activity_category
  ON activity_events (organization_id, category, created_at DESC)
  WHERE deleted_at IS NULL;

-- activity_events: full-text search on message
CREATE INDEX IF NOT EXISTS idx_activity_message_fts
  ON activity_events USING gin (to_tsvector('english', message));

-- activity_events: GIN index on metadata jsonb
CREATE INDEX IF NOT EXISTS idx_activity_metadata_gin
  ON activity_events USING gin (metadata);

-- notification_deliveries
CREATE INDEX IF NOT EXISTS idx_deliveries_notification
  ON notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_org_status
  ON notification_deliveries (organization_id, status);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- notifications: recipient reads their own
CREATE POLICY "notif: recipient select"
  ON notifications FOR SELECT
  USING (
    recipient_profile_id = get_my_profile_id()
    AND organization_id = get_my_org_id()
    AND deleted_at IS NULL
  );

-- notifications: org members can insert (fan-out creates notifs for others)
CREATE POLICY "notif: org member insert"
  ON notifications FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- notifications: recipient can update own (mark read, dismiss, snooze, pin)
CREATE POLICY "notif: recipient update"
  ON notifications FOR UPDATE
  USING (
    recipient_profile_id = get_my_profile_id()
    AND organization_id = get_my_org_id()
  );

-- notification_preferences: own profile only
CREATE POLICY "notif_prefs: select own"
  ON notification_preferences FOR SELECT
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "notif_prefs: insert own"
  ON notification_preferences FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "notif_prefs: update own"
  ON notification_preferences FOR UPDATE
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

-- activity_events: internal users see internal + client_visible
CREATE POLICY "activity: internal users"
  ON activity_events FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND visibility IN ('internal', 'client_visible')
    AND get_my_role() NOT IN ('client')
  );

-- activity_events: client sees only client_visible
CREATE POLICY "activity: client users"
  ON activity_events FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND visibility = 'client_visible'
    AND get_my_role() = 'client'
  );

-- activity_events: private events visible only to actor
CREATE POLICY "activity: private actor only"
  ON activity_events FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND visibility = 'private'
    AND actor_profile_id = get_my_profile_id()
  );

-- activity_events: org members can insert
CREATE POLICY "activity: org member insert"
  ON activity_events FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- activity_events: admin can soft-delete
CREATE POLICY "activity: admin soft delete"
  ON activity_events FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- notification_deliveries: admin can read all
CREATE POLICY "deliveries: admin read"
  ON notification_deliveries FOR SELECT
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- notification_deliveries: org members can insert
CREATE POLICY "deliveries: org member insert"
  ON notification_deliveries FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

-- ─── Supabase Realtime: enable for live updates ───────────────────────────────
-- Only notifications and activity_events need realtime.
-- Run this AFTER enabling realtime in the Supabase Dashboard:
--   Database → Replication → Supabase Realtime → Add table

-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;

-- (Commented out because ALTER PUBLICATION requires superuser on some Supabase tiers.
--  Enable via Dashboard: Database → Replication → Tables → Add both tables.)

-- =====================================================
-- Migration 011: 202607010011_phase14_analytics_reports.sql
-- =====================================================


-- ===========================================================================
-- ElectraFlow AI — Phase 14 Migration: Analytics, Reports & Enterprise Intelligence
-- ===========================================================================
-- Prerequisites: schema.sql + migrations phase5 – phase13
-- Run in Supabase SQL Editor, top to bottom.
-- ===========================================================================

-- ─── 1. saved_reports ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_reports (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       uuid          NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  name             text          NOT NULL,
  description      text,
  report_type      text          NOT NULL,
  report_category  text          NOT NULL DEFAULT 'operational',
  entity_type      text,
  filters          jsonb         NOT NULL DEFAULT '{}',
  columns          jsonb         NOT NULL DEFAULT '[]',
  sort             jsonb         NOT NULL DEFAULT '{}',
  schedule         jsonb,
  visibility       text          NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','org_shared','executive_shared','admin_only')),
  version_number   integer       NOT NULL DEFAULT 1,
  parent_report_id uuid          REFERENCES saved_reports(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT chk_report_type CHECK (report_type IN (
    'projects','documents','submittals','rfi','ncr','resources','timesheets',
    'leave','financials','notifications','activity','audit',
    'meetings','electrical','ai','client_portal','saas_billing','super_admin','system_health'
  )),
  CONSTRAINT chk_report_category CHECK (report_category IN (
    'operational','financial','workforce','compliance','executive','system','future'
  ))
);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- ─── 2. report_runs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_runs (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  saved_report_id  uuid          REFERENCES saved_reports(id) ON DELETE SET NULL,
  requested_by     uuid          NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  report_type      text          NOT NULL,
  format           text          NOT NULL DEFAULT 'csv'
    CHECK (format IN ('csv','xlsx','pdf','json')),
  status           text          NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  file_path        text,
  row_count        integer       NOT NULL DEFAULT 0,
  started_at       timestamptz,
  completed_at     timestamptz,
  error_message    text,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

-- ─── 3. dashboard_preferences ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dashboard_type   text          NOT NULL DEFAULT 'executive'
    CHECK (dashboard_type IN ('executive','pm','hr','personal')),
  layout           jsonb         NOT NULL DEFAULT '[]',
  favorite_widgets jsonb         NOT NULL DEFAULT '[]',
  hidden_widgets   jsonb         NOT NULL DEFAULT '[]',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_dashboard_pref UNIQUE (profile_id, dashboard_type)
);

ALTER TABLE dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- ─── 4. system_metrics ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_metrics (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_name      text          NOT NULL,
  metric_category  text          NOT NULL DEFAULT 'system'
    CHECK (metric_category IN (
      'projects','documents','submittals','rfi','ncr','resources',
      'timesheets','financials','notifications','system','ai',
      'saas','electrical','meetings','client_portal'
    )),
  metric_value     numeric       NOT NULL DEFAULT 0,
  metadata         jsonb         NOT NULL DEFAULT '{}',
  captured_at      timestamptz   NOT NULL DEFAULT now(),
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- ─── 5. analytics_snapshots ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_type    text          NOT NULL DEFAULT 'daily'
    CHECK (snapshot_type IN ('daily','weekly','monthly')),
  period_start     date          NOT NULL,
  period_end       date          NOT NULL,
  data             jsonb         NOT NULL DEFAULT '{}',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_analytics_snapshot UNIQUE (organization_id, snapshot_type, period_start)
);

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- ─── 6. threshold_rules ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS threshold_rules (
  id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  metric_name      text          NOT NULL,
  metric_category  text          NOT NULL DEFAULT 'system',
  operator         text          NOT NULL DEFAULT 'gt'
    CHECK (operator IN ('gt','gte','lt','lte','eq')),
  threshold_value  numeric       NOT NULL,
  severity         text          NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info','warning','error','critical')),
  notify_roles     text[]        NOT NULL DEFAULT ARRAY['admin','executive'],
  is_active        boolean       NOT NULL DEFAULT true,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE threshold_rules ENABLE ROW LEVEL SECURITY;

-- ─── Triggers ──────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_saved_reports_updated_at ON saved_reports;
CREATE TRIGGER trg_saved_reports_updated_at
  BEFORE UPDATE ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_dashboard_preferences_updated_at ON dashboard_preferences;
CREATE TRIGGER trg_dashboard_preferences_updated_at
  BEFORE UPDATE ON dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_threshold_rules_updated_at ON threshold_rules;
CREATE TRIGGER trg_threshold_rules_updated_at
  BEFORE UPDATE ON threshold_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_saved_reports_org
  ON saved_reports (organization_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_reports_profile
  ON saved_reports (profile_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_saved_reports_type
  ON saved_reports (organization_id, report_type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_saved_reports_category
  ON saved_reports (organization_id, report_category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_runs_org
  ON report_runs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_runs_requester
  ON report_runs (requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_runs_status
  ON report_runs (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_profile
  ON dashboard_preferences (profile_id, dashboard_type);

CREATE INDEX IF NOT EXISTS idx_system_metrics_org
  ON system_metrics (organization_id, metric_name, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_metrics_category
  ON system_metrics (organization_id, metric_category, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_metrics_metadata_gin
  ON system_metrics USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_org
  ON analytics_snapshots (organization_id, snapshot_type, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_data_gin
  ON analytics_snapshots USING gin (data);

CREATE INDEX IF NOT EXISTS idx_threshold_rules_org
  ON threshold_rules (organization_id, is_active) WHERE deleted_at IS NULL;

-- ─── RLS: saved_reports ──────────────────────────────────────────────────────

CREATE POLICY "saved_reports: owner select"
  ON saved_reports FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND (
      profile_id = get_my_profile_id()
      OR visibility = 'org_shared'
      OR (visibility = 'executive_shared' AND get_my_role() IN ('admin','executive'))
      OR (visibility = 'admin_only' AND get_my_role() = 'admin')
    )
  );

CREATE POLICY "saved_reports: org member insert"
  ON saved_reports FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND profile_id = get_my_profile_id());

CREATE POLICY "saved_reports: owner or admin update"
  ON saved_reports FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (profile_id = get_my_profile_id() OR get_my_role() = 'admin')
  );

-- ─── RLS: report_runs ────────────────────────────────────────────────────────

CREATE POLICY "report_runs: requester select"
  ON report_runs FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND (
      requested_by = get_my_profile_id()
      OR get_my_role() = 'admin'
      OR (get_my_role() = 'executive')
    )
  );

CREATE POLICY "report_runs: org member insert"
  ON report_runs FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND requested_by = get_my_profile_id());

CREATE POLICY "report_runs: requester or admin update"
  ON report_runs FOR UPDATE
  USING (
    organization_id = get_my_org_id()
    AND (requested_by = get_my_profile_id() OR get_my_role() = 'admin')
  );

-- ─── RLS: dashboard_preferences ──────────────────────────────────────────────

CREATE POLICY "dashboard_prefs: own select"
  ON dashboard_preferences FOR SELECT
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "dashboard_prefs: own insert"
  ON dashboard_preferences FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "dashboard_prefs: own update"
  ON dashboard_preferences FOR UPDATE
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

CREATE POLICY "dashboard_prefs: own delete"
  ON dashboard_preferences FOR DELETE
  USING (profile_id = get_my_profile_id() AND organization_id = get_my_org_id());

-- ─── RLS: system_metrics ─────────────────────────────────────────────────────

CREATE POLICY "system_metrics: admin executive select"
  ON system_metrics FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','executive')
  );

CREATE POLICY "system_metrics: admin insert"
  ON system_metrics FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "system_metrics: admin update"
  ON system_metrics FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- ─── RLS: analytics_snapshots ─────────────────────────────────────────────────

CREATE POLICY "analytics_snapshots: org read"
  ON analytics_snapshots FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','executive','project_manager')
  );

CREATE POLICY "analytics_snapshots: admin insert"
  ON analytics_snapshots FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "analytics_snapshots: admin update"
  ON analytics_snapshots FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- ─── RLS: threshold_rules ────────────────────────────────────────────────────

CREATE POLICY "threshold_rules: admin executive select"
  ON threshold_rules FOR SELECT
  USING (
    organization_id = get_my_org_id()
    AND deleted_at IS NULL
    AND get_my_role() IN ('admin','executive')
  );

CREATE POLICY "threshold_rules: admin insert"
  ON threshold_rules FOR INSERT
  WITH CHECK (organization_id = get_my_org_id() AND get_my_role() = 'admin');

CREATE POLICY "threshold_rules: admin update"
  ON threshold_rules FOR UPDATE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- ─── RLS: audit_logs (strengthen Admin-only read if not already present) ─────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'audit_logs: admin select'
  ) THEN
    CREATE POLICY "audit_logs: admin select"
      ON audit_logs FOR SELECT
      USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');
  END IF;
END $$;

-- ✅ END recovery_phase07_to_11_prerequisites
