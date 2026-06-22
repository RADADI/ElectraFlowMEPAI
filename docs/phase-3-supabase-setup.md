# Phase 3 — Supabase Backend Setup Guide

This guide walks you through connecting ElectraFlow AI to a real Supabase database.
The app continues to work with mock data if you skip this step.

---

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier is fine)
- The ElectraFlow AI codebase with Phase 3 changes applied

---

## 1. Create a Supabase project

1. Log in to [supabase.com](https://supabase.com)
2. Click **New project**
3. Choose your organisation, enter a project name (e.g. `electraflow-ai`), and set a strong database password
4. Select the region closest to your users
5. Click **Create new project** and wait ~2 minutes for provisioning

---

## 2. Apply the schema

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open `src/database/schema.sql` in this repo, copy the entire file contents, paste into the editor, and click **Run**
4. You should see "Success. No rows returned."

---

## 3. Apply RLS policies

1. Open a new SQL query in the editor
2. Open `src/database/rls-policies.sql`, copy, paste, and run
3. Verify in **Table Editor** → any table → **RLS** that policies are listed

---

## 4. (Optional) Seed sample data

For development only:

1. Open a new SQL query
2. Open `src/database/seed.sql`, copy, paste, and run
3. Verify rows exist in **Table Editor** → `organizations`, `projects`, etc.

---

## 5. Get your API keys

1. Go to **Project Settings** (gear icon) → **API**
2. Copy **Project URL** (looks like `https://abcdefgh.supabase.co`)
3. Copy **anon / public** key (starts with `eyJ...`)

---

## 6. Add environment variables

In the project root, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxx
```

Leave `VITE_CLERK_PUBLISHABLE_KEY` blank unless you also want Clerk auth.

---

## 7. Test the connection

1. Run `npm run dev`
2. Open the browser console
3. You should see: `[ElectraFlow] Supabase: configured ✓ https://...`
4. If you see "not configured", the env vars are missing or incorrect

---

## 8. Verify data loads

The services fall back gracefully, so the best way to verify is:

1. Sign in to the app (mock login is fine)
2. Open **Projects** — if Supabase is configured and seed data was applied, you will see the 3 seeded projects instead of the 8 dummy projects

---

## How to migrate a page to use real data (Phase 4+)

Phase 3 only creates the infrastructure. Migrating pages is intentionally deferred
so you can do it one module at a time without breaking anything.

**Example: Migrate the Projects page**

```tsx
// Before (static dummy data imported directly):
import { projects } from "@/lib/dummy-data";

// After (React Query hook):
import { useProjects } from "@/hooks/api/useProjects";

function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();

  if (isLoading) return <ProjectsSkeleton />;
  return <ProjectsTable data={projects} />;
}
```

Each hook (`useProjects`, `useDocuments`, `useRFIs`, `useNCRs`, `useSubmittals`,
`useEmployees`, `useProfiles`) follows the same pattern. The service behind it
automatically uses Supabase or falls back to mock data.

---

## Phase 4.1 — Security model (read before Phase 5)

### Frontend uses anon key ONLY

The browser bundle ships **one** Supabase client that uses the **anon (public) key**.
This is safe because Row Level Security (RLS) limits what the anon key can access.

```
# ✅ Frontend — only these two keys
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...          # public / anon key
```

### Service role key is server-side ONLY

The service role key bypasses **all** RLS policies. If it appears in a VITE_
variable it is embedded in the browser bundle and visible to every user in
DevTools → every row in every table is exposed.

```
# ❌ NEVER do this
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhb...  # WRONG — this leaks into the bundle!

# ✅ Use the service role key only in:
#   • Supabase SQL Editor (paste schema.sql, seed.sql, admin queries)
#   • A backend API (Node.js, Edge Functions, server actions)
#   • Local CLI: supabase db push / supabase db reset
```

ElectraFlow removed the client-side `serviceClient` in Phase 4.1.
The `src/lib/supabase.ts` file now exports only `supabase` (anon key).

### IS_JWT_READY flag

`IS_JWT_READY = false` in `src/lib/supabase.ts` is the single gate that controls
whether the project service uses real Supabase queries or the mock/sessionStorage
layer.

Phase 4.1 sets it to `false` permanently because `auth.uid()` is `null` without
Clerk JWT being set on the Supabase client — meaning RLS would block all queries
even with the anon key.

When Supabase is configured but `IS_JWT_READY = false` the Projects page shows:
> "Supabase is configured, but authenticated database access is not connected yet
> (Phase 5). Using mock data."

This is intentional and safe. No data leaks between organisations.

### Real DB CRUD requires Phase 5

Phase 5 must:
1. Call `supabase.auth.setSession({ access_token: clerkToken, refresh_token: "" })`
   after the user signs in via Clerk. This sets `auth.uid()` on the Supabase client.
2. Set `IS_JWT_READY = true` in `src/lib/supabase.ts`.
3. Ensure `getCurrentOrganizationId()` in `auth-bridge.ts` reads the org ID from
   the Clerk JWT claim (set in Clerk's session metadata on sign-in).

Once those three steps are done, the project service automatically starts using
real Supabase CRUD with full RLS enforcement — no other service changes needed.

---

## Phase 5 checklist

- [ ] Wire Clerk JWT into Supabase: `supabase.auth.setSession({ access_token: clerkToken })`
- [ ] Set `IS_JWT_READY = true` in `src/lib/supabase.ts`
- [ ] Update `getCurrentOrganizationId()` in `auth-bridge.ts` to read from Clerk JWT claim
- [ ] Replace `getCurrentUserId()` placeholder in `auth-bridge.ts` with real Clerk user ID
- [ ] Confirm RLS policies resolve correctly with `auth.uid()` set (test in Supabase SQL Editor)
- [ ] Migrate Documents page to `useDocuments` hook
- [ ] Migrate Submittals page to `useSubmittals` hook
- [ ] Migrate RFI page to `useRFIs` hook
- [ ] Migrate NCR page to `useNCRs` hook
- [ ] Migrate HR / Resources page to `useEmployees` hook
- [ ] Add file upload support (Supabase Storage bucket for documents)
- [ ] Add AI tables: `document_chunks`, `embeddings_metadata`, `ai_chat_sessions`

---

## Troubleshooting

| Symptom                        | Likely cause                          | Fix                                                                          |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------- |
| Console shows "not configured" | Env vars missing or wrong key name    | Check `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`            |
| App crashes on load            | Invalid Supabase URL format           | URL must start with `https://` and end with `.supabase.co`                   |
| No data after connecting       | RLS blocking anonymous reads          | Ensure `auth.uid()` resolves — Phase 3 RLS requires an authenticated session |
| Seed data not visible          | RLS policies applied before schema    | Re-run schema.sql, then rls-policies.sql, then seed.sql in order             |
| TypeScript errors in services  | `@supabase/supabase-js` not installed | Run `npm install @supabase/supabase-js`                                      |
