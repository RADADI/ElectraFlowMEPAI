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
