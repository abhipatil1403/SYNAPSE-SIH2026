# SYNAPSE feature readiness

Assessment: 27 October 2026 India time. **Final acceptance: AWAITING USER MANUAL TESTING. Hosted activation: NO-GO.**

`IMPLEMENTED` below means executable application code, not completed hosted release. `READY FOR USER TEST` refers only to the explicitly isolated local PostgreSQL workspace described in the [manual guide](SYNAPSE_MANUAL_TEST_GUIDE.md). The original Demo pages remain separate. No row below claims all existing frontend pages now use hosted operational data.

| Feature | IMPLEMENTED | CONNECTED TO HOSTED BACKEND | READY FOR USER TEST | BLOCKED / NOT IMPLEMENTED |
|---|---|---|---|---|
| 1. Institution/case registry | Normalized unique Permanent IDs, profile create/correction, original source, verified intake/unique case numbers, ownership/categories/history and persistence | **Auth/approval only; operational writes NO** | **YES, isolated**; create own fictional records | Hosted transactional repository and reviewed schema/lifecycle release |
| 2. Case tracking/Kanban | Raw deployed lifecycle, accessible drag/drop and form transitions, versions, assignment/comments/tasks, versioned byte attachments, Quality Gate disposal | Auth only; **hosted operations NO** | **YES, isolated**; approval functions require explicit local head delegation | Hosted storage/RLS/workflow release; actual binary scanner unconfigured; versioned reopening **NOT IMPLEMENTED** |
| 3. Cross-Bureau visibility | Explicit opt-in minimal discovery, independent requests/approval/rejection, separately scoped documents, expiring grants/revocation | Auth only; **hosted grants NO** | **YES, isolated** with A/B and independent local reviewers | Hosted case-grant write/RLS review; multi-Bureau flattened identity DTO fails closed |
| 4. Coordination | Typed relationships, lead Bureau ownership, comments/responsibility tasks, cycle-checked dependencies, ordinary independent source/destination transfers, linked notifications | Auth only; **hosted operations NO** | **YES, isolated** after review-role delegation | Hosted transaction/notification contracts; formal regulatory referral lifecycle **NOT IMPLEMENTED** beyond persisted REFERRAL actions/tasks |
| 5. SLA/escalation | Explicit versioned development policies/deadlines, computed overdue, durable scheduled reminders and head escalation notifications, idempotent delivery | **NO hosted schedule**; prior hosted worker candidate stays unapplied | **YES, isolated**, with explicit policy and worker | Production policy approval/scheduler/monitoring; automatic case-state escalation is deliberately absent |
| 6. Dashboard/search/analytics | Database-derived metrics, workloads/categories/ageing/regions, resolution, recent cases/activity, shared interactive Calendar, search/paging/scoped report | **NO hosted operational dashboard**; original overview remains Demo | **YES, isolated** `/platform/dashboard`, `/analytics`, `/calendar`, `/reports` | Hosted query/RLS release; institutional/regional values require user-entered development data |
| 7. Semantic overlap | Actual Gemini transport, normalized institution/fingerprints, indexed bounded shortlist, current candidate authorization, category/course/issue/date explanations, persisted human decisions; actual embedding category suggestions | **NO actual Google result verified** | Exact local fingerprint/review paths only; **provider test BLOCKED** | Missing approved-project API key/billing/access and actual inference test; thresholds uncalibrated; no automerge |
| 8. Relationship/conflict graph | Authorized institution/case/Bureau/officer/recorded-action graph, text/Bureau/type filters, navigation, dependencies, explainable inspection/approval-action conflicts and audit | Auth only; **hosted graph writes NO** | **YES, isolated**, with actual owner-created action records | Production policy interpretation and hosted release; no inferred legal contradiction or fake AI verdict |
| 9. Email intake | Gmail readonly OAuth2/PKCE, exact mailbox match, labelled history/cursors, durable leased queue, fingerprints/repeated submissions, draft creation, supported attachment promotion/quarantine, source retention/retries | **NO mailbox connected/read** | **BLOCKED real email test** | Exact dedicated mailbox address/OAuth authorization still missing. Fourth Auth account explicitly excluded. Unsupported attachment review remains operator-assisted. |
| 10. Multilingual intake | Google Cloud Translation transport/detection, original retained, provenance/no invented confidence, mandatory human corrections, provider-backed category suggestions | **NO actual Google result verified** | Manual original-language capture yes; **translation test BLOCKED** | Missing approved-project Translation/Gemini keys/billing and actual provider/language tests |

## Existing page mapping

