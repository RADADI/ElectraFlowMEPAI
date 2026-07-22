#!/usr/bin/env python3
"""Generate production bootstrap SQL from src/database migrations."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src/database"
MANUAL = ROOT / "supabase/manual"
CHUNKS = MANUAL / "bootstrap_chunks"
MIG = ROOT / "supabase/migrations"

# No BEGIN/COMMIT wrappers — Supabase SQL Editor may run the full script as one
# transaction; wrapping sections breaks enum ADD VALUE commit semantics.
MIGRATION_FILES = [
    ("001", "core_schema", "schema.sql", "plain"),
    ("002", "base_rls", "rls-policies.sql", "plain"),
    ("003", "phase5_clerk_jwt", "migration-phase5.sql", "plain"),
    ("004", "phase6_documents", "migration-phase6.sql", "plain"),
    ("005", "phase7_submittals_enum", "migration-phase7.sql", "enum_only", 14),
    ("005", "phase7_submittals_rest", "migration-phase7.sql", "rest", 14),
    ("006", "phase8_rfi_enum", "migration-phase8.sql", "enum_only", 16),
    ("006", "phase8_rfi_rest", "migration-phase8.sql", "rest", 16),
    ("007", "phase10_resources", "migration-phase10.sql", "plain"),
    ("008", "phase11_timesheets", "migration-phase11.sql", "plain"),
    ("009", "phase12_financials", "migration-phase12.sql", "plain"),
    ("010", "phase13_notifications", "migration-phase13.sql", "plain"),
    ("011", "phase14_analytics", "migration-phase14.sql", "plain"),
    ("012", "phase15a_meetings", "migration-phase15a.sql", "plain"),
    ("013", "phase15b_electrical", "migration-phase15b.sql", "plain"),
    ("014", "phase15c_ai", "migration-phase15c.sql", "plain"),
    ("015", "phase15d_client_portal", "migration-phase15d.sql", "plain"),
]

TIMESTAMPED = [
    "202607010001_schema.sql",
    "202607010002_rls_policies.sql",
    "202607010003_phase5_clerk_jwt.sql",
    "202607010004_phase6_documents_invites.sql",
    "202607010005_phase7_submittals.sql",
    "202607010006_phase8_rfi.sql",
    "202607010007_phase10_resources.sql",
    "202607010008_phase11_timesheets_leave.sql",
    "202607010009_phase12_financials.sql",
    "202607010010_phase13_notifications_activity.sql",
    "202607010011_phase14_analytics_reports.sql",
    "202607010012_phase15a_meetings.sql",
    "202607010013_phase15b_electrical.sql",
    "202607010014_phase15c_ai.sql",
    "202607010015_phase15d_client_portal.sql",
]

CHUNK_GROUPS = [
    ("01_core_schema.sql", ["001"]),
    ("02_base_rls_and_clerk.sql", ["002", "003"]),
    ("03_documents_submittals_rfi.sql", ["004", "005", "006"]),
    ("04_resources_timesheets_financials.sql", ["007", "008", "009"]),
    ("05_notifications_reports.sql", ["010", "011"]),
    ("06_meetings_electrical_ai_client_portal.sql", ["012", "013", "014", "015"]),
]

PRODUCTION_HEADER = """-- ===========================================================================
-- ElectraFlow AI — PRODUCTION BOOTSTRAP (full schema)
-- ===========================================================================
-- ⚠️  RUN ONLY ON A BRAND-NEW EMPTY SUPABASE PROJECT.
-- ⚠️  DO NOT run on a partially migrated database.
-- ⚠️  DO NOT run seed.sql on production.
-- ⚠️  Stop immediately on any error.
--
-- After success:
--   1. supabase/manual/VERIFY_PRODUCTION_SCHEMA.sql
--   2. supabase/manual/storage_buckets_and_policies.sql (create buckets first)
--   3. supabase/manual/realtime_publication.sql
--   4. Clerk JWT setup (docs/phase-5-clerk-supabase-setup.md)
--
-- Execution model:
--   • NO BEGIN/COMMIT wrappers (Supabase SQL Editor may use one outer transaction).
--   • rfi_status + submittal_status include all final values in schema.sql.
--   • Phase 7/8 ALTER TYPE ADD VALUE are idempotent no-ops on fresh DB.
--   • No COMMIT statements (safe inside Supabase SQL Editor single-transaction runs).
-- ===========================================================================

