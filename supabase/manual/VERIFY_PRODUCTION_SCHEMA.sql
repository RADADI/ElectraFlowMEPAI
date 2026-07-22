-- ===========================================================================
-- ElectraFlow AI — Verify production schema (read-only)
-- ===========================================================================
-- Run after PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql succeeds on a fresh project.
-- ===========================================================================

WITH expected AS (
  SELECT * FROM (VALUES
    ('core', 'organizations', 'table'),
    ('core', 'profiles', 'table'),
    ('core', 'projects', 'table'),
    ('core', 'documents', 'table'),
    ('core', 'submittals', 'table'),
    ('core', 'rfi', 'table'),
    ('core', 'ncr', 'table'),
    ('core', 'employees', 'table'),
    ('core', 'clients', 'table'),
    ('rls', 'get_my_org_id', 'function'),
    ('rls', 'get_my_role', 'function'),
    ('phase5', 'profiles.clerk_user_id', 'column'),
    ('phase6', 'document_shares', 'table'),
    ('phase6', 'upload_sessions', 'table'),
    ('phase7', 'submittal_item_documents', 'table'),
    ('phase8', 'rfi_documents', 'table'),
    ('phase10', 'employee_certifications', 'table'),
    ('phase11', 'timesheets', 'table'),
    ('phase11', 'holidays', 'table'),
    ('phase11', 'leave_requests', 'table'),
    ('phase12', 'project_budgets', 'table'),
    ('phase12', 'expenses', 'table'),
    ('phase12', 'change_orders', 'table'),
    ('phase12', 'invoices', 'table'),
    ('phase12', 'invoice_items', 'table'),
    ('phase12', 'payments', 'table'),
    ('phase13', 'notifications', 'table'),
    ('phase13', 'activity_events', 'table'),
    ('phase14', 'saved_reports', 'table'),
    ('phase14', 'report_runs', 'table'),
    ('phase15a', 'meetings', 'table'),
    ('phase15a', 'meeting_attendees', 'table'),
    ('phase15a', 'can_view_meeting', 'function'),
    ('phase15b', 'panel_schedules', 'table'),
    ('phase15b', 'circuits', 'table'),
    ('phase15b', 'can_view_panel', 'function'),
    ('phase15c', 'chat_sessions', 'table'),
    ('phase15c', 'document_chunks', 'table'),
    ('phase15c', 'embedding_jobs', 'table'),
    ('phase15c', 'user_owns_chat_session', 'function'),
    ('phase15d', 'profiles.client_id', 'column'),
    ('phase15d', 'client_portal_preferences', 'table'),
    ('phase15d', 'client_can_view_invoice', 'function'),
    ('enums', 'user_role', 'enum'),
    ('enums', 'submittal_status', 'enum'),
    ('enums', 'rfi_status', 'enum'),
    ('storage_prereq', 'get_my_profile_id', 'function')
  ) AS v(migration_area, object_name, object_type)
),
resolved AS (
  SELECT
    e.migration_area,
    e.object_name,
    e.object_type,
    CASE e.object_type
      WHEN 'table' THEN EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = e.object_name
      )
      WHEN 'function' THEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = e.object_name
      )
      WHEN 'column' THEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = split_part(e.object_name, '.', 1)
          AND c.column_name = split_part(e.object_name, '.', 2)
      )
      WHEN 'enum' THEN EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = e.object_name
      )
      ELSE false
    END AS exists_boolean
  FROM expected e
)
SELECT migration_area, object_name, object_type, exists_boolean
FROM resolved
ORDER BY migration_area, object_type, object_name;