| Existing Demo route/group | Persistent isolated counterpart | Limit |
|---|---|---|
| Overview `/dashboard` | `/platform/dashboard` | Separate labelled data environment, same existing dashboard vocabulary/styles |
| Institutions/Complaints | `/platform/institutions`, `/platform/cases`, `/platform/cases/<uuid>` | Owner creates fictional test records; none copied from Demo/hosted complaints |
| Intake Queue | `/platform/intake` | Human verify/register/associate/reject/match-review controls; external jobs truthfully blocked without providers |
| My Work/Kanban | `/platform/tasks`, `/platform/kanban` | Current ownership/Bureau rules, explicit raw lifecycle; no disposed drag/drop |
| Calendar/Analytics | `/platform/calendar`, `/platform/analytics` | Shared actual authorized selectors, no demonstration counts |
| AI Intelligence | `/platform/intelligence` | Persisted job/provider evidence and findings; no fake scan-complete action |
| Cross-Bureau/Dependency Explorer | `/platform/coordination`, `/platform/dependencies`, `/platform/graph` | Separate case/document scope; minimal destination transfer review |
| Resolution Center | `/platform/resolutions`, case detail | Current checklist/policy/reviewer required; reopening unavailable |
| Settings/team/reports/notifications/help | `/platform/settings`, `/platform/team`, `/platform/reports`, `/platform/notifications`, `/platform/help` | Configuration administrator has no implicit complaint privileges |
| Officer administration | `/officer-admin` | Existing real hosted approval/Bureau/role administration, unchanged security boundary |

## Verified engineering evidence and its scope

- Real hosted fourth-applicant signup; human-provided actual email confirmed provider state; no privileges during signup/Pending Approval. **First automatic signup callback failed**; subsequent actual password login reached Pending Approval. Exact cause remains unverified. Added safe stage diagnostics are not proof of a fix.
- Actual existing administrator approved that applicant through the application, then revoked only its role. Approved login/empty registry, real refresh, cross-Bureau denial, direct public-RPC denial, pre-revocation-session denial and logout/replay passed. Both original officer assignments/memberships were checked unchanged. Applicant authority remains revoked.
- Actual applicant recovery email was accepted after earlier provider 429s; newest real mailbox URL completed the original PKCE callback/password change. Old password and session were denied, new password logged in with **no current roles**, then logout succeeded. Exact original signature-verified applicant JWT naturally expired and hosted REST explicitly rejected it for expiry.
- `scripts/workbench/test-database.ts` uses a separate freshly named loopback PostgreSQL database and **synthetic identities/source messages**. It checks the environment RLS fence/non-owner runtime, scoped domain reads, real persistence/uniqueness/idempotency/concurrency, independent grants/revocation/transfer, conflict review, SLA delivery, actual evidence bytes/hash and disposal/closed-record denial, 40 durable synthetic email jobs, rollback and reload. This is not hosted case RLS, mailbox delivery, actual provider inference or owner acceptance.
- Provider unit tests are explicitly **SIMULATED HTTP contracts**, never reported as real Google/Gmail tests. Missing provider configuration produces BLOCKED queue outcomes.
- CI runs local engineering checks without hosted credentials. Final commit/CI URLs are reported in delivery; historical reports retain historical counts. Automated browser regressions do not count as owner acceptance.

## Security review of the isolated boundary

The runtime URL must be loopback, a generated workbench database name and the exact restricted login. Runtime refuses owner/superuser/BYPASSRLS access. Every new private table has FORCE RLS on an explicit environment UUID. Only enumerated newly created workbench tables receive permissions; no deployed tables or browser roles receive broad grants. Files are private/ignored; operator passwords and Gmail OAuth tokens use Windows CurrentUser DPAPI.

The local runtime is a **trusted server principal with environment-wide access**. Case/document authorization is enforced by the server/domain projection in addition to environment RLS; this is **not production per-officer SQL RLS certification**. Current web identity is revalidated through hosted online Auth/current approval; Demo identities cannot select it. Multiple hosted Bureau memberships are refused until a reviewed scoped-role DTO replaces the flattened gateway account response. Worker metadata is a development reference snapshot with expiry checks; production machine authorization and immediate revocation semantics require a separate reviewed service contract before promotion.

Workers use bounded draft/candidate queries, durable leases and source/version/authority rechecks, with provider calls outside locked transactions. Supported source email attachments enter case storage only on human registration. Binary evidence remains unavailable until an actual scanner returns a verdict. No provider result or CLEAN scan is manufactured.

## Hosted release prerequisites

**Verified closed historical defect:** direct public read RPC execution is revoked and application-owned private gateway paths revalidate provider sessions/current authority. Real provider-only logout/direct-RPC rejection evidence supersedes the historical Phase 2 failure. No protected `auth.sessions` policy/ownership was bypassed; its historical candidate remains unapplied.

**Still blocking hosted activation:** independent gateway/deployment review; fresh successful signup automatic callback evidence; production HTTPS/Secure-cookie and email/redirect/abuse validation; reviewed scoped identity/lifecycle/reopening/referral contracts; hosted operational repositories/transactions/RLS/storage/advisor evidence; approved actual provider/mailbox configuration and execution; scheduler/monitoring/retention/recovery procedures; owner manual acceptance and explicit release authorization. Supabase connector advisor calls were denied by tool policy; this is a blocked check, **not** a clean advisor result. These are verified missing evidence or deliberately unimplemented contracts, not assertions of unknown deployed vulnerabilities.

Three Phase 8 SQL files are **isolated-only candidates**, guarded against installation into the hosted database. The second corrects confirmed schema-USAGE permission needed by the isolated non-owning FK enforcement path; the third adds worker indexes. Original baseline and all nine hosted migrations remain unchanged.
