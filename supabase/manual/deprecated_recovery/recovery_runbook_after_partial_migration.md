# ElectraFlow AI — Recovery runbook (partial Supabase migration)

Use this runbook when `manual_run_007_015.sql` or later recovery scripts failed partway through. **Do not re-run `schema.sql` or completed chunk files blindly.**

---

## Step 1 — Inspect (always run first)

**File:** `supabase/manual/inspect_database_state.sql`

Run in Supabase SQL Editor. Review two result sets:

1. **Detail rows** — `migration_name`, `object_name`, `object_type`, `exists_boolean`
2. **Summary** — `missing_count`, `migration_complete` per migration

Filter missing only (in SQL Editor results):

```sql
-- After running inspect, or re-run the detail query with:
-- WHERE exists_boolean = false
```

### Quick gate checks

| Object | If `exists_boolean = false` | Recovery file |
|--------|------------------------------|---------------|
| `invoices` | Phase 12 missing | `recovery_phase12_financials_if_missing.sql` |
| `meetings` | Phase 15A missing | `recovery_phase15a_meetings_after_partial_failure.sql` |
| `panel_schedules` | Phase 15B missing | `recovery_phase15b_electrical_after_partial_failure.sql` |
| `notifications` | Phase 13 missing | `recovery_phase07_to_11_prerequisites.sql` (sections 010–011) |
| `saved_reports` | Phase 14 missing | `recovery_phase07_to_11_prerequisites.sql` (section 011) |
| `chat_sessions` | Phase 15C missing | `remaining_after_phase15b_recovery.sql` (15C section only) or full remaining file |
| `profiles.client_id` | Phase 15D missing | `recovery_phase15d_client_portal_after_partial_failure.sql` |

---

## Step 2 — Phase 12 financials (if `invoices` missing)

**File:** `supabase/manual/recovery_phase12_financials_if_missing.sql`

Run when inspection shows any of these missing:

- `project_budgets`, `expenses`, `change_orders`, `invoices`, `invoice_items`, `payments`

Safe if tables already exist (uses `IF NOT EXISTS`, drop/recreate policies only).

**Re-run inspection** — confirm `012_phase12` shows `migration_complete = true`.

---

## Step 3 — Phase 15A meetings (if `meetings` missing)

**File:** `supabase/manual/recovery_phase15a_meetings_after_partial_failure.sql`

Run when `meetings`, `meeting_attendees`, or `is_meeting_attendee` missing.

Skip if already applied successfully.

---

## Step 4 — Phase 15B electrical (if `panel_schedules` missing)

**File:** `supabase/manual/recovery_phase15b_electrical_after_partial_failure.sql`

Run when `panel_schedules`, `circuits`, or `can_view_panel` missing.

Skip if already applied successfully.

---

## Step 5 — Phases 10–14 bulk (if multiple gaps in 010–014)

**File:** `supabase/manual/recovery_phase07_to_11_prerequisites.sql`

Run when inspection shows missing objects from:

- `010_phase10` (e.g. `employee_certifications`)
- `011_phase11` (e.g. `timesheets`, `holidays`)
- `013_phase13` (e.g. `notifications`, `activity_events`)
- `014_phase14` (e.g. `saved_reports`, `report_runs`)

**Note:** If only Phase 12 is missing, prefer `recovery_phase12_financials_if_missing.sql` (smaller, targeted).

---

## Step 6 — Phase 15C + 15D (only when prerequisites exist)

**Before running**, verify in inspection:

- `012_phase12` → `invoices` exists (**required for 15D**)
- `015a_meetings` → complete (if you use meetings in portal)
- `015b_electrical` → complete

### If 15C not applied and 15D not started

**File:** `supabase/manual/remaining_after_phase15b_recovery.sql`

### If 15C already applied but 15D failed (your current situation)

1. `recovery_phase12_financials_if_missing.sql` (if `invoices` missing)
2. `recovery_phase15d_client_portal_after_partial_failure.sql`

**Do not re-run 15C** if `chat_sessions` already exists.

---

## Step 7 — Verification SQL

```sql
-- All Phase 12 financial tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'project_budgets', 'expenses', 'change_orders',
    'invoices', 'invoice_items', 'payments'
  )
ORDER BY tablename;

-- Phase 15A–D spot checks
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'meetings', 'panel_schedules', 'chat_sessions',
    'client_portal_preferences'
  )
ORDER BY tablename;

SELECT proname FROM pg_proc
WHERE proname IN (
  'can_view_meeting', 'can_view_panel',
  'user_owns_chat_session', 'client_can_view_invoice'
)
ORDER BY proname;

-- Re-run full inspection summary
-- (second query block in inspect_database_state.sql)
-- Expect migration_complete = true for all rows you need
```

---

## Recommended order for your current database

Based on known failures (15A ordering, 15B ordering, 15D missing `invoices`):

```
✅ Chunks 001–006
✅ recovery_phase15a_meetings_after_partial_failure.sql
✅ recovery_phase15b_electrical_after_partial_failure.sql
✅ remaining_after_phase15b_recovery.sql (15C likely done; 15D failed)
👉 inspect_database_state.sql                    ← RUN FIRST NOW
👉 recovery_phase12_financials_if_missing.sql    ← if invoices missing
👉 recovery_phase15d_client_portal_after_partial_failure.sql
👉 inspect_database_state.sql again
👉 storage + realtime + Clerk JWT (manual)
```

---

## What NOT to run

| File | Why |
|------|-----|
| `schema.sql` / `manual_run_001_004.sql` | Destructive risk on populated DB; core already applied |
| Full `manual_run_007_015.sql` | Will fail or duplicate on partial DB |
| `seed.sql` | Demo data only; not for production |
| Re-run 15C if `chat_sessions` exists | Duplicative; policies recreated unnecessarily |

---

## Manual post-schema steps

After all migrations verify clean:

1. `supabase/manual/storage_buckets_and_policies.sql` (create buckets in Dashboard first)
2. `supabase/manual/realtime_publication.sql`
3. Clerk JWT template + Supabase third-party auth — see `docs/phase-5-clerk-supabase-setup.md`
