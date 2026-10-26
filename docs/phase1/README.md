# Phase 1: authenticated read-only registry

Status: **implemented; Live Mode, business writes and read-preview activation remain disabled**. Adi / SYNAPSE was baselined before DDL. The existing UI and browser-local Demo Mode remain separate and working.

## Reproducible baseline

`supabase/baseline/deployed-2026-10-26.catalog.json`, its deterministic SQL and SHA-256 manifest reconstruct all 69 original application tables, 630 table columns, 440 constraints, 30 functions, 32 policies, seven trigger objects, one eight-column view, sequence settings and grants. The earlier information-schema snapshot's 638-column count also included those eight view columns. Five reference tables retain their original rows. No operational dataset, Auth passwords/sessions or managed-service configuration is included. This is an application-schema baseline, **not a full Supabase disaster-recovery backup**.

`npm.cmd run baseline:check` verifies the generated artifacts. `npm.cmd run test:database` restores only into a fresh UUID-named database on loopback, compares exact table/constraint/index/function/policy/trigger/view/sequence/grant/reference definitions, verifies refusal to restore over an existing schema, then applies both corrective migrations and runs authorization tests. It removes only that newly created disposable database. PostgreSQL 18.1 was used locally; the deployed PostgreSQL 17.11 executed the same authorization SQL successfully. A native PostgreSQL 17 restore and full project recovery test remain open.

See `supabase/baseline/README.md` for capture instructions. No deployed reset, baseline replay, migration-history repair, or destructive schema operation was performed.

## Reconciled contracts

| Concept | Phase 1 decision |
|---|---|
| NEW | Read label `Registered · legacy New`; database code stays NEW |
| ASSIGNED / DISPOSED / REOPENED | Shared labels; no new write authority or closure guarantees implied |
| UNDER_REVIEW | Preserve raw value; cannot distinguish investigation from final resolution review |
| AWAITING_INFORMATION | Preserve raw value; do not equate with ON_HOLD or pause an SLA |
| ACTION_INITIATED / ESCALATED | Preserve legacy semantics; no silent canonical rewrite |
| DRAFT case rows | Excluded from registered-case list; submissions remain separate |
| TRIAGED / IN_PROGRESS / RESOLUTION_REVIEW / ON_HOLD | Demo/canonical proposal preserved; persisted transition mapping remains blocked |
| Tasks | OPEN → To Do, IN_PROGRESS → In Progress, COMPLETED → Done as proposed read mappings; BLOCKED/CANCELLED have no existing UI equivalent, In Review has no deployed equivalent. No task write integration added |
| Priorities | LOW → Low, NORMAL → Medium, HIGH → High, URGENT → Urgent; no downgrade or loss of urgency |
| Roles | Raw codes are retained. SYSTEM_ADMIN is configuration only. SENIOR_MANAGEMENT/REVIEWER require explicit case grants. Heads/Auditors require valid role scope and Bureau membership; Case Officers require assignment or approved case grants. Multiple active roles supported. No live Intake Officer role is invented |
| Record shapes | Separate `LiveCase` DTO, never a cast to DemoState. UUID identity and string case number/row version; normalized labels joined under authorization; nullable SLA deadline retained; no embedded documents, notes or fabricated cycle fields |

Definitions and runtime validation are in `lib/live/contracts.ts`. Legacy `lib/types.ts`, seed roles, workflows and taxonomies are unchanged. Before writes, the product/database owners must approve a versioned lifecycle and role contract rather than rename semantically different states.

## Trust and access path

1. `/live-preview` is isolated from DemoProvider. It never reads a Demo role or local-storage identity.
2. All protected reads go through `/api/phase1/*` Route Handlers. A fresh server-only Supabase client is constructed per request using the publishable key and session cookies.
3. `auth.getUser()` performs online Auth validation. Session cookies are HttpOnly, SameSite Lax, Secure on HTTPS and scoped to `/api/phase1`. Route Handlers own refresh cookie/header writes; no private Server Component cache or browser Supabase client is used.
4. The user's JWT is forwarded by the SDK to two public RPCs. PostgREST verifies its signature. The SQL subject helper accepts only the gateway's authenticated-user claims, resolves `auth_identity_links` to an ACTIVE internal user, and rechecks current assignments/memberships/grants. No email or metadata auto-provisioning exists.
5. RPCs execute as `synapse_case_reader`: NOLOGIN, NOINHERIT, NOBYPASSRLS, no source-table ownership, selected read columns only, no table writes or legacy workflow/helper execution. Every source table available to it has RLS. The private schema remains unexposed, with no USAGE/table grants to anon/authenticated.
6. The two old SELECT policies are restricted to their original sole effective SELECT grantee, synapse_app. Their predicates and all 30 legacy functions remain unchanged. Existing lookup permissions are preserved explicitly when enabling RLS.

