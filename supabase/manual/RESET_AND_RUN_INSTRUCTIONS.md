# ElectraFlow AI — Reset and run instructions (production database)

Use this guide for a **clean production Supabase setup**. Do not use deprecated recovery scripts in `deprecated_recovery/`.

---

## Best option: fresh Supabase project

1. Create a new project at [supabase.com](https://supabase.com), or reset the current database completely (Settings → Database → reset).
2. Update `.env.local`:
   ```env
   VITE_SUPABASE_URL=https://bpjxjxwgxcexuxhrcbkp.supabase.co
   VITE_SUPABASE_ANON_KEY=your_publishable_key
   ```
3. **Do not run on a partially migrated database** — ordering fixes assume an empty `public` schema.

---

## Step 1 — Run production bootstrap (once)

Open **Supabase Dashboard → SQL Editor**.

### Option A — Single file (recommended)

Paste and run the entire file:

**`supabase/manual/PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql`**

### Option B — Six chunks (if SQL Editor times out)

Run in order, wait for each to finish:

| Order | File |
|-------|------|
| 1 | `supabase/manual/bootstrap_chunks/01_core_schema.sql` |
| 2 | `supabase/manual/bootstrap_chunks/02_base_rls_and_clerk.sql` |
| 3 | `supabase/manual/bootstrap_chunks/03_documents_submittals_rfi.sql` |
| 4 | `supabase/manual/bootstrap_chunks/04_resources_timesheets_financials.sql` |
| 5 | `supabase/manual/bootstrap_chunks/05_notifications_reports.sql` |
| 6 | `supabase/manual/bootstrap_chunks/06_meetings_electrical_ai_client_portal.sql` |

**Stop on the first error.** Do not continue.

---

## Step 2 — Verify schema

Run:

**`supabase/manual/VERIFY_PRODUCTION_SCHEMA.sql`**

Every row in the summary should show `ready_boolean = true`.

Quick gate:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('invoices', 'chat_sessions', 'meetings', 'panel_schedules')
ORDER BY tablename;
```

Expected: 4 rows.

---

## Step 3 — Storage buckets (manual)

1. **Storage → New bucket:** `project-documents` (Private)
2. **Storage → New bucket:** `avatars` (Private)
3. SQL Editor → run **`supabase/manual/storage_buckets_and_policies.sql`**

---

## Step 4 — Realtime (manual)

1. **Database → Replication → supabase_realtime**
2. Add tables: `notifications`, `activity_events`

Or run **`supabase/manual/realtime_publication.sql`**.

---

## Step 5 — Clerk JWT

1. Clerk Dashboard → JWT Templates → create template **`supabase`** (RS256, `sub` claim)
2. Supabase → Authentication → configure Clerk JWKS / third-party auth
3. Set `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local`
4. See **`docs/phase-5-clerk-supabase-setup.md`**

---

## Step 6 — Start the app and test

```bash
npm run dev
```

1. Sign in with Clerk
2. Create a project
3. Refresh the page — project should persist from PostgreSQL (not mock data)

---

## What NOT to do

| Do not | Reason |
|--------|--------|
| Run `seed.sql` on production | Demo/fake data |
| Re-run bootstrap on partial DB | Duplicate policies / conflicts |
| Use `deprecated_recovery/*` | Superseded by production bootstrap |
| Put service role key in `.env` | Security — bypasses RLS |
| Re-run `schema.sql` alone on populated DB | Not idempotent |

---

## If any error happens during bootstrap

1. **Stop** — do not run remaining sections.
2. Note the error line and migration section comment (e.g. `-- 012 phase15a_meetings`).
3. **Recommended:** reset database or create a **new** Supabase project.
4. Re-run **`PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql`** from scratch on empty DB.
5. Do not patch forward on a broken partial state unless you are an expert.

---

## Regenerating bootstrap from source (maintainers)

After editing `src/database/*.sql`:

```bash
python3 supabase/tools/build_production_bootstrap.py
```

This updates:

- `PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql`
- `bootstrap_chunks/*.sql`
- `supabase/migrations/*.sql`

---

## After database bootstrap — remaining work

- [ ] Verification SQL all green
- [ ] Storage buckets + policies
- [ ] Realtime publication
- [ ] Clerk JWT template + Supabase auth
- [ ] `.env.local` URL + keys
- [ ] End-to-end CRUD test (create project, reload)
