# SYNAPSE Phase 3–5 implementation milestone

**Security decision: activation BLOCKED.** Live Mode, persistent read-only preview and hosted business writes remain disabled. This milestone adds a tested platform foundation and gated UI; it does not claim that Phases 3–5 are operational on hosted Supabase. Phase 2's NO-GO remains binding.

## Completed implementation

- A separate database-aligned platform contract, validated command envelope, explicit principal/role/membership/object checks, Supabase user-JWT repository transport, exact bigint mappings and safe error categories. There is no cast from hosted rows to fictional DemoState.
- Atomic offline workflows for original intake capture, verification/rejection, human duplicate-candidate review, registration/association, assignment, priority/status updates, comments, tasks, access decisions, transfers, relationships, finding review, closure and recipient notifications. Idempotency, optimistic concurrency, audit and invalidation are part of the same transaction.
- A disposable PostgreSQL adapter that persists core case/submission/link/task/comment/audit/notification changes into the **actual original table shapes**. Its supplemental state/receipt record exists only in an isolated test schema, never hosted Supabase.
- One authorized registry/dashboard/calendar/report projection. Registration and task changes update the same committed snapshot; counts reconcile, SLA instances do not inflate case totals, India civil-day buckets have disjoint boundaries and chart bars retain a zero baseline.
- A `/platform` workspace with Overview, registry, details, intake review, tasks, calendar, coordination, intelligence, notifications and reports. Real server routes are under `/api/phase1/platform` to reuse the existing HttpOnly cookie scope. Current hosted requests return a clear locked state; no fictional values appear as live data.
- Rule-based, provenance-preserving Conflict Sentinel and Contradiction candidate functions; transactional dependency cycle checks; human finding review; closure prerequisites/current-policy/material-fingerprint/freshness checks. Unsupported AI/extraction/translation/scanning services stay explicitly disabled.
- Private evidence upload/download architecture using a request-user Storage client, server-generated keys, no overwrite/public URLs, quarantined metadata and short download signing after authorization. The bucket/policies/scanner/metadata RPC deployment remains pending; no hosted upload was performed.
- A managed-session liveness candidate with exact owner instructions, narrow RLS grants, local regression tests and rollback considerations. It is **unapplied** and kept outside the ordinary migration directory.
- Git initialization against the user-specified repository, an immutable baseline commit, logical feature commits, a local-only CI workflow, staged secret checks and exact-byte preservation for hashed schema artifacts.

The existing Fernly-inspired dashboard, larger charts/gauge, shared Demo calendar, responsive behavior and fictional workflows remain intact. Only an additional link to the isolated platform shell was added to the existing read-only preview. Original design/reference folders were preserved locally and not added to this feature's Git history.

## Feature readiness matrix