"""


def read_src(name: str) -> str:
    text = (SRC / name).read_text()
    return text[:-1] if text.endswith("\n") else text


def split_migration(name: str, after_line: int) -> tuple[str, str]:
    lines = read_src(name).splitlines()
    return "\n".join(lines[:after_line]), "\n".join(lines[after_line:])


def section_body(entry: tuple) -> str:
    num, slug, fname, mode, *rest = entry
    if mode == "plain":
        return read_src(fname)
    if mode == "enum_only":
        body, _ = split_migration(fname, rest[0])
        return body
    if mode == "rest":
        _, body = split_migration(fname, rest[0])
        return body
    raise ValueError(mode)


def format_section(entry: tuple) -> list[str]:
    num, slug, fname, mode, *rest = entry
    lines = [
        "-- =====================================================",
        f"-- {num} {slug}",
        f"-- Source: {fname}" + (f" (split {mode})" if mode not in ("plain",) else ""),
        "-- =====================================================",
        "",
    ]
    body = section_body(entry)
    if mode == "enum_only":
        lines += [
            "-- NOTE: Enum extension (idempotent no-op on fresh DB — values defined in schema.sql).",
            "",
            body,
        ]
    elif mode == "rest" and "enum" in slug:
        lines += [
            "-- NOTE: Runs after enum values committed (schema.sql already defines full enums on fresh DB).",
            "",
            body,
        ]
    else:
        lines += [body]
    lines += ["", f"-- ✅ END {num} {slug}", ""]
    return lines


def build_full(sections: list[tuple]) -> str:
    parts = [PRODUCTION_HEADER]
    for entry in sections:
        parts.extend(format_section(entry))
    parts.append("-- ✅ PRODUCTION BOOTSTRAP COMPLETE")
    parts.append("")
    return "\n".join(parts)


def sync_migrations() -> None:
    MIG.mkdir(parents=True, exist_ok=True)
    pairs = [
        "schema.sql",
        "rls-policies.sql",
        "migration-phase5.sql",
        "migration-phase6.sql",
        "migration-phase7.sql",
        "migration-phase8.sql",
        "migration-phase10.sql",
        "migration-phase11.sql",
        "migration-phase12.sql",
        "migration-phase13.sql",
        "migration-phase14.sql",
        "migration-phase15a.sql",
        "migration-phase15b.sql",
        "migration-phase15c.sql",
        "migration-phase15d.sql",
    ]
    for src, dst in zip(pairs, TIMESTAMPED):
        (MIG / dst).write_text(read_src(src) + "\n")


def main() -> None:
    CHUNKS.mkdir(parents=True, exist_ok=True)
    all_entries = MIGRATION_FILES

    bootstrap = build_full(all_entries)
    (MANUAL / "PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql").write_text(bootstrap)

    chunk_header = """-- ElectraFlow AI — Bootstrap chunk (run in numeric order on EMPTY database only)
-- See supabase/manual/RESET_AND_RUN_INSTRUCTIONS.md

"""
    for chunk_name, nums in CHUNK_GROUPS:
        entries = [e for e in all_entries if e[0] in nums]
        content = chunk_header + build_full(entries).replace(PRODUCTION_HEADER, "")
        (CHUNKS / chunk_name).write_text(content)

    sync_migrations()
    print(f"Wrote {MANUAL / 'PRODUCTION_BOOTSTRAP_FULL_SCHEMA.sql'}")
    print(f"Wrote {len(CHUNK_GROUPS)} chunk files")
    print(f"Synced {len(TIMESTAMPED)} supabase/migrations")


if __name__ == "__main__":
    main()
