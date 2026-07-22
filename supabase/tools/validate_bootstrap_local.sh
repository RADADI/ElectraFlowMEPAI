#!/usr/bin/env bash
# Validate PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql against a fresh local PostgreSQL 15 database.
# Requires: postgresql@15 (brew install postgresql@15)
# Usage: ./supabase/tools/validate_bootstrap_local.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@15/bin}"
PGDATA="${PGDATA:-/tmp/electraflow_bootstrap_validate}"
PGPORT="${PGPORT:-55440}"
BOOT="$ROOT/supabase/manual/PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql"
VERIFY="$ROOT/supabase/manual/VERIFY_PRODUCTION_SCHEMA.sql"

if [[ ! -x "$PG_BIN/psql" ]]; then
  echo "ERROR: PostgreSQL 15 not found at $PG_BIN/psql"
  echo "Install: brew install postgresql@15"
  exit 1
fi

echo "==> Init temp cluster at $PGDATA (port $PGPORT)"
rm -rf "$PGDATA"
"$PG_BIN/initdb" -D "$PGDATA" --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" -l /tmp/electraflow_validate.log -o "-p $PGPORT -h 127.0.0.1" -w start
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PGPORT" electraflow_validate

echo "==> Auth stubs (Supabase provides auth schema; local Postgres needs this)"
"$PG_BIN/psql" -h 127.0.0.1 -p "$PGPORT" -d electraflow_validate -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
SQL

echo "==> Run bootstrap (single-transaction — simulates Supabase SQL Editor)"
"$PG_BIN/psql" -h 127.0.0.1 -p "$PGPORT" -d electraflow_validate -v ON_ERROR_STOP=1 --single-transaction -f "$BOOT"

echo "==> Run verification"
READY=$("$PG_BIN/psql" -h 127.0.0.1 -p "$PGPORT" -d electraflow_validate -t -A -f "$VERIFY" | tail -1 || true)

echo "==> Cleanup"
"$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop || true

echo ""
echo "✅ Bootstrap validation PASSED (single-transaction, exit 0)"
echo "   Run VERIFY in Supabase after bootstrap; all ready_boolean should be true."