| Capability | Implemented/actually exercised | Hosted readiness |
|---|---|---|
| Trusted Auth identity, login/refresh/logout | Existing Phase 2 code preserved; current original-token expiry check passed; prior actual two-officer session evidence retained | NO-GO until direct-RPC provider-session liveness is fixed |
| Supabase platform repositories | Request-scoped publishable-key/user-JWT calls, strict response parsing, no actor arguments or unsafe legacy fallback | BLOCKED: immutable release gates; `synapse_platform_snapshot/command` RPC SQL/RLS package not deployed |
| Registry/filter/page/detail | Query service + UI; authorized fixtures and 404 isolation exercised | BLOCKED pending approved aggregate/detail RPCs |
| Intake/verification/registration | Atomic engine and actual local PostgreSQL submission/case/link/audit/notification writes; browser registration→registry→Overview exercised | BLOCKED: live intake role/lifecycle mapping, receipt/version storage and approved transactional RPC |
| Duplicate candidate review | Persisted authorized candidate contract + human review/association tested; original source preserved | MOCKED foundation; no matching/model scan or external mailbox connector configured |
| Assignment/priority/status | Role/member checks, raw deployed codes, expected-version conflicts; actual local priority/status persistence tested | BLOCKED: offline adjacency proposal is not an approved live lifecycle mapping |
| Tasks/comments/activity | Engine and actual local table writes; completion constraints and calendar updates tested | BLOCKED pending scoped RPCs; task type mapping fails closed if unsupported |
| SLA and Calendar | Shared authorized selector for deadlines/work items/supplied scheduled records; India day handling and navigation tested | BLOCKED: no new hosted scheduled-event adapter deployed; no invented hearing records |
| Dashboard/analytics/workload | All requested sections use the same strict snapshot; counts and invalidation tested | BLOCKED: database aggregate/read RPC package remains pending |
| Bureau access/transfer | Scoped requests/decisions; separate DOCUMENTS grants; independent dual-Bureau transfer authority and current destination checks tested | MOCKED domain foundation; ordinary two-separate-approver/discovery-only workflow remains pending |
| Relationships/dependencies | Both-endpoint scope, proposal/human confirmation, transactional cycle detection/navigation | MOCKED domain foundation; no hosted relationship write authority enabled |
| Evidence | Validated metadata/join projection, upload reservation/signing architecture, quarantine/CLEAN read checks, request-user SDK transport | BLOCKED: bucket/object policies, metadata RPCs and trusted scanner not deployed |
| Notifications/reporting | Recipient/case filtering, acknowledgement command and authorized workload report; local notification rows tested | BLOCKED: external delivery/jobs/export policy not implemented |
| Conflict Sentinel | Approved versioned rule + action context + authorized source provenance; explainable human-review candidates tested | MOCKED/rule-only foundation; no external AI scan/official policy conclusion claimed |
| Contradiction Detector | Version/page/quote provenance and matching context; missing/unauthorized sources rejected | MOCKED/rule-only foundation; extraction/model service absent |
| Dependency Graph | Typed scoped edges and cycle rejection tested; case navigation provided | BLOCKED for hosted writes; no unrestricted graph expansion |
| Resolution Quality Gate | Current approved policy, clean verified evidence, tasks, dependencies, findings and current authority; stale fingerprints/disallowed disposal tested | MOCKED domain foundation; deployed checklist/approval/cycle contract and row-lock transaction need review |
| Demo Mode | Full existing regression suite retained | PASS locally; remains the working delivered mode |

“MOCKED” means explicitly isolated test input; it is not a hosted end-to-end success. The new workspace has no production fixture endpoint, browser role selector or Demo repository fallback. Browser tests intercept HTTP only inside Playwright and label the fixture source.

## Database/API contracts

See [API_CONTRACTS.md](API_CONTRACTS.md) for route payloads, mappings, command semantics, privacy boundaries and reproduction. Typed shapes cover 26 relevant deployed tables without granting access. Original table names, role codes, task states, priority URGENT, nullable dates and bigint precision are retained.

The new snapshot/command RPC names are **pending contracts**, not secretly deployed functions. Their future SQL/RLS implementation, authority and idempotency/closure metadata storage must be reviewed before changing any gate. The isolated `platform_test.state` table must never be promoted as live application persistence. Local tests use a verified loopback UUID-named disposable database and remove it afterward.

The browser refetches after successful commands using private/no-store responses. Focus/visibility and timed revalidation, cross-tab logout clearing, abort controllers and request generations prevent older responses from restoring cleared data. The existing `/api/phase1` HttpOnly cookie path is preserved rather than widened.

## Security remediation status

The exact difference is verified in the preserved Phase 2 code: SYNAPSE logout records an application tombstone then calls provider sign-out; provider-only logout removes the managed session without that tombstone. The direct registry already checks application revocation, but lacks provider-session liveness.

