# Deployed baseline

`deployed-2026-10-26.catalog.json` was captured read-only from Adi / SYNAPSE before Phase 1 DDL. It includes the complete `synapse` application schema, its ACLs, seven trigger objects (twelve trigger-event rows), one discovery view, identity-sequence configuration, and the five existing reference-data tables. The SQL and SHA-256 manifest are generated deterministically by `node scripts/baseline.mjs`; verify with `node scripts/baseline.mjs --check`.

The baseline is intentionally **outside the migration chain**. Never apply it to the deployed database, mark it as an already-run migration, reset the project, or replace migration history. It is only an empty-database reconstruction input. Its first transaction aborts if `synapse` already exists.

Re-capture with `DATABASE_URL` set in the process environment and `SYNAPSE_BASELINE_OUTPUT` pointing to a new directory, then run `node scripts/baseline.mjs --capture`. Capture is a read-only transaction and refuses to overwrite an existing output. `scripts/sql/capture-baseline.sql` can also be executed through the connected SQL tool. Native `pg_dump` should additionally be used for a complete project backup once an authorized direct/pooler connection is available.

This is not a backup of managed Auth/Storage internals, passwords, sessions, operational records, extension binaries, infrastructure settings, or Supabase recovery configuration. Those are not changed or recreated by baseline replay. The local test harness supplies minimal `auth.uid()`/`auth.jwt()` test equivalents; they are never deployed to Supabase. Operational cases, internal users, institutions and Bureaus were empty at capture. Extension prerequisites are recorded in the catalog.

The local replay test verifies object definitions, counts, grants, and legacy function hashes before applying the additive Phase 1 migration. PostgreSQL 17+ with `pgcrypto` and `uuid-ossp` is required. The installed local test server uses PostgreSQL 18; the deployed server is PostgreSQL 17.11. A native PostgreSQL 17 replay remains recommended in CI.