-- Summary
WITH expected AS (
  SELECT * FROM (VALUES
    ('core', 'organizations', 'table'),
    ('core', 'profiles', 'table'),
    ('core', 'projects', 'table'),
    ('core', 'documents', 'table'),
    ('core', 'submittals', 'table'),
    ('core', 'rfi', 'table'),
    ('core', 'ncr', 'table'),
    ('core', 'employees', 'table'),
    ('core', 'clients', 'table'),
    ('rls', 'get_my_org_id', 'function'),
    ('rls', 'get_my_role', 'function'),
    ('phase5', 'profiles.clerk_user_id', 'column'),
    ('phase6', 'document_shares', 'table'),
    ('phase6', 'upload_sessions', 'table'),
    ('phase7', 'submittal_item_documents', 'table'),
    ('phase8', 'rfi_documents', 'table'),
    ('phase10', 'employee_certifications', 'table'),
    ('phase11', 'timesheets', 'table'),
    ('phase11', 'holidays', 'table'),
    ('phase11', 'leave_requests', 'table'),
    ('phase12', 'project_budgets', 'table'),
    ('phase12', 'expenses', 'table'),
    ('phase12', 'change_orders', 'table'),
    ('phase12', 'invoices', 'table'),
    ('phase12', 'invoice_items', 'table'),
    ('phase12', 'payments', 'table'),
    ('phase13', 'notifications', 'table'),
    ('phase13', 'activity_events', 'table'),
    ('phase14', 'saved_reports', 'table'),
    ('phase14', 'report_runs', 'table'),
    ('phase15a', 'meetings', 'table'),
    ('phase15a', 'meeting_attendees', 'table'),
    ('phase15a', 'can_view_meeting', 'function'),
    ('phase15b', 'panel_schedules', 'table'),
    ('phase15b', 'circuits', 'table'),
    ('phase15b', 'can_view_panel', 'function'),
    ('phase15c', 'chat_sessions', 'table'),
    ('phase15c', 'document_chunks', 'table'),
    ('phase15c', 'embedding_jobs', 'table'),
    ('phase15c', 'user_owns_chat_session', 'function'),
    ('phase15d', 'profiles.client_id', 'column'),
    ('phase15d', 'client_portal_preferences', 'table'),
    ('phase15d', 'client_can_view_invoice', 'function'),
    ('enums', 'user_role', 'enum'),
    ('enums', 'submittal_status', 'enum'),
    ('enums', 'rfi_status', 'enum'),
    ('storage_prereq', 'get_my_profile_id', 'function')
  ) AS v(migration_area, object_name, object_type)
),
resolved AS (
  SELECT
    e.migration_area,
    CASE e.object_type
      WHEN 'table' THEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = e.object_name)
      WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = e.object_name)
      WHEN 'column' THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = split_part(e.object_name, '.', 1) AND c.column_name = split_part(e.object_name, '.', 2))
      WHEN 'enum' THEN EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = e.object_name)
      ELSE false
    END AS exists_boolean
  FROM expected e
)
SELECT
  migration_area,
  COUNT(*) FILTER (WHERE NOT exists_boolean) AS missing_count,
  COUNT(*) AS total_checked,
  BOOL_AND(exists_boolean) AS ready_boolean
FROM resolved
GROUP BY migration_area
ORDER BY migration_area;

-- Overall production ready gate
WITH expected AS (
  SELECT * FROM (VALUES
    ('core', 'organizations', 'table'),
    ('core', 'profiles', 'table'),
    ('core', 'projects', 'table'),
    ('core', 'documents', 'table'),
    ('core', 'submittals', 'table'),
    ('core', 'rfi', 'table'),
    ('core', 'ncr', 'table'),
    ('core', 'employees', 'table'),
    ('core', 'clients', 'table'),
    ('rls', 'get_my_org_id', 'function'),
    ('rls', 'get_my_role', 'function'),
    ('phase5', 'profiles.clerk_user_id', 'column'),
    ('phase6', 'document_shares', 'table'),
    ('phase6', 'upload_sessions', 'table'),
    ('phase7', 'submittal_item_documents', 'table'),
    ('phase8', 'rfi_documents', 'table'),
    ('phase10', 'employee_certifications', 'table'),
    ('phase11', 'timesheets', 'table'),
    ('phase11', 'holidays', 'table'),
    ('phase11', 'leave_requests', 'table'),
    ('phase12', 'project_budgets', 'table'),
    ('phase12', 'expenses', 'table'),
    ('phase12', 'change_orders', 'table'),
    ('phase12', 'invoices', 'table'),
    ('phase12', 'invoice_items', 'table'),
    ('phase12', 'payments', 'table'),
    ('phase13', 'notifications', 'table'),
    ('phase13', 'activity_events', 'table'),
    ('phase14', 'saved_reports', 'table'),
    ('phase14', 'report_runs', 'table'),
    ('phase15a', 'meetings', 'table'),
    ('phase15a', 'meeting_attendees', 'table'),
    ('phase15a', 'can_view_meeting', 'function'),
    ('phase15b', 'panel_schedules', 'table'),
    ('phase15b', 'circuits', 'table'),
    ('phase15b', 'can_view_panel', 'function'),
    ('phase15c', 'chat_sessions', 'table'),
    ('phase15c', 'document_chunks', 'table'),
    ('phase15c', 'embedding_jobs', 'table'),
    ('phase15c', 'user_owns_chat_session', 'function'),
    ('phase15d', 'profiles.client_id', 'column'),
    ('phase15d', 'client_portal_preferences', 'table'),
    ('phase15d', 'client_can_view_invoice', 'function'),
    ('enums', 'user_role', 'enum'),
    ('enums', 'submittal_status', 'enum'),
    ('enums', 'rfi_status', 'enum'),
    ('storage_prereq', 'get_my_profile_id', 'function')
  ) AS v(migration_area, object_name, object_type)
),
resolved AS (
  SELECT
    CASE e.object_type
      WHEN 'table' THEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = e.object_name)
      WHEN 'function' THEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = e.object_name)
      WHEN 'column' THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = split_part(e.object_name, '.', 1) AND c.column_name = split_part(e.object_name, '.', 2))
      WHEN 'enum' THEN EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = e.object_name)
      ELSE false
    END AS exists_boolean
  FROM expected e
)
SELECT BOOL_AND(exists_boolean) AS production_schema_ready FROM resolved;

-- RLS spot check (business tables)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'projects', 'documents', 'invoices', 'meetings',
    'panel_schedules', 'chat_sessions', 'client_portal_preferences'
  )
ORDER BY tablename;

-- Overall ready: all areas must be true in summary above
-- SELECT migration_area, ready_boolean FROM (...summary query...);
