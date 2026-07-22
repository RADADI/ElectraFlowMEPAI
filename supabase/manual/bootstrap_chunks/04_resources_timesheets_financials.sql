-- ElectraFlow AI — Bootstrap chunk (run in numeric order on EMPTY database only)
-- See supabase/manual/RESET_AND_RUN_INSTRUCTIONS.md


-- =====================================================
-- 007 phase10_resources
-- Source: migration-phase10.sql
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

-- ✅ END 007 phase10_resources

-- =====================================================
-- 008 phase11_timesheets
-- Source: migration-phase11.sql
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

-- ✅ END 008 phase11_timesheets

-- =====================================================
-- 009 phase12_financials
-- Source: migration-phase12.sql
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
DROP POLICY IF EXISTS "budgets: org members read" ON project_budgets;
CREATE POLICY "budgets: org members read"
  ON project_budgets FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "budgets: admin/pm insert" ON project_budgets;
CREATE POLICY "budgets: admin/pm insert"
  ON project_budgets FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "budgets: admin/pm update" ON project_budgets;
CREATE POLICY "budgets: admin/pm update"
  ON project_budgets FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- expenses
DROP POLICY IF EXISTS "expenses: org members read" ON expenses;
CREATE POLICY "expenses: org members read"
  ON expenses FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "expenses: admin/pm insert" ON expenses;
CREATE POLICY "expenses: admin/pm insert"
  ON expenses FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager','executive'));

DROP POLICY IF EXISTS "expenses: admin/pm update" ON expenses;
CREATE POLICY "expenses: admin/pm update"
  ON expenses FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "expenses: admin delete (soft)" ON expenses;
CREATE POLICY "expenses: admin delete (soft)"
  ON expenses FOR DELETE
  USING (organization_id = get_my_org_id() AND get_my_role() = 'admin');

-- change_orders
DROP POLICY IF EXISTS "change_orders: org members read" ON change_orders;
CREATE POLICY "change_orders: org members read"
  ON change_orders FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "change_orders: admin/pm insert" ON change_orders;
CREATE POLICY "change_orders: admin/pm insert"
  ON change_orders FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "change_orders: admin/pm update" ON change_orders;
CREATE POLICY "change_orders: admin/pm update"
  ON change_orders FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- invoices
DROP POLICY IF EXISTS "invoices: org members read" ON invoices;
CREATE POLICY "invoices: org members read"
  ON invoices FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "invoices: admin/pm insert" ON invoices;
CREATE POLICY "invoices: admin/pm insert"
  ON invoices FOR INSERT
  WITH CHECK (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

DROP POLICY IF EXISTS "invoices: admin/pm update" ON invoices;
CREATE POLICY "invoices: admin/pm update"
  ON invoices FOR UPDATE
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- invoice_items
DROP POLICY IF EXISTS "invoice_items: org members read" ON invoice_items;
CREATE POLICY "invoice_items: org members read"
  ON invoice_items FOR SELECT
  USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "invoice_items: admin/pm manage" ON invoice_items;
CREATE POLICY "invoice_items: admin/pm manage"
  ON invoice_items FOR ALL
  USING (organization_id = get_my_org_id()
    AND get_my_role() IN ('admin','project_manager'));

-- payments
DROP POLICY IF EXISTS "payments: org members read" ON payments;
CREATE POLICY "payments: org members read"
  ON payments FOR SELECT
  USING (organization_id = get_my_org_id());

DROP POLICY IF EXISTS "payments: admin/pm insert" ON payments;
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

-- ✅ END 009 phase12_financials

-- ✅ PRODUCTION BOOTSTRAP COMPLETE
