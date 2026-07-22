# Phase 5 — Clerk JWT ↔ Supabase RLS Bridge: Setup Guide

This guide walks you through the one-time manual steps required to connect Clerk
authentication to Supabase Row Level Security so that real database CRUD is
enabled in the Projects module.

---

## Architecture overview

```
Browser
  └─ Clerk session  →  session.getToken({ template: "supabase" })
                                │
                                ▼  (JWT signed with Clerk key)
  └─ Supabase client  →  Authorization: Bearer <clerk_jwt>
                                │
                                ▼  Supabase verifies with JWKS
                         auth.jwt() ->> 'sub'  =  "user_2abc…"
                                │
                                ▼
                    profiles.clerk_user_id  =  "user_2abc…"
                                │
                         ┌──────┴───────┐
                         │              │
                    organization_id   role
                    (authoritative)  (authoritative)
                         │              │
                         └──────┬───────┘
                                ▼
                        RLS policies enforce
                        org isolation + role access
```

**Key principles:**
- **Clerk = identity only.** Clerk proves who the user is.
- **Database = authorization.** `profiles.role` and `profiles.organization_id` determine what they can do.
- **No service role key in the browser.** Ever.
- **No Clerk metadata for authorization.** The DB wins if they differ.

---

## Prerequisites

- Supabase project created with schema.sql + rls-policies.sql + migration-phase5.sql applied.
- Clerk application created.
- At least one `organizations` row in the database.

---

## Step 1 — Apply the Phase 5 migration

In the **Supabase SQL Editor**, run the contents of `src/database/migration-phase5.sql`.

This adds:
- `clerk_user_id text unique` column to `profiles`
- Fast index `idx_profiles_clerk_user_id`
- Updated `get_my_org_id()` and `get_my_role()` using `auth.jwt() ->> 'sub'`
- Profile self-registration RLS policy

**Verify it ran correctly:**
```sql
-- Should show the new column
select column_name, data_type from information_schema.columns
  where table_name = 'profiles' order by ordinal_position;

-- Should show the index
select indexname from pg_indexes where tablename = 'profiles';
```

---

## Step 2 — Configure Supabase to verify Clerk JWTs

Supabase needs to know Clerk's public key to verify the tokens.

### Option A: JWKS (recommended — tokens auto-rotate)

1. Go to **Clerk Dashboard** → your application → **API Keys**
2. Copy the **JWKS URL** — it looks like:
   `https://<your-clerk-domain>.clerk.accounts.dev/.well-known/jwks.json`
3. Go to **Supabase Dashboard** → **Project Settings** → **API** → **JWT Settings**
4. Under **JWT Secret**, select **"Use a JWKS URL"** and paste the Clerk JWKS URL.
5. Save.

### Option B: Shared secret (simpler, rotate manually)

1. Go to **Clerk Dashboard** → your application → **JWT Templates** (create one first — see Step 3)
2. Copy the **Signing key** from the template.
3. Go to **Supabase Dashboard** → **Project Settings** → **API** → **JWT Settings**
4. Paste the signing key as the **JWT Secret**.

---

## Step 3 — Create the Clerk JWT Template

1. Go to **Clerk Dashboard** → your application → **JWT Templates**
2. Click **New template**
3. Name it exactly: **`supabase`** (the code calls `session.getToken({ template: "supabase" })`)
4. Set the **Claims** to:
   ```json
   {
     "aud": "authenticated"
   }
   ```
   _(Keep it minimal — role and org come from the DB, not the JWT)_
5. Leave **Token lifetime** at the default (60 seconds is fine — the app fetches fresh tokens automatically)
6. Under **Signing algorithm**, choose the same algorithm used in Step 2
7. Save the template

**Why only `aud` in the claims?**
The RLS helpers (`get_my_org_id`, `get_my_role`) read from the `profiles` table
using `auth.jwt() ->> 'sub'` as the lookup key. The JWT only needs to establish
WHO the user is (`sub` = Clerk user ID). What they can do is determined by the DB.

---

## Step 4 — Set environment variables

In your `.env` file:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...   # from Clerk Dashboard → API Keys
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...       # public/anon key only

