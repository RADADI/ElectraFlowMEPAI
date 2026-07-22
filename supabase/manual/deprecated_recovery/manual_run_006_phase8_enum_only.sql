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

-- >>> RUN STEP 4 of 6: 006 phase8 — enum only (ALTER TYPE ADD VALUE)
-- Source: 202607010006_phase8_rfi.sql (lines 1–16)
-- Previous: manual_run_005_phase7_rest.sql
-- Next: manual_run_006_phase8_rest.sql
-- =====================================================

-- NOTE: Run this chunk alone before phase8 rest. Each ALTER TYPE must commit first.

-- ===========================================================================
-- ElectraFlow AI — Phase 8 Migration: RFI Workflow
-- ===========================================================================
-- Prerequisites: schema.sql + rls-policies.sql + migration-phase5..7.sql
-- Run in Supabase SQL Editor.  Each ALTER TYPE runs as its own statement.
-- ===========================================================================

-- ─── 1. Extend rfi_status enum ───────────────────────────────────────────────
-- Phase 3 values: open | under_review | answered | closed | cancelled
-- Phase 8 adds: draft | submitted | reopened | voided | archived

ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'reopened';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'voided';
ALTER TYPE rfi_status ADD VALUE IF NOT EXISTS 'archived';
