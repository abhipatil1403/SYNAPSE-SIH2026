# Gated platform contracts

This milestone implements an isolated workflow engine, request-scoped Supabase transport, typed projections and a new gated workspace. It does **not** deploy a hosted platform RPC package or supersede Phase 2 NO-GO. `activation.reads` and `activation.businessWrites` in `lib/platform/repository.ts` are immutable false release gates; browser headers, Demo roles and environment flags cannot unlock them.

## HTTP boundary

Protected paths use `/api/phase1/platform/…`, so the existing HttpOnly `/api/phase1` cookie scope is preserved. There is no second browser-selected live identity or browser service client. The future adapter performs online Auth verification and current trusted internal identity resolution through the existing request-scoped server context. A new session-liveness check at the database boundary remains mandatory because the current public registry RPC can be called directly.

| Method/path | Contract |
|---|---|
| GET `snapshot` | Strict authorized `Snapshot`; no staff directory, Auth IDs, sessions, grants, receipts, storage keys or raw extraction fields |
| GET `cases?q=&status=&priority=&page=&pageSize=` | Validated filters; duplicates/unknown keys rejected; page size 1–50; authorized total and stable sort |
| GET `cases/:uuid` | Case plus authorized tasks/comments/activity/evidence/SLA/relationships/findings; missing/unauthorized objects share a 404 |
| GET `dashboard?period=7|30|90` | Same snapshot as registry; authorized case totals, current resolved cohort, seven disjoint local-day bins and recent data |
| GET `calendar` | Same selector for Overview and full Calendar; persisted SLA/task/scheduled activity indicators only |
| GET `reports` | Authorized workload and case projection; no unscoped export/data dump |
| POST `commands` | Strict `{idempotencyKey: uuid, command: discriminated union}`; all live business writes return 503 |

Responses are private/no-store, vary by Cookie and suppress raw SQL/storage/provider error details. Command validation rejects client actor fields. Expected-version failures are 409, validation is 400, missing/unauthorized records are 404 and disabled services are 503. No new endpoint accepts `synapse.user_id` or a Demo role.

`SupabasePlatformRepository` declares two **pending** user-JWT RPC contracts: `synapse_platform_snapshot()` and `synapse_platform_command(p_envelope jsonb)`. Their transport calls are implemented; the gates prevent invocation. They are **not deployed**, and no fallback to unsafe legacy workflow RPCs exists. A reviewed SQL/RLS package and transactional command authority are still required before enabling them. The only prepared SQL migration in this milestone is the separate managed-session fix.

## Record mappings

`database-shapes.ts` is generated from the preserved deployed catalog for 26 relevant tables. These TypeScript interfaces neither expose tables nor grant privileges. `mapDatabaseCase`, `mapTask` and `mapEvidence` validate field joins and deployed codes, preserve bigint/numeric text and nullable dates, and reject unsupported mappings. The existing fictional `Case`, `Actor`, `DemoState` and browser repository are unchanged.

| Platform concept | Preserved deployed source |
|---|---|
| Cases, versions, priorities | `cases`, `case_categories`, `institutions`, `bureaus`; `row_version` stays bigint text; URGENT is preserved |
| Draft/source/review/link | `case_submissions`, `submission_case_links`, `submission_translations`, `match_runs`, `match_candidates` |
| Tasks, comments, events | `case_work_items`, `case_comments`, `audit_events`; task status stays OPEN/IN_PROGRESS/BLOCKED/COMPLETED/CANCELLED |
| SLA/calendar | `sla_instances`, `sla_policy_versions`; future scheduled actions map from `regulatory_actions`, with no invented hearing table or dates |
| Access/coordination | `case_access_requests`, `case_access_grants`, `case_transfers`, `case_relationships`; DETAILS and DOCUMENTS remain separate |
| Evidence/provenance | `documents`, `document_versions`, `evidence_items`, `evidence_claims`, `claim_source_references` |
| Innovations | `policy_versions`, `conflict_rules/findings`, `contradiction_findings`, relationship and closure tables |
| Notifications/reporting | Recipient-filtered `notifications` and the same authorized case projection |

The engine's draft verification version, global transaction revision, idempotency receipt and closure fingerprint are supplemental workflow contracts. They have **no approved deployed storage fields yet**. A disposable `platform_test.state` JSON record stores them only for local integration tests. It is not an application persistence strategy or a new hosted schema proposal. The real Postgres test adapter mirrors core case/submission/link/task/comment/audit/notification writes into the original tables while serializing its receipt state in that disposable schema.

