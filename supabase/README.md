# ElectraFlow AI — Supabase

## Production setup (recommended)

**New empty Supabase project:**

1. Run **`manual/PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql`** in SQL Editor (once)
2. Run **`manual/VERIFY_PRODUCTION_SCHEMA.sql`**
3. Follow **`manual/RESET_AND_RUN_INSTRUCTIONS.md`**

Chunk fallback: **`manual/bootstrap_chunks/`** (01–06 in order)

## CLI migrations

```bash
supabase link --project-ref bpjxjxwgxcexuxhrcbkp
supabase db push   # fresh/empty remote only
```

Source of truth: `src/database/` → regenerated via:

```bash
python3 supabase/tools/build_production_bootstrap.py
```

## Manual post-bootstrap

- `manual/storage_buckets_and_policies.sql`
- `manual/realtime_publication.sql`
- Clerk JWT — `docs/phase-5-clerk-supabase-setup.md`

## Deprecated

Do not use scripts in **`manual/deprecated_recovery/`** for new deployments.
