-- ============================================================================
-- ElectraFlow AI — Manual: Realtime publication
-- ============================================================================
-- NOT applied by `supabase db push`. Run manually after migration 010 (phase 13).
--
-- Option A (recommended): Supabase Dashboard
--   Database → Replication → supabase_realtime → add tables:
--     • notifications
--     • activity_events
--
-- Option B: Run this SQL in the SQL Editor (requires sufficient privileges).
--
-- Source: migration-phase13.sql (commented block).
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;
