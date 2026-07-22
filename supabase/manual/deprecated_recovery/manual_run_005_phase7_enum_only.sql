-- =====================================================
-- ElectraFlow AI — Manual SQL Editor run order
-- =====================================================
-- Run these files in order on a FRESH Supabase project only.
-- Do NOT run seed.sql. Stop on first error.
--
--   1. manual_run_001_004.sql
--   2. manual_run_005_phase7_enum_only.sql
--   3. manual_run_005_phase7_rest.sql
--   4. manual_run_006_phase8_enum_only.sql
--   5. manual_run_006_phase8_rest.sql
--   6. manual_run_007_015.sql
--
-- After all chunks succeed, apply separately:
--   • manual/storage_buckets_and_policies.sql
--   • manual/realtime_publication.sql
--   • Clerk JWT setup (see docs/phase-5-clerk-supabase-setup.md)
-- =====================================================

-- >>> RUN STEP 2 of 6: 005 phase7 — enum only (ALTER TYPE ADD VALUE)
-- Source: 202607010005_phase7_submittals.sql (lines 1–14)
-- Previous: manual_run_001_004.sql
-- Next: manual_run_005_phase7_rest.sql
-- =====================================================

-- NOTE: Run this chunk alone before phase7 rest. ALTER TYPE must commit first.

-- ===========================================================================
-- ElectraFlow AI — Phase 7 Migration: Submittals Workflow
-- ===========================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5.sql + migration-phase6.sql
-- Run in Supabase SQL Editor.  Idempotent where possible (IF NOT EXISTS / IF EXISTS).
--
-- IMPORTANT: The ALTER TYPE statement must run outside a multi-statement
-- transaction.  In the Supabase SQL Editor each statement is its own
-- implicit transaction, so this is safe to paste and run as a single block.
-- ===========================================================================

-- ─── 1. Extend submittal_status enum ─────────────────────────────────────────

ALTER TYPE submittal_status ADD VALUE IF NOT EXISTS 'archived';
