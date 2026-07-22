-- ===========================================================================
-- ElectraFlow AI — Inspect database state (partial migration recovery)
-- ===========================================================================
-- Run in Supabase SQL Editor. Read-only — does not modify anything.
-- Returns one row per expected object: migration_name, object_name,
-- object_type, exists_boolean.
--
-- Filter results:
--   WHERE exists_boolean = false   -- missing objects only
-- Order by migration_name to see gaps by phase.
-- ===========================================================================

WITH expected AS (
  SELECT * FROM (VALUES
    -- 001 schema (core)
    ('001_schema', 'organizations', 'table'),
    ('001_schema', 'profiles', 'table'),
    ('001_schema', 'projects', 'table'),
    ('001_schema', 'project_members', 'table'),
    ('001_schema', 'documents', 'table'),
    ('001_schema', 'document_versions', 'table'),
    ('001_schema', 'submittals', 'table'),
    ('001_schema', 'submittal_items', 'table'),
    ('001_schema', 'rfi', 'table'),
    ('001_schema', 'ncr', 'table'),
    ('001_schema', 'employees', 'table'),
    ('001_schema', 'clients', 'table'),

    -- 002 rls + 003 phase5 helpers
    ('002_rls', 'get_my_org_id', 'function'),
    ('002_rls', 'get_my_role', 'function'),
    ('003_phase5', 'profiles.clerk_user_id', 'column'),

    -- 006 phase6 documents
    ('006_phase6', 'document_shares', 'table'),
    ('006_phase6', 'upload_sessions', 'table'),
    ('006_phase6', 'get_my_profile_id', 'function'),

    -- 007 phase7 submittals
    ('007_phase7', 'submittal_item_documents', 'table'),
    ('007_phase7', 'submittals.revision_number', 'column'),

    -- 008 phase8 rfi
    ('008_phase8', 'rfi_documents', 'table'),
    ('008_phase8', 'rfi.question', 'column'),

    -- 010 phase10 resources
    ('010_phase10', 'employee_certifications', 'table'),

    -- 011 phase11 timesheets
    ('011_phase11', 'holidays', 'table'),
    ('011_phase11', 'timesheets', 'table'),
    ('011_phase11', 'timesheet_entries', 'table'),
    ('011_phase11', 'leave_requests', 'table'),

    -- 012 phase12 financials
    ('012_phase12', 'project_budgets', 'table'),
    ('012_phase12', 'expenses', 'table'),
    ('012_phase12', 'change_orders', 'table'),
    ('012_phase12', 'invoices', 'table'),
    ('012_phase12', 'invoice_items', 'table'),
    ('012_phase12', 'payments', 'table'),

    -- 013 phase13 notifications
    ('013_phase13', 'notifications', 'table'),
    ('013_phase13', 'activity_events', 'table'),
    ('013_phase13', 'notification_preferences', 'table'),
    ('013_phase13', 'notification_deliveries', 'table'),

    -- 014 phase14 analytics
    ('014_phase14', 'saved_reports', 'table'),
    ('014_phase14', 'report_runs', 'table'),
    ('014_phase14', 'dashboard_preferences', 'table'),
    ('014_phase14', 'system_metrics', 'table'),
    ('014_phase14', 'analytics_snapshots', 'table'),
    ('014_phase14', 'threshold_rules', 'table'),

    -- 015a meetings
    ('015a_meetings', 'meetings', 'table'),
    ('015a_meetings', 'meeting_attendees', 'table'),
    ('015a_meetings', 'meeting_action_items', 'table'),
    ('015a_meetings', 'is_meeting_attendee', 'function'),
    ('015a_meetings', 'can_view_meeting', 'function'),
    ('015a_meetings', 'is_project_member', 'function'),

    -- 015b electrical
    ('015b_electrical', 'panel_schedules', 'table'),
    ('015b_electrical', 'circuits', 'table'),
    ('015b_electrical', 'load_calculations', 'table'),
    ('015b_electrical', 'equipment_lists', 'table'),
    ('015b_electrical', 'electrical_revisions', 'table'),
    ('015b_electrical', 'can_view_electrical_project', 'function'),
    ('015b_electrical', 'can_view_panel', 'function'),

    -- 015c ai
    ('015c_ai', 'chat_sessions', 'table'),
    ('015c_ai', 'conversation_contexts', 'table'),
    ('015c_ai', 'chat_messages', 'table'),
    ('015c_ai', 'document_chunks', 'table'),
    ('015c_ai', 'embedding_jobs', 'table'),
    ('015c_ai', 'ai_suggestions', 'table'),
    ('015c_ai', 'ai_usage_metrics', 'table'),
    ('015c_ai', 'can_access_ai_features', 'function'),
    ('015c_ai', 'user_owns_chat_session', 'function'),

    -- 015d client portal
    ('015d_portal', 'profiles.client_id', 'column'),
    ('015d_portal', 'rfi.client_visible', 'column'),
    ('015d_portal', 'submittals.client_visible', 'column'),
    ('015d_portal', 'client_portal_preferences', 'table'),
    ('015d_portal', 'client_download_logs', 'table'),
    ('015d_portal', 'client_portal_announcements', 'table'),
    ('015d_portal', 'get_my_client_id', 'function'),
    ('015d_portal', 'client_can_view_invoice', 'function')
  ) AS v(migration_name, object_name, object_type)
),
resolved AS (
  SELECT
    e.migration_name,
    e.object_name,
    e.object_type,
    CASE e.object_type
      WHEN 'table' THEN EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = e.object_name
      )
      WHEN 'function' THEN EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = e.object_name
      )
      WHEN 'column' THEN EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = split_part(e.object_name, '.', 1)
          AND c.column_name = split_part(e.object_name, '.', 2)
      )
      ELSE false
    END AS exists_boolean
  FROM expected e
)
SELECT migration_name, object_name, object_type, exists_boolean
FROM resolved
ORDER BY migration_name, object_type, object_name;