The registry is paginated (maximum 50), filterable and deterministically sorted. Search treats `%`/`_` as literal text; it counts only authorized rows. Case numbers/versions remain strings to avoid bigint precision loss. Earliest outstanding **case-level** SLA is selected without multiplying case counts; no SLA is displayed as `Not configured`. Other officers are represented by their actual UUID until a separately scoped directory contract is approved; fictional names are never substituted. Live case-detail navigation, evidence, exports and all case writes are intentionally absent from this first list workflow.

API request bodies/queries reject client actors, roles, unknown fields and duplicate parameters. Sign-in requires same-origin JSON, a bounded 4096-byte body and valid credentials; Supabase Auth supplies provider rate limiting. Responses are private/no-store and never return session tokens, SQL errors or document fields. The registry refreshes on focus/visibility and every 30 seconds while visible; authorization loss clears its results.

## Switches and credentials

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: already configured locally; used only server-side for this workflow. No service/secret key is required.
- `SYNAPSE_PHASE1_READ_ENABLED`: defaults false; server preview gate. Kept off in the delivered app.
- `SYNAPSE_APP_ORIGIN`: trusted origin for Auth POST checks; defaults to local development origin. Set explicitly for a deployed HTTPS preview.
- `synapse.phase1_access_config.read_enabled`: defaults false; remains false on the deployed DB after tests.
- `NEXT_PUBLIC_APP_MODE`: unchanged. Any non-demo mode still renders the existing integration block.
- `DATABASE_URL`: optional operator-only baseline capture connection; never used by the running web app or sent to browsers.

The delivered HTTP verification runs with the server gate off and checks locked-route behavior plus real Supabase provider denials. It never changes any readiness switch or application mode. Starting a separate enabled-preview test process was rejected by automatic approval review (the tool supplied only `blocked by policy`); no alternate activation method was attempted. Enabled-preview HTTP checks remain unverified. A future `--approved-preview` test profile is available only after a separately approved, already running preview exists; the script itself never enables it.

## Verification and limits

`supabase/tests/phase1-authorization.sql` runs synthetic fixtures in one rolled-back transaction. A deferred FK allows synthetic subject IDs without creating Auth users; it remains initially immediate for normal operations. Explicit fixture case numbers avoid sequence advancement. These tests verify SQL authorization under simulated claims, **not JWT issuance**. The hosted 49 checks include anonymous/service-key denial, forged metadata/legacy identity denial, malformed subjects, role/scope isolation, no Admin bypass, separate DOCUMENTS scope, expiration/revocation/suspension, pagination/query validation, RLS ownership and write denial.

`deployed-database-results.json` records the hosted result, gate state, counts, RPC ownership/ACLs and unchanged legacy hashes. `local-database-results.json` records replay and local authorization verification. HTTP and UI verification are recorded separately; UI contract fixtures are explicitly test-only and cannot be reported as live data or real Auth success.

Final application verification: **58/58 unit tests, 21/21 production browser tests, 49/49 hosted SQL authorization assertions, and 15/15 locked-app/provider HTTP checks**. Baseline integrity/replay, typecheck, zero-warning lint and production build passed. Browser checks include the original 18 workflows and three Phase 1 tests: locked-by-default isolation, test-contract UI filters/pagination/sign-out, and clearing results after authorization loss. Test-only registry fixtures never reach Supabase. The first browser run failed on an overbroad test text locator; its exact-text correction passed in the final full run. The Auth provider returns 403 `bad_jwt` for forged JWTs, while the Data API returns 401; both actual negative responses are recorded. This does not certify a positive Auth session.

After the user resumed this work, an optional final read-only catalog refresh was denied by the Supabase connector (`You do not have permission to perform this action`). No retry or alternate privileged access was attempted. The hosted migration/authorization results remain the previously successful, timestamped verification in `deployed-database-results.json`; no later catalog refresh is claimed. Locked-app and publishable-key provider checks passed again after resumption.

## Unresolved activation/write blockers

1. No approved Auth account, internal user, membership or identity link exists. Provision through an authorized administrator using actual Auth user IDs and approved internal identities; never auto-map by email or accept client roles. No such identity was created by this work.
2. Real issued-JWT positive login → registry, token refresh, logout/revocation, two-account isolation and session-cookie end-to-end tests remain blocked on approved accounts. Negative HTTP and SQL-claim tests cannot substitute for them.
3. Independent review/signoff of the two intentional SECURITY DEFINER RPC boundaries is required before unlocking. Their owner enforces RLS and has no writes; the Supabase advisor still reports their callable-definer shape. See `https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable`.
4. Seven legacy mutable-search-path warnings, legacy administrator/Bureau/write authorization, closure freshness/current approver authority, transfer validity, optimistic concurrency, reopening history, intake idempotency and grant revocation remain write blockers. Phase 1 does not expose these operations.
5. Private evidence storage/scanning, approved policy versions, task/intake/finding transactions, jobs, live reporting/audit contracts, realistic-load testing and full backup/recovery remain future prerequisites.

Do not enable business writes or set app mode to live after merely providing an API key. Approval/provisioning and real-session security checks must complete first.