Prepared candidate: `supabase/candidates/20261026140913_phase3_verified_session_liveness.sql`. SHA-256 and status are in `migration-review.json`; details and exact owner procedure are in [SESSION_REMEDIATION.md](SESSION_REMEDIATION.md). It uses a NOLOGIN/NOINHERIT/NOBYPASSRLS validator owning no source table, only three managed-session columns, subject+session RLS, a parameterless private helper and no API-role helper execution. Both gates remain off.

**Hosted application: BLOCKED / NOT RUN.** Current authorized operator cannot assume `supabase_auth_admin`, the session-table owner. No managed-schema policy, broad grant, BYPASSRLS workaround, role reset or database reset was attempted. Local simulated session tests pass; they do not prove the hosted fix.

Managed advisor access is **now available** (unlike the historical sign-off). It executed and reported warnings: three [authenticated definer RPCs / 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), seven [legacy mutable search paths / 0011](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). A successful advisor call is not a clean security result or owner approval. These warnings were not “fixed” by revoking working functionality or weakening RLS.

Safe hosted read-only audit reconfirmed the three applied migrations, all 30 original legacy functions, original table/constraint/policy/grant/reference integrity and the approved distinct Bureau scopes. The original pinned JWT again received explicit gateway expiry rejection. No new hosted identity, fixture, business row, bucket or workflow permission was created by this milestone.

## Test results

| Check | Status and actual scope |
|---|---|
| Unit | **PASS — 88/88** (72 preserved tests plus 16 platform tests) |
| Full browser regression | **PASS — 27/27**, 2.9 minutes, production Edge; 4 new platform tests are explicitly MOCKED |
| Focused platform browser suite | **PASS — 4/4** against the isolated engine fixture |
| Locked app/provider HTTP | **PASS — 15/15**; real provider denials and locked routes, not live business operation |
| Typecheck/lint/build | **PASS**; Next route type generation, zero lint warnings and optimized production build |
| Baseline/hash verification | **PASS**; exact baseline and staged artifact hashes preserved |
| Disposable PostgreSQL | **PASS**; 69 original assertions + local candidate checks + five persisted-workflow scenario groups |
| Hosted catalog/integrity/original expiry | **PASS** read-only; all three applied migrations, 30 original functions and original schema preserved |
| Managed advisor | **PASS — call executed with warnings**, not a clean security sign-off |
| Candidate hosted application | **BLOCKED — missing authorized managed owner/approval**; NOT RUN |
| New hosted platform read/write workflows | **BLOCKED / NOT RUN**; missing reviewed RPC/RLS/storage/command package |
| Hosted provider-only logout regression after candidate | **BLOCKED / NOT RUN** because candidate is unapplied; Phase 2 confirmed FAIL is retained |
| External AI/scanner/delivery services | **NOT RUN** — unsupported services remain disabled |

Generated `verification-results.json` records completion timestamps and output hashes locally; sensitive/generated evidence remains ignored by Git. Latest command completion times (UTC):

- unit: 2026-10-26T14:58:05.324718+00:00
- browser: 2026-10-26T15:06:27.967660+00:00
- focused_browser: 2026-10-26T14:53:40.261266+00:00
- typecheck: 2026-10-26T15:04:37.626529+00:00
- lint: 2026-10-26T15:05:40.516242+00:00
- build: 2026-10-26T15:01:53.146950+00:00
- locked_http: 2026-10-26T15:06:31.335201+00:00
- baseline: 2026-10-26T15:06:38.544485+00:00


The focused browser suite exercises locked-by-default behavior and role-header rejection, filter/detail commands, shared calendar, responsive layout, authorization-loss clearing and verified intake registration updating registry/Overview. Its working command backend is the isolated engine via test-only HTTP interception—not hosted Supabase.

The original SQL suites execute 49 + 20 assertions in the disposable baseline. The candidate adds simulated provider-session deletion, cross-subject/expiry and private-helper-grant checks. Five persisted-workflow scenario groups then exercise actual original-table writes, idempotency, concurrent `row_version` conflicts, task/calendar consistency, comments/transitions and application-scope denial. RLS/JWT hosted certification is not inferred from the local operator test adapter.

