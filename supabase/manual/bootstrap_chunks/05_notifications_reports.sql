-- ElectraFlow AI — Bootstrap chunk (run in numeric order on EMPTY database only)
-- See supabase/manual/RESET_AND_RUN_INSTRUCTIONS.md


-- =====================================================
-- 010 phase13_notifications
-- Source: migration-phase13.sql
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

-- ✅ END 010 phase13_notifications

-- =====================================================
-- 011 phase14_analytics
-- Source: migration-phase14.sql
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

-- ✅ END 011 phase14_analytics

-- ✅ PRODUCTION BOOTSTRAP COMPLETE
