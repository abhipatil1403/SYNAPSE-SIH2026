# SYNAPSE manual testing — isolated development workspace

Final acceptance: **AWAITING USER MANUAL TESTING**. Automated checks are engineering evidence, not your acceptance. Hosted Live Mode and hosted business writes remain **NO-GO**.

## What you will be testing

- `/dashboard` and the original sidebar pages remain the existing fictional **Demo Mode**, with the existing design and browser-local data.
- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/pending-approval`, `/officer/dashboard` and `/officer-admin` use **real hosted Supabase Auth** and current application approval. Demo identity selection has no effect here.
- `/platform/*` can use a **separate actual local PostgreSQL development database**, explicitly labelled `ISOLATED POSTGRES / real Supabase Auth / hosted business writes OFF`. These are persistent database workflows, not hosted complaint writes. The original 69-table deployed database is not reset, seeded with workbench cases or exposed to browser roles.
- `/live-preview` and the hosted officer registry stay gated. An empty isolated registry is expected initially; no Demo complaints are copied in.

Use only invented development complaint content. No production complaint data has been approved for external processing.

## Start on the existing Windows development machine

Prerequisites: Node 22, installed project dependencies (`npm ci` when needed), PostgreSQL `initdb.exe`/`pg_ctl.exe` on PATH, PowerShell 7 (`pwsh.exe`), the existing ignored gateway configuration, and the approved operator configuration for setup only. DPAPI vaults require the Windows account that created them. Do not copy private vaults/keys into Git or another account.

In the project directory:

```powershell
npm run workbench:setup
npm run build
npm run workbench:start
```

`workbench:setup` creates/verifies the dedicated loopback cluster on port 55433 and applies only hash-pinned **isolated candidate** SQL. Subsequent runs preserve existing records and refuse unknown schema drift. It imports the three approved identity/reference records, never hosted complaints, Auth credentials or messages. It reads `.env.local` and `.env.operator.local`; the latter must never be loaded into Next. No deployed migration is applied by this command.

`workbench:start` starts the production web server and separate 30-second worker. Leave that terminal running. Open **http://localhost:3000/login**, sign in, then **http://localhost:3000/platform/dashboard**. Use this host consistently; PKCE cookies and same-origin checks are host-sensitive. Stop with Ctrl+C; data and pending jobs remain in PostgreSQL.

For source development, use `npm run workbench:dev` instead of `workbench:start`, plus a separate worker terminal: `npm run workbench:worker`. Stop production before starting development. Development request/action/browser log forwarding is disabled to keep single-use callback URLs out of terminal logs.

If PostgreSQL was stopped, rerun `workbench:setup`; it starts the existing cluster without resetting it. Do not run setup against hosted Supabase or replay the application baseline there.

## Configuration locations (names only)

| Private file | Purpose and variable names |
|---|---|
| `.env.local` | Public project configuration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `NEXT_PUBLIC_APP_MODE=demo`, `SYNAPSE_PHASE1_READ_ENABLED=false` |
| `.env.gateway.local` | Existing restricted TLS gateway: `SYNAPSE_GATEWAY_DATABASE_URL`, `SYNAPSE_GATEWAY_CA_FILE`, `SYNAPSE_AUTH_RATE_SECRET`, `SYNAPSE_APP_ORIGIN`, `SYNAPSE_SIGNUP_ENABLED`, `SYNAPSE_TRUST_PROXY`. Origin must be `http://localhost:3000` for these commands. |
| `.env.operator.local` | Authorized setup/audit only: `SUPABASE_SECRET_KEY`, `DATABASE_URL`, optional `SUPABASE_DB_CA_FILE`. Never a web/worker environment. |
| `.env.workbench.local` | Generated restricted local runtime: `SYNAPSE_WORKBENCH_ENABLED`, `SYNAPSE_WORKBENCH_DATABASE_URL`, `SYNAPSE_WORKBENCH_ID`. Do not substitute the hosted URL. |
| `.env.integrations.local` | Worker only: `SYNAPSE_DEV_EXTERNAL_PROCESSING_APPROVED`, `SYNAPSE_GEMINI_API_KEY`, `SYNAPSE_GEMINI_EMBEDDING_MODEL`, `SYNAPSE_GOOGLE_TRANSLATION_KEY`, optional `SYNAPSE_CLAMAV_COMMAND`; Gmail settings below. Never load this into Next or give these names a `NEXT_PUBLIC_` prefix. |

Keep flags false unless the corresponding approved isolated test is being performed. `.env.example` documents names, not usable credentials. Google keys and OAuth credentials remain **unconfigured/unverified** at this milestone.

## Accounts and development authority

Use the exact previously approved addresses from your private `.local/phase2/approved-*.json` plans. No passwords are printed here.

| Account | Current hosted authority | Isolated use |
|---|---|---|
| Officer A | Original Approval development Bureau, Case Officer | Own intake/cases; no other Bureau's details/documents |
| Officer B | Original Academic development Bureau, Case Officer | Separate-Bureau isolation account |
| Third, verified development administrator | Audited expiring configuration-only System Administrator; no Bureau/case privileges | Reference/policy settings; may explicitly delegate **local-only** review roles |
| Fourth applicant | Real email verified, approved through administrator, then role deliberately revoked in security tests | Pending Approval; **no protected workbench access**. Do not automatically restore it. |

Original hosted development assignments expire **29 October 2026 at 17:30 India time (12:00 UTC)**. Local review delegations expire within 24 hours and cannot outlive membership. Expired authority must be independently reviewed by an authorized administrator, never silently renewed.

Use your own password if known. To use an already generated approved development password without displaying it, **you** may run one of the following on the vault-owning Windows account, paste into the localhost login form, and let the terminal clear the clipboard after 60 seconds:

```powershell
node scripts/workbench/copy-approved-password.mjs a
node scripts/workbench/copy-approved-password.mjs b
node scripts/workbench/copy-approved-password.mjs admin
```

Run only the command for the account you intend to use; avoid clipboard history/cloud sync. This helper was code-reviewed but clipboard interaction is awaiting owner testing. Alternatively use the real Forgot Password flow. Email-link completion must use the original browser/session; do not post links, OTPs or tokens to chat.

For approval/SLA/disposal tests, sign in as the administrator and open `/platform/settings`. Delegate **BUREAU_HEAD** locally to Officer A in A's existing Bureau, and to Officer B in B's existing Bureau, each with an explicit review reason and short expiry. These are audited, isolated-database delegations. They do **not** elevate either original hosted Case Officer assignment. The administrator cannot self-delegate or read cases simply by being System Administrator. Multi-Bureau hosted identities fail closed until a scoped-role gateway DTO is reviewed.

## Manual test sequence

Record case numbers and source references privately. Use separate browser profiles for A/B/admin; logging out clears a shared profile across tabs.

1. **Auth and pending restrictions.** Log in with A, refresh the session and log out. An unauthenticated `/platform` API must return 401; the fourth applicant must remain Pending Approval/403. Real fourth-account recovery, logout, revocation and natural JWT expiry have engineering evidence; your acceptance is still pending. The first signup automatic callback failed historically even though provider confirmation succeeded; fresh signup callback reliability remains blocked, not presumed fixed.
2. **Institution registry.** As A, open `/platform/institutions`, create a development institution with an explicitly fictional Permanent ID such as `DEV-OWNER-001`. Duplicate normalized IDs must fail. The administrator can correct its name/state/region with a reason. Never create a false real AICTE institution record in hosted data.
3. **Register a complaint.** Open `/platform/intake`. Save a unique manual source reference, original text/language, optional course/issue and your authorized Bureau. Select that draft, verify its institution, choose the configured category and yourself as officer, optionally opt into limited discovery, then register. No case exists before verification/registration. Review any pending duplicate/translation results first. A successful command must refresh the database snapshot, not just display a toast.
4. **Dashboard consistency.** Refresh `/platform/dashboard`, `/platform/cases`, institution profile and `/platform/analytics`. The new case must appear and totals must reconcile with your authorized registry. Reload/restart the app to check persistence. Zero values are legitimate. Category/ageing/region counts derive from actual isolated records. Original `/dashboard` remains Demo and will not reflect this case.
5. **Kanban and work.** Open `/platform/kanban`. Drag `NEW → ASSIGNED → UNDER_REVIEW`, enter a reason and commit; test the keyboard form too. Invalid jumps and stale versions must be rejected. Use the case detail page for assignment, priorities, tasks, task completion and accountable comments. Refresh other tabs to verify updates. `UNDER_REVIEW` is the deployed raw code, not an invented `IN_PROGRESS` case state.
6. **Attachments.** Upload a UTF-8 `.txt` development file; verify hash/size metadata, actual download bytes and a second version. Text policy explicitly says `NOT_REQUIRED`, not antivirus CLEAN. PDF/PNG/JPEG stay quarantined without configured real ClamAV; download/verification must fail while pending/infected. Configure an actual scanner and run the worker to rescan pending binaries. Bureau Head evidence review is required for disposal.
7. **Cross-Bureau access.** In B's separate profile, verify A's private case/details/documents are absent. An explicitly discoverable case exposes only its ID/number/institution/category/Bureau. Request DETAILS with a reason and expiry within seven days. A's local Bureau Head independently approves in `/platform/coordination`; B may then read details but not documents. Request DOCUMENTS separately, test expiry and source-head revocation, and confirm visibility disappears after refresh. Ordinary officers cannot approve their own requests.
8. **Relationships and graph.** Create a second authorized case. Propose/review typed relationships in its detail page, including dependencies; cycles must fail. `/platform/graph` and `/platform/dependencies` filter by text/Bureau/context type, navigate cases and show actual action nodes. Dashed institution context never proves the same issue. Record overlapping same-topic inspection or approval/rejection actions to produce explainable potential conflicts; a head must have access to both cases to review. Confirm linked-case update notifications only reach currently authorized recipients.
9. **Transfer.** A's local source head requests transfer to B's Bureau and its real authorized officer. B's independent local destination head reviews the minimal transfer in Coordination without prematurely receiving the case description. On completion B gains assignment, A loses ordinary ownership, the case history persists and original SLA timestamps remain unchanged. Source and destination cannot be the same approver.
10. **SLA/calendar.** Administrator publishes a labelled **development-only** policy with explicit requirements and expiry. A local head sets an actual future deadline under that policy. Administrator enables its reminder schedule in Settings. The worker records reminder/overdue notifications idempotently; repeated ticks must not duplicate them. No statutory deadline is inferred. Schedule hearings/reviews/approvals/Bureau activities; Overview and full Calendar share their selector. Test previous/next month, Today, event-day selection and actual case links.
11. **Resolution.** Complete/cancel outstanding work, verify accepted evidence, resolve findings/conflicts/dependencies and move to UNDER_REVIEW. Select a current policy and persist a fresh Quality Gate evaluation. A current Bureau Head may dispose only after required checks pass. Changed records invalidate evaluations. Disposed cases reject mutation; reopening is deliberately unavailable until a versioned review-cycle contract is approved.
12. **Search/reports/notifications.** Search/filter/page the registry; verify reports contain only authorized cases and mark notifications read. Settings, team directory, Intelligence and testing-help routes must load truthful scoped/empty/error states.

## Gemini and translation tests — blocked until keys configured

Create `.env.integrations.local` privately. Set `SYNAPSE_DEV_EXTERNAL_PROCESSING_APPROVED=true` only for the approved fictional development content; provide restricted Gemini and Cloud Translation keys and `SYNAPSE_GEMINI_EMBEDDING_MODEL=gemini-embedding-001`. Enable billing/API access according to the provider project policy. Restart `workbench:start`, or run:

```powershell
node --env-file=.env.workbench.local --env-file=.env.integrations.local --import tsx scripts/workbench/worker.mjs --once
```

Intelligence reports persisted queue outcomes; requeue a blocked source job after configuration/institution verification. Actual semantic processing uses an institution-indexed shortlist capped at 49, authorized candidates only, exact fingerprints and actual embeddings. Category/course/issue/date explanations distinguish verified features from absent information. Category suggestions use actual category embeddings. Cosines/development thresholds are **not calibrated confidence**, and no cases merge automatically. Create related and different test complaints and review every recommendation manually.

Non-English drafts enqueue actual Cloud Translation to English with detected language, provider provenance, original text retained and mandatory human correction/review. No confidence is invented. Test Hindi/Marathi plus the Indian languages relevant to your demo. Provider availability/input limits can reject a request; inspect its blocked/failed job instead of substituting fabricated text.

## Gmail intake — no mailbox is currently approved

The fourth Auth address is **not** approved for ingestion. Do not connect/read it. First obtain explicit owner approval for the dedicated team mailbox address and OAuth access.

Only after approval, prepare ignored `.local/workbench/approved-mailbox.json` containing `environment: "DEVELOPMENT_ONLY"`, exact `address`, ISO `approvedAt`, approved Gmail **label ID** in `label`, current approved review-owner UUID in `reviewOwnerId` and its Bureau UUID in `bureauId`. Keep this private. Set worker-only `SYNAPSE_GMAIL_CLIENT_ID`, `SYNAPSE_GMAIL_CLIENT_SECRET`; configure the OAuth application's exact redirect `http://127.0.0.1:8765/oauth/callback` and approved test user. Then:

```powershell
node --env-file=.env.integrations.local --import tsx scripts/workbench/authorize-gmail.mjs
```

Open the consent URL in the **private local file named by the helper**, confirm only `gmail.readonly`, and authorize the approved mailbox. Its profile must match before token storage or ingestion. The refresh token is CurrentUser DPAPI encrypted; no mailbox is read by merely implementing the adapter.

Set `SYNAPSE_GMAIL_ENABLED=true` and exact `SYNAPSE_GMAIL_APPROVED_ADDRESS` in the worker file only, then restart the worker. Send fictional test messages to that dedicated label. Check durable message-ID receipts, cursor recovery, repeated-content flags, draft creation without approval and attachment retention. Human verify/register the draft; supported source attachments become persisted evidence, with binaries quarantined. Unsupported attachments stay in retained source payload for operator review. Retry/restart and send an approved burst to verify no lost/duplicate drafts. The 40-source automated SQL test uses synthetic messages and **does not certify Gmail delivery**.

## Errors, cleanup and activation

API errors are sanitized, no-store and shown in the workspace. Refresh after stale-version errors. Intelligence shows owned/admin queue counts and provider evidence, not a guessed configured status. The worker logs aggregate counts/codes, never source mail, keys, response bodies or Auth URLs. Private database logs live in `.local/workbench/postgres.log`; do not share raw logs or generated security receipts without review.

For normal cleanup reject unregistered drafts, withdraw evidence, cancel test tasks and complete authorized disposition; use unique development reference prefixes. Retain audit history. No delete/reset control or automatic cleanup of the persistent manual database is provided. An owner may archive the isolated environment and revoke its local runtime access after reviewing retention; never point disposable test cleanup at port 55433 or hosted Supabase.

Before hosted activation: approve scoped lifecycle/roles and hosted transactional repositories/RLS/storage; obtain independent gateway/security/HTTPS/Secure-cookie and email/abuse review; resolve fresh signup callback reliability; obtain a fresh allowed advisor run; configure/test approved providers/mailbox; approve monitoring/retention/recovery; and record owner manual acceptance. The Phase 2 provider-only direct-RPC defect was remediated by private application gateway/grant changes, **not** by modifying managed Auth tables. Historical managed-session candidate stays unapplied. No checklist or environment flag alone authorizes release.