-- ─── Summary: missing objects per migration ───────────────────────────────────

WITH expected AS (
  SELECT * FROM (VALUES
    ('001_schema', 'organizations', 'table'),
    ('001_schema', 'profiles', 'table'),
    ('001_schema', 'projects', 'table'),
    ('001_schema', 'project_members', 'table'),
    ('001_schema', 'documents', 'table'),
    ('001_schema', 'document_versions', 'table'),
    ('001_schema', 'submittals', 'table'),
    ('001_schema', 'submittal_items', 'table'),
    ('001_schema', 'rfi', 'table'),
    ('001_schema', 'ncr', 'table'),
    ('001_schema', 'employees', 'table'),
    ('001_schema', 'clients', 'table'),
    ('002_rls', 'get_my_org_id', 'function'),
    ('002_rls', 'get_my_role', 'function'),
    ('003_phase5', 'profiles.clerk_user_id', 'column'),
    ('006_phase6', 'document_shares', 'table'),
    ('006_phase6', 'upload_sessions', 'table'),
    ('006_phase6', 'get_my_profile_id', 'function'),
    ('007_phase7', 'submittal_item_documents', 'table'),
    ('007_phase7', 'submittals.revision_number', 'column'),
    ('008_phase8', 'rfi_documents', 'table'),
    ('008_phase8', 'rfi.question', 'column'),
    ('010_phase10', 'employee_certifications', 'table'),
    ('011_phase11', 'holidays', 'table'),
    ('011_phase11', 'timesheets', 'table'),
    ('011_phase11', 'timesheet_entries', 'table'),
    ('011_phase11', 'leave_requests', 'table'),
    ('012_phase12', 'project_budgets', 'table'),
    ('012_phase12', 'expenses', 'table'),
    ('012_phase12', 'change_orders', 'table'),
    ('012_phase12', 'invoices', 'table'),
    ('012_phase12', 'invoice_items', 'table'),
    ('012_phase12', 'payments', 'table'),
    ('013_phase13', 'notifications', 'table'),
    ('013_phase13', 'activity_events', 'table'),
    ('013_phase13', 'notification_preferences', 'table'),
    ('013_phase13', 'notification_deliveries', 'table'),
    ('014_phase14', 'saved_reports', 'table'),
    ('014_phase14', 'report_runs', 'table'),
    ('014_phase14', 'dashboard_preferences', 'table'),
    ('014_phase14', 'system_metrics', 'table'),
    ('014_phase14', 'analytics_snapshots', 'table'),
    ('014_phase14', 'threshold_rules', 'table'),
    ('015a_meetings', 'meetings', 'table'),
    ('015a_meetings', 'meeting_attendees', 'table'),
    ('015a_meetings', 'meeting_action_items', 'table'),
    ('015a_meetings', 'is_meeting_attendee', 'function'),
    ('015a_meetings', 'can_view_meeting', 'function'),
    ('015a_meetings', 'is_project_member', 'function'),
    ('015b_electrical', 'panel_schedules', 'table'),
    ('015b_electrical', 'circuits', 'table'),
    ('015b_electrical', 'load_calculations', 'table'),
    ('015b_electrical', 'equipment_lists', 'table'),
    ('015b_electrical', 'electrical_revisions', 'table'),
    ('015b_electrical', 'can_view_electrical_project', 'function'),
    ('015b_electrical', 'can_view_panel', 'function'),
    ('015c_ai', 'chat_sessions', 'table'),
    ('015c_ai', 'conversation_contexts', 'table'),
    ('015c_ai', 'chat_messages', 'table'),
    ('015c_ai', 'document_chunks', 'table'),
    ('015c_ai', 'embedding_jobs', 'table'),
    ('015c_ai', 'ai_suggestions', 'table'),
    ('015c_ai', 'ai_usage_metrics', 'table'),
    ('015c_ai', 'can_access_ai_features', 'function'),
    ('015c_ai', 'user_owns_chat_session', 'function'),
    ('015d_portal', 'profiles.client_id', 'column'),
    ('015d_portal', 'rfi.client_visible', 'column'),
    ('015d_portal', 'submittals.client_visible', 'column'),
    ('015d_portal', 'client_portal_preferences', 'table'),
    ('015d_portal', 'client_download_logs', 'table'),
    ('015d_portal', 'client_portal_announcements', 'table'),
    ('015d_portal', 'get_my_client_id', 'function'),
    ('015d_portal', 'client_can_view_invoice', 'function')
  ) AS v(migration_name, object_name, object_type)
),
resolved AS (
  SELECT
    e.migration_name,
    e.object_name,
    e.object_type,
    CASE e.object_type
      WHEN 'table' THEN EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = e.object_name
      )
      WHEN 'function' THEN EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = e.object_name
      )
      WHEN 'column' THEN EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = split_part(e.object_name, '.', 1)
          AND c.column_name = split_part(e.object_name, '.', 2)
      )
      ELSE false
    END AS exists_boolean
  FROM expected e
)
SELECT
  migration_name,
  COUNT(*) FILTER (WHERE NOT exists_boolean) AS missing_count,
  COUNT(*) AS total_checked,
  BOOL_AND(exists_boolean) AS migration_complete
FROM resolved
GROUP BY migration_name
ORDER BY migration_name;

-- Quick gate checks (run separately if needed):
-- SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'invoices') AS invoices_exists;
-- SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'meetings') AS meetings_exists;
-- SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'panel_schedules') AS panel_schedules_exists;
-- SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'chat_sessions') AS chat_sessions_exists;
