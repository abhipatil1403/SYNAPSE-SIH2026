# Supabase verification — Adi / SYNAPSE

Inspected **26 October 2026** through the connected Supabase integration and a read-only publishable-key network probe. This is a dated inspection, not a production certification.

**Phase 1 follow-up:** the following audit records the original pre-change state. A reproducible baseline and two additive corrective migrations are now implemented; the current state, authorization evidence and unresolved activation/write blockers are in [Phase 1 notes](phase1/README.md). The application and database preview gates remain disabled. The original legacy workflow findings below have not been silently declared fixed.

## Confirmed project

| Item | Observed result |
|---|---|
| Organization | Adi (`inwsanmygzmjwnimpvxw`) |
| Project | SYNAPSE (`xjnukuerzlrxjjqwmgkn`) |
| Region | ap-south-1 / Mumbai |
| Platform health | ACTIVE_HEALTHY |
| PostgreSQL | 17.11.0.003 |
| Application schema | `synapse` |
| Application tables | **69** (16 with RLS, 53 without) |
| Application functions | 30 |
| RLS policies | 32 |
| Catalog constraints / indexes / triggers | 440 / 166 / 12 |
| Auth users / internal users / cases | 0 / 0 / 0 |
| Storage buckets / Edge Functions | 0 / 0 |
| Supabase migration history | 0 entries |

The first manual count of 70 tables was corrected to **69** using the catalog query. The schema exists, but its operational data and authentication have not been provisioned. Empty migration history does not mean the schema is empty; preserve a baseline before applying new migrations.

## Verified access and network results

- `anon` and `authenticated` both lack `USAGE` on `synapse`.
- Catalog checks on `users`, `cases`, `bureaus`, and `audit_events` show neither role has SELECT or INSERT privileges on those sampled tables.
- Publishable-key GET `/auth/v1/health`: **200**.
- Publishable-key GET `/rest/v1/cases?select=case_id&limit=1` with `Accept-Profile: synapse`: **406, PGRST106**. The private schema is not exposed by PostgREST.
- `synapse.current_user_id()` with no trusted actor context returns NULL.
- Negative calls to `transition_case_status` and `dispose_case` without actor context both reject with SQLSTATE `28000`. Random, nonexistent identifiers were used; no application records were created or changed.

The table-discovery warning described missing RLS as public exposure. **The subsequent grant and HTTP checks do not support that conclusion for the current configuration.** Missing RLS still needs attention before exposing or granting a schema. Enabling RLS without appropriate policies would also break legitimate workflows. No blanket grants or blanket policies were applied.

## Integration blockers and inspected code risks

1. **Identity mapping:** `current_user_id()` reads `current_setting('synapse.user_id', true)`. `users.external_subject` exists, but the function does not verify an Auth subject. Do not expose a path that lets a browser set this value. Establish a trusted, suspension-aware `auth.uid()` mapping; no `user_metadata` or browser role is an authority source.
2. **Lifecycle mismatch:** deployed `transition_case_status` uses `DRAFT`, `NEW`, `ASSIGNED`, `UNDER_REVIEW`, `AWAITING_INFORMATION`, `ACTION_INITIATED`, `ESCALATED`, `DISPOSED`, `REOPENED`. The PRD proposes `REGISTERED`, `TRIAGED`, `ASSIGNED`, `IN_PROGRESS`, `RESOLUTION_REVIEW`, `ON_HOLD`, `DISPOSED`, `REOPENED`. These are not interchangeable. Keep submissions separate from cases, agree on a versioned mapping or reviewed migration, and retain state history.
3. **Administrator access:** `can_view_case`, `can_view_documents_for_case`, `has_scoped_role` and other helpers use `is_global_admin()` as a blanket bypass. The PRD explicitly says an administrator does not automatically receive confidential case access. Reconcile this policy before live queries.
4. **Closure validity:** `dispose_case` checks a final PASS evaluation, its latest timestamp ordering, checklist validity, stored evaluation items and approval existence. Code inspection did not find checks tying that evaluation to the current case version and current work/dependency state, or requiring the PRD's resolution-review state. Latest does not necessarily mean fresh.
5. **Approval authority:** the closure approval existence predicate checks authority of the calling actor, rather than validating the current authority of the recorded approver against the approval row. Review revocation and separation-of-duty behavior with restricted-role tests.
6. **Reopening:** `transition_case_status` clears `disposed_at`. Verify how review cycles and earlier dispositions are retained rather than relying only on that mutable field.
7. **Storage and configuration:** no private evidence bucket, Auth users, internal users, Bureaus, institutions, cases, or operational policy data are present. Evidence version metadata alone is not file isolation.
8. **Security advisor:** seven functions have mutable search paths: `current_user_id`, `reject_audit_mutation`, `enforce_symmetric_relationship_order`, `guard_case_update`, `guard_case_access_grant_write`, `guard_case_insert`, `guard_submission_insert`.
9. **Performance advisor:** 98 foreign-key covering-index suggestions were returned, plus unused-index information on this empty workload. Do not remove indexes because they are currently unused. Review high-volume case, work, document and audit query plans after realistic seeding.

Items 3–6 are findings from function inspection, **not demonstrated production exploits**. The two no-actor negative probes are a limited positive result, not comprehensive authorization coverage.

The dependency trigger does use a transaction advisory lock and a recursive reachability check for confirmed `DEPENDS_ON` relationships. That is a useful concurrency control; a concurrent multi-session cycle test remains required.

## Logs

The unified last-24-hour log distribution was queried: pooler, PostgREST, Auth, PostgreSQL, edge, realtime and storage streams are present. No claim is made that all log contents or error causes were reviewed. Full database, restricted-role and concurrency tests need an isolated seeded environment.

## Recorded artifacts

- `supabase-schema.snapshot.json`: actual deployed columns, constraints, indexes, function definitions, policies and triggers. Metadata only; no case or user content.
- `supabase-network-check.json`: repeatable HTTP probe results, with no API key in output.
- `../scripts/check-supabase.mjs`: run using `node --env-file=.env.local scripts/check-supabase.mjs`.
- `.env.local`: locally configured URL and **publishable** key only; ignored by Git. No secret/service-role key was retrieved or used.

## Required integration sequence

1. Baseline the existing schema and reconcile it with the database teammate's five-migration package; that package was not supplied here.
2. Agree on lifecycle semantics and administrator/case/document scopes.
3. Bind Auth to active internal users; separately provision approved role and Bureau memberships.
4. Harden privileged function execution and fixed search paths. Validate every definer function before exposing it.
5. Build appropriate RLS for the access model; then grant only required operations. Avoid browser-controlled identity/session settings.
6. Make intake registration, transfers, evaluation, approval, disposal and reopening transactionally enforce idempotency, current authority, row versions and provenance.
7. Create private evidence storage with versioned object paths, authorized short-lived signed URLs, file limits and scanning/quarantine policy.
8. Run normal and negative authorization tests, document-scope tests, stale-approval tests and concurrent graph/transfer/disposal tests in an isolated seeded environment.
9. Implement the live repository adapters against those verified contracts. Only then enable real mode.

No deployed schema, grants, users, policies, storage objects, or business records were mutated by this audit. The prototype deliberately does not enable live mode merely because a project and API key exist.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [search-path advisor](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [foreign-key index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [SSR identity guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