The transition adjacency graph uses raw deployed states as an **unapproved offline proposal**. UNDER_REVIEW is not silently renamed to the PRD's separate investigation/resolution-review stages. A live Intake Officer role, task row-version column, canonical hold/reopen cycle and scheduled-hearing entity are not invented. Their product/database mappings remain release prerequisites.

## Commands and transactions

The engine supports capture/verification/rejection/registration/association of drafts, persisted duplicate-candidate review, assignment/reassignment, priorities, legal status proposals, task creation/status, comments, relationship proposal/review, access request/decision, transfer request/decision, finding review, closure evaluation/disposal and notification acknowledgement.

Commands resolve an active explicit principal against staff state, authorize objects and active role/membership/grants, and commit state, audit, recipient notifications and idempotency receipt atomically. Parent case versions invalidate stale child edits/evaluations. A repeated key with the same command returns the prior result; a different payload conflicts. Concurrent updates serialize; the actual PostgreSQL test uses row locks and deployed `row_version` triggers. Failed operations roll back.

Registration increments the committed registry revision, retains original source/body/language, links the verified submission and emits invalidations for registry/dashboard/calendar/detail/coordination/notifications/intelligence. The UI reloads the same snapshot after success rather than adding a fictional optimistic case. It revalidates on focus/visibility and every 30 seconds, listens to cross-tab logout and aborts older requests so stale responses cannot restore cleared data.

Transfers require an independent approver currently authorized in **both** source and target Bureaus, and recheck the destination officer at completion. The single-dual-authority proposal is implemented/tested; an ordinary two-separate-approver production workflow still needs its reviewed database contract. No transfer resets SLA timestamps.

Access requests currently require existing authorized details to avoid an existence oracle. Discovery-only request creation and designated-approver resolution remain pending. A DETAILS grant alone cannot expose evidence/finding provenance. Graphs include only relationships whose endpoints are both visible.

## Four innovations

Conflict Sentinel generates rule-only candidates from explicitly supplied authorized actions, matching institution/campus/issue/overlapping time, approved policy references and known clean source versions. Contradiction candidates require differing sourced values in the same subject/predicate/campus/overlapping time with version/page/quote provenance. They do not claim which source is true, assign uncalibrated confidence or report an external AI scan as completed.

Relationships require human confirmation; confirmed dependencies are cycle-checked inside the transaction. Closure evaluates an approved current policy against evidence/clean scan, tasks, dependencies, findings and current approval authority. Disposal rechecks the case version, policy validity and a material-state fingerprint, with a 15-minute evaluation freshness limit. The offline limit is a proposed operational control, not an official AICTE policy. No finding automatically merges/transfers/disposes a case.

## Evidence architecture

`PrivateEvidenceService` validates file types, size, hash and safe filenames; generates server object paths; authorizes DOCUMENTS scope before reserving metadata; and leaves it quarantined until a trusted worker verifies bytes/hash and scan status. Download signing rechecks authorized version ownership and CLEAN state. `SupabasePrivateEvidenceTransport` uses the request user's Storage client, no service key, no public URL and no overwrite. Downloads are signed for at most 60 seconds; provider upload tokens last two hours and must remain quarantined. A signed URL may remain usable until its short expiry after later grant revocation; stricter proxy downloads would require a separate design.

The private bucket, metadata RPCs, RLS/object policies and trusted scanner are **not configured/deployed** by this milestone. Upload/download routes stay disabled. No object is uploaded, signed or downloaded in hosted tests. No malware or AI scan result is fabricated.

## Reproduce locally

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run baseline:check
npm.cmd run test:database:platform
npm.cmd run build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
# In a second terminal:
npm.cmd run test:e2e
```

The database harness accepts only a loopback cluster, creates a fresh `synapse_test_<uuid>` database and removes only that database/its test roles. It refuses an existing reader role to avoid reusing an unrelated test installation. PostgreSQL 17+ with pgcrypto/uuid-ossp is required; local execution used 18.1. `SYNAPSE_TEST_DATABASE_URL` is a test-only connection, never the operator `DATABASE_URL`. The GitHub workflow provisions an isolated PostgreSQL 18 service with per-run disposable credentials and never loads hosted operator configuration. CI execution must be reported separately from local passes.
