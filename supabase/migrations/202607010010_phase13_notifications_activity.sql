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