Early checks caught and fixed: legacy INSERT triggers firing during draft UPSERT (changed to explicit UPDATE), test snapshot canonicalization inadvertently incrementing versions (database rows now define the transaction preimage), exact browser select locators, stale Next route types after path movement (`typecheck` now runs `next typegen`), and an old local Next server referencing removed build chunks (verified process restart). All reported passes must come from the final successful reruns.

## GitHub delivery

The supplied remote was empty, and this workspace had no `.git` metadata. It was initialized on `feature/synapse-phase3-5-platform`; `main` was seeded with the preserved prototype/Phase 1–2 baseline to provide a review base. No force push, branch-protection bypass, merge or live deployment was performed.

| Commit | Scope |
|---|---|
| `42426ae` | Preserved existing prototype and Phase 1–2 security work; pushed as initial `main` |
| `af8a384` | Gated contracts/engine/mappings, security candidate, isolated Postgres tests, CI and exact baseline-byte handling |
| `b58c49c` | Gated platform workspace and browser-tested intake/dashboard flow |

Feature branch push/PR evidence is recorded in [GITHUB_DELIVERY.md](GITHUB_DELIVERY.md) after remote confirmation. The commits above are real local commits; push and PR creation are not inferred from them.

Actual env files, certificates, passwords, JWTs, screenshots, local logs and generated security receipts are ignored. Staged bytes are scanned for configured private values and approved emails before commits; baseline bytes are checked against the original SHA manifest. `.gitattributes` prevents Git from normalizing the mixed source-function line endings in the captured baseline SQL. The restoration is byte preservation, not a deployed schema change.

The GitHub workflow runs only local unit/type/lint/build/disposable Postgres checks, with no hosted operator secrets. Its remote execution result is separate from local evidence and must not be assumed passing merely because a push succeeded.

The first Linux CI run failed at baseline collection ordering: `en_US.utf8` ordered names such as `cases` and `case_statuses` differently from the captured catalog. The harness now sorts unordered catalog/reference rows by their identities before exact comparison. It retains every definition, grant, reference value and ordered table-column array; the captured SQL/catalog bytes and their hashes are unchanged. The complete disposable PostgreSQL suite passed again locally after this portability correction. Current remote CI evidence is recorded in [GITHUB_DELIVERY.md](GITHUB_DELIVERY.md).

## Remaining activation blockers and next steps

1. Obtain authorized managed-session owner review and apply the exact candidate only through the documented approved path. Prove unchanged JWT rejection immediately after provider-only logout for all protected direct read RPCs, alongside application logout, refresh, suspension/revocation, expiry and two-Bureau isolation.
2. Resolve the remaining advisor/security findings and obtain independent security sign-off. Keep both existing gates and new platform release constants closed until that decision.
3. Review/deploy the new aggregate/detail/read and transactional command RPC package, including every exposed source's RLS, permissions, object visibility, exact lifecycle/intake/approval semantics and durable idempotency/closure fingerprint storage. The engine's offline contracts are not deployment authorization.
4. Configure a private bucket, authorized metadata/signing/object policies, trusted byte/hash/malware verification and recovery path before evidence writes. Configure real source integrations/model services/jobs only with approved provenance and explicit unsupported states.
5. Verify HTTPS Secure-cookie delivery, MFA/session/throttling policy, storage/download revocation semantics, concurrency/load, backup/recovery, reporting/export policy and all ordinary multi-approver workflows on an authorized staging environment.
6. Rerun hosted issued-JWT/SQL/HTTP/browser checks and record the actual activation decision. Enabling business writes is a separate approval from read-only preview. Do not unlock by changing a browser role or adding a key.

No instruction in this milestone grants permission to activate Live Mode. The supported delivered experience remains Demo Mode plus a locked platform shell; the new workflow behavior is runnable and tested in explicitly isolated environments.