# ⛔  NEVER add:
# VITE_SUPABASE_SERVICE_ROLE_KEY=...     # server-only, never in browser bundle
```

---

## Step 5 — Seed or create profiles

Every Clerk user needs a row in the `profiles` table **before** they can access
protected data. There are two ways to get that row in place:

### Option A: Admin pre-creates profiles (recommended for existing teams)

In the **Supabase SQL Editor**, insert a profile for each user:

```sql
insert into profiles (
  id,                   -- any UUID (not the Clerk user ID)
  clerk_user_id,        -- the Clerk user ID (user_2abc...) from Clerk Dashboard
  organization_id,      -- UUID of your organization row
  full_name,
  email,
  role                  -- admin | project_manager | senior_electrical_engineer
                        -- electrical_engineer | qa_qc_engineer | hr | executive | client
) values (
  uuid_generate_v4(),
  'user_2abc123def456',   -- paste from Clerk Dashboard → Users → User ID
  'org-uuid-here',
  'Jane Smith',
  'jane@acme.com',
  'project_manager'
);
```

### Option B: Auto-creation on first login (via Clerk metadata)

1. In **Clerk Dashboard** → **Users** → select the user → **Metadata**
2. Under **Public metadata**, add:
   ```json
   {
     "organization_id": "your-org-uuid-here"
   }
   ```
3. On first sign-in, `ClerkAuthProvider` will automatically create the profile
   row with `role = 'electrical_engineer'` (minimum privilege).
4. An Admin can then change the role via a Supabase SQL update or future Admin UI.

⚠️  The `organization_id` in Clerk metadata is **only used for initial profile
creation** (bootstrap). After creation, the database value is authoritative.
Changing Clerk metadata later does NOT change the DB profile.

---

## Step 6 — Test the full flow

### Expected sign-in flow

1. User visits the app → redirected to `/login` (no `mep-role` in localStorage)
2. User clicks Clerk sign-in → Clerk auth completes → redirect back to app
3. `ClerkAuthProvider` detects Clerk session → shows loading spinner
4. `bootstrapProfile()` runs:
   - Fetches profile by `clerk_user_id`
   - If found: caches `role` and `organization_id` from DB
   - If not found: auto-creates (if org metadata present), or shows error
5. DB role is written to localStorage (syncs RBAC engine)
6. `isJwtReady = true` → Projects page shows real data from Supabase
7. Data-source banner disappears

### Verify in browser DevTools

```javascript
// Console — should see:
// [ElectraFlow] Supabase: configured ✓ https://...

// After sign-in, check:
localStorage.getItem("mep-role")  // should equal the DB role
```

### Verify in Supabase SQL Editor (while signed in)

Run in the SQL Editor to simulate what the app sees:
```sql
-- This only works after applying a test JWT via Supabase Auth debugging tools
select get_my_clerk_id();   -- should return your Clerk user ID
select get_my_org_id();     -- should return your org UUID
select get_my_role();       -- should return your role
select count(*) from projects where organization_id = get_my_org_id();
```

---

## What happens in each scenario

| Scenario | Behaviour |
|---|---|
| Supabase not configured | Mock data, "Demo mode" banner |
| Supabase configured, no Clerk | Mock data, "not connected yet" banner |
| Supabase + Clerk, no profile | "Account not configured" blocking screen |
| Supabase + Clerk, no org on profile | "Account not configured — not assigned to org" |
| Supabase + Clerk, profile ok | Real DB CRUD, no banner |
| Page refresh (Clerk signed in) | Clerk session persists → re-bootstrap → real DB |
| Sign out | All caches cleared (`mep-*`, org-id, profile cache, JWT getter) |
| Different user signs in | Previous user's caches wiped on sign-out |
| Token expires | `session.getToken()` fetches a fresh Clerk JWT automatically |
| Supabase down | React Query error state, "retry" button, no crash |
| RLS blocks query | Empty results (not an error), normal empty state UI |
| Engineer tries to edit project | Edit button hidden by RBAC; RLS blocks it at DB level too |
| Demo login (role selector) | Always mock mode, never hits Supabase |

---

## Security notes

### Service role key

```
⛔  The service role key MUST NEVER appear in a VITE_ environment variable.

✅  The service role key is for:
      • Supabase SQL Editor (admin queries)
      • Server-side only (Edge Functions, backend APIs)
      • Local database tools (supabase CLI, psql)

❌  NEVER:
      • VITE_SUPABASE_SERVICE_ROLE_KEY=...  (would be in browser bundle)
      • Import it in any frontend file
      • Use it to bypass RLS from the browser
```

### Role authority

```
Authorization source:   profiles.role (database)
Identity source:        Clerk JWT sub claim

The database ALWAYS wins if Clerk metadata and profiles.role differ.

Never trust:
  • Clerk user metadata role
  • localStorage mep-role (it's a cache of the DB role, not authoritative)
  • JWT claims other than sub (identity only)
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Account not configured" screen | No profile row for user | Admin creates profile in Supabase (Step 5) |
| Empty projects list after bootstrap | RLS blocking queries | Verify `get_my_org_id()` returns a non-null value |
| `get_my_org_id()` returns null | `clerk_user_id` not set on profile | Update profile row: `UPDATE profiles SET clerk_user_id = 'user_...' WHERE email = '...'` |
| JWT verification fails | Clerk JWKS URL or secret wrong in Supabase | Re-check Step 2 |
| Token `null` in logs | JWT template not named "supabase" exactly | Rename template in Clerk Dashboard |
| Demo mode still showing after Clerk login | `isJwtReady` not becoming true | Open DevTools → Application → check `mep-role` is set; check network for Supabase requests with Authorization header |
| Infinite loading spinner | `bootstrapProfile()` failing silently | Open DevTools Console, look for network errors or Supabase error messages |
