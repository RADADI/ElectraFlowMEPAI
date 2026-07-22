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
