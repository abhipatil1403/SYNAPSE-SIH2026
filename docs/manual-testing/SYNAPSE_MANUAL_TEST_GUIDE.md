# SYNAPSE manual testing — password authentication and IndicTrans2

**Final acceptance: AWAITING USER MANUAL TESTING. Hosted Live Mode and hosted business writes remain disabled.** The original dashboard design is preserved and now uses real authenticated PostgreSQL. Legacy Demo sources are not an application destination. This guide supersedes the old email-confirmation signup and Google Cloud Translation instructions.

## 1. Prepare Supabase Auth settings yourself

In the SYNAPSE project's Supabase dashboard, open **Authentication → Providers / Sign In → Email**. Enable email/password authentication and disable **Confirm Email**. The application never changes this hosted setting. The owner reported completing this, and a real provider settings check returned `mailer_autoconfirm=true` and email authentication enabled.

Keep the allowed recovery redirect pointed at **http://localhost:3000/auth/callback** and the site origin consistent with **http://localhost:3000**. Password recovery still uses a one-time PKCE link; ordinary signup/sign-in does not. Production HTTPS, email/abuse policies and security review remain separate release requirements.

## 2. Private configuration locations

| Ignored local file | Variable names / purpose |
|---|---|
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SYNAPSE_PHASE1_READ_ENABLED=false` |
| `.env.gateway.local` | `SYNAPSE_GATEWAY_DATABASE_URL`, `SYNAPSE_GATEWAY_CA_FILE`, `SYNAPSE_AUTH_RATE_SECRET`, `SYNAPSE_SIGNUP_ENABLED=true`, optional `SYNAPSE_TRUST_PROXY`; limited TLS gateway only |
| `.env.operator.local` | `SUPABASE_SECRET_KEY`, `DATABASE_URL`, optional `SUPABASE_DB_CA_FILE`; owner CLI only, never a web/worker environment |
| `.env.workbench.local` | Generated `SYNAPSE_WORKBENCH_ENABLED`, `SYNAPSE_WORKBENCH_DATABASE_URL`, `SYNAPSE_WORKBENCH_ID`; separate loopback PostgreSQL |
| `.env.translation.local` | `HF_TOKEN` for owner-authorized model preparation; generated `SYNAPSE_TRANSLATION_API_KEY`; optional `SYNAPSE_TRANSLATION_THREADS`, `SYNAPSE_TRANSLATION_TIMEOUT_SECONDS` |
| `.env.integrations.local` | `SYNAPSE_INDIC_TRANSLATION_URL=http://127.0.0.1:8001`, generated `SYNAPSE_TRANSLATION_API_KEY`; `SYNAPSE_GEMINI_EMBEDDINGS_API_KEY` for the dedicated Gemini key; separate Gmail OAuth worker settings |

No password, token or credential value belongs in this guide, chat, client code or Git. Web startup rejects HF/model-service keys and operator credentials. Google translation is no longer selected and is never a fallback. Gemini semantic matching remains a separate optional provider.

## 3. Start the application

Run from the existing project folder in PowerShell:

```powershell
node --env-file=.env.local --env-file=.env.operator.local scripts/workbench/setup.mjs --create-isolated-development --references-only
npm run build
npm run workbench:start
```

Setup is non-destructive and hash-pins the isolated database on port **55433**. `--references-only` avoids dependence on retired test credentials and refreshes already imported profiles, marking deleted/revoked identities inactive. Approved users are subsequently synchronized from the trusted scoped gateway when they open the workspace. It never imports hosted complaint bodies or Demo data.

Open **http://localhost:3000/login**. Keep `localhost` consistently; using `127.0.0.1` as the browser origin will fail same-origin checks against the configured localhost origin. The listener itself remains loopback-only. Ctrl+C stops the web/worker processes; PostgreSQL data and jobs persist.

| URL | Purpose |
|---|---|
| `/login` | Real email/password login for officers and administrators |
| `/signup` | Email, password, confirm password; no role/Bureau/admin selection |
| `/pending-approval` | Current pending/rejected/suspended/revoked or restricted authority |
| `/settings` | Current profile, secure password recovery and development configuration |
| `/admin` | **Audit & Administration → User Approvals**; current authorized System Administrator only |
| `/dashboard` | Original Overview with actual authorized isolated PostgreSQL records |

The original hosted read preview stays gated. The original dashboard displays Development. All operational pages share the original navigation. Legacy `/platform/*` links redirect to their original-route equivalents.

## 4. Before deleting existing development Auth users — prepare recovery

**Do these read-only snapshots before deleting the last administrator.** They have been prepared on this Windows account; rerun before any intentional reset if state changed. Windows CurrentUser DPAPI protects the snapshots; keep the original Windows account and private files. No script below deletes an Auth user or application user.

```powershell
npm run phase9:bootstrap:snapshot
node --env-file=.env.local --env-file=.env.operator.local scripts/phase9/retire-officers.mjs --snapshot-approved-officers --include-approved-applicant --refresh-template
```

The administrator snapshot creates ignored `.local/phase9/admin-retirement.vault` and a private `.local/phase9/bootstrap-plan.json` template. The officer snapshot covers the two original approved Case Officers and, with the explicit flag, the fourth approved development applicant, including its currently revoked role. It creates `.local/phase9/officer-retirement.vault` and `officer-retirement-plan.json`. Inspect the selected UUIDs privately; a custom subset can be chosen in that plan. `--refresh-template` intentionally replaces the script-generated target list, not any database record.

If these prerequisite snapshots fail, resolve the stated drift while the old authorized identities still exist. No fallback email match, first-user administrator rule, public bootstrap endpoint or role picker exists.

## 5. Owner deletion and safe recreation

You may now manually delete **only the intended development Auth users** through Supabase **Authentication → Users**, after checking their exact UUIDs. The agent has not deleted any users. Do not reset the database, remove internal users/cases, clear audit tables or edit managed Auth tables with SQL.

The application-owned FK correction archives the old onboarding record before the owner/provider's Auth deletion cascades. Its decision audit and all internal user IDs/case history survive; only identity links and ephemeral recovery grants disappear. Online server Auth validation and closed public read RPCs deny deleted identities even if old cookies/JWTs remain.

For the administrator, use the explicit snapshot/rebind process below. For reusing the **officer/applicant** email addresses after owner deletion, review `.local/phase9/officer-retirement-plan.json`, then:

```powershell
npm run phase9:retire:check
npm run phase9:retire:apply
```

The check rolls back. Apply refuses any still-existing Auth identity, changed authority, unmapped snapshot, global administrator or new identity mapping. It expires the selected retired officer authority, suspends the old internal profile, records the original email in protected audit, and uses a reserved `.invalid` retention label to free the unique contact field. That label is **not a new Auth identity or login**. Historical IDs/cases remain preserved. Fresh same-email applicants receive new internal IDs only after normal independent approval; they never inherit historical complaint access because of an email match.

If deleting just some test users, remove the others from the retirement plan; it deliberately refuses to retire an Auth identity that still exists. Do not run legacy four-account hosted test runners after replacing their approved identities/passwords; they fail closed rather than recreate privileges.

## 6. Recreate the first administrator securely

1. Use **`/signup`** with the explicitly approved administrator identity. With Confirm Email off, Supabase issues a password session immediately and the server records a pending application. No verification link is needed and no role is created.
2. The new user must reach `/pending-approval`. Copy its **new Auth user UUID** from Supabase Authentication → Users into ignored `.local/phase9/bootstrap-plan.json` as `authId`. This is not a token.
3. Review `email`, `environment=DEVELOPMENT_ONLY`, `approvedRole=SYSTEM_ADMIN`, `scope=GLOBAL`, a future expiry within 90 days and the owner authorization reason. The prepared `rebind` identifies the exact retired administrator UUID/internal ID backed by the encrypted snapshot. Never substitute another officer's internal ID. A different initial administrator requires an explicit new owner-approved identity/plan; email is never an authorization bypass.
4. Run the owner-only check and provisioning commands:

```powershell
npm run phase9:bootstrap:check
npm run phase9:bootstrap:apply
```

Check validates the actual provider UUID/email and pending application, then rolls back. Apply requires no other active mapped global administrator, closed read gates and the exact approved rebind proof. It preserves the retired configuration administrator's internal ID, records an owner audit event, and grants only one expiring GLOBAL SYSTEM_ADMIN role with no Bureau membership, legacy global-case flag or complaint access. Repeating the exact completed plan is idempotent; it does not renew privileges. If an authorized administrator still exists, bootstrap refuses and the normal review workflow must be used.

For a brand-new authorized administrator with no prior internal identity, an owner-controlled plan can omit `rebind`; any existing internal-email collision fails for explicit reconciliation. The CLI requires operator SQL/Auth-read authority and is never exposed to the browser. It does not create a password, delete an identity or modify Supabase managed-schema policies.

## 7. Applicant → pending → administrator approval

1. In a separate browser profile, open `/signup`. Enter an approved development email, a password of at least **12 characters**, and matching confirmation. Press **Sign Up**.
2. Expect an immediate session and `/pending-approval`, with no Bureau, role or complaint access. Refresh the page and try `/officer/dashboard` and `/dashboard` directly; server protection must retain the pending restriction. Protected APIs return 403. Duplicate signup is rejected and cannot replace an existing password/identity.
3. Sign in as the independently bootstrapped/current administrator through the **same `/login`** page. Choose **Administration → User Approvals**.
4. Review applicant email, application signup/received date, status and audit history. Requested Bureau is not collected at public signup. Choose the correct active Bureau, allowed role, explicit assignment expiry and reason; submit **APPROVED**. Allowed portal roles are CASE_OFFICER, BUREAU_HEAD, AUDITOR and REVIEWER. SYSTEM_ADMIN is never offered here; self-approval is denied.
5. Refresh/sign in as the officer. Current approval, scoped role and membership must resolve before `/officer/dashboard` or `/dashboard` opens. Open the development workspace once so its scoped identity/reference cache is synchronized. Reports, cases and evidence remain authorized by the current server identity.

For two-Bureau checks, use separate approved officers with different memberships. One must not see the other's restricted descriptions, documents or operations. Newly recreated users have no automatically inherited cases. Create fictional development complaints in the isolated workspace and explicitly review discovery/access grants.

## 8. Rejection, revocation and recovery

- **Reject another applicant:** use a separately approved development address, sign it up, then select REJECTED in User Approvals with a reason. Its pending screen must show rejection; login/retry cannot reset that decision or grant data access.
- **Revoke an approved account:** administrator selects REVOKED or SUSPENDED with a reason. The transaction changes current application authority/memberships/roles with audit. Existing browser sessions must be denied protected data on the next server request, without waiting for JWT refresh. A role-only expiry also restricts access; an approved application with inactive authority displays “Access requires review.”
- **Logout/expiry:** sign out and try a protected URL/old session again; the application must deny it. Natural JWT expiry is enforced; do not modify tokens to simulate success.
- **Forgot Password:** use `/forgot-password`, then open the newest actual recovery email in the **same browser/session** that requested it. Its one-time PKCE callback opens `/reset-password`; set and confirm the new password. Old password/session must fail, and recovery must not restore rejected/revoked privileges. Ordinary signup/login never sends a magic-link login request.

Real recovery was executed for the prior approved development accounts. A fresh post-redesign mailbox reset and the new-applicant approval/rejection journey remain owner manual acceptance; no new account was invented or deleted to manufacture a hosted signup pass.

## 9. Start the genuine IndicTrans2 service

Selected official MIT checkpoints, pinned by commit:

- `ai4bharat/indictrans2-indic-en-dist-200M` @ `d66a2122ad6d28184f3dc3797b652bd80ae3f65f`
- `ai4bharat/indictrans2-en-indic-dist-200M` @ `2cfd0a20057756d756bf3e53528f492afc52f91a`

The owner has approved Hugging Face access and configured `HF_TOKEN` privately. Official Toolkit requires Linux/macOS; this machine uses **Ubuntu WSL, Python 3.12**, a CPU PyTorch runtime and `IndicTransToolkit==1.1.1`. No native-Windows inference claim is made. Allow several GB disk and roughly 8 GB available RAM for models/runtime; Only one direction remains resident at a time to bound development RAM. CPU cold loading and longer translations can be slow. A GPU deployment would need a separately tested compatible runtime.

The WSL virtual environment is already installed at `~/.cache/synapse-it2/venv`. For a new Linux/WSL machine, install the official `uv` tool, then create that environment and install the pinned requirements from the repository root:

```bash
uv venv --python python3.12 ~/.cache/synapse-it2/venv
uv pip install --python ~/.cache/synapse-it2/venv/bin/python -r services/translation/requirements.txt
```

In Windows PowerShell configure the private service/worker shared key without printing it:

```powershell
npm run phase9:translation:configure
```

Prepare official files and run the service in a separate terminal (exact path for this workspace):

```powershell
wsl -d Ubuntu -- bash -lc 'cd "/mnt/f/ALL/ABHI/VIT/HACKATHONS/SIH 2026/SYNAPSE-SIH2026" && ~/.cache/synapse-it2/venv/bin/python -m services.translation.run --prepare'
wsl -d Ubuntu -- bash -lc 'cd "/mnt/f/ALL/ABHI/VIT/HACKATHONS/SIH 2026/SYNAPSE-SIH2026" && ~/.cache/synapse-it2/venv/bin/python -m services.translation.run'
```

Preparation downloads only the pinned official code/configs, safetensors and SentencePiece assets, after owner-approved access. Serving uses cached files at `~/.cache/synapse-it2/huggingface` in offline mode and removes HF_TOKEN from its runtime environment. The API binds **127.0.0.1:8001**, requires a backend Bearer credential even for health, rejects excess requests/input and returns clear unsupported-language/loading/timeout errors. It exposes no public CORS/docs or browser key. Keep its terminal running alongside `npm run workbench:start`.

## 10. Test actual Marathi/Hindi intake translation

As an approved officer, open `/intake`. Enter fictional Marathi or Hindi original text and select the source language. Save the draft and verify its institution. The durable worker calls the authenticated local IndicTrans2 API and persists original text, model output, official model/revision, detected/manual source language, target language and **NEEDS_REVIEW** state.

Open `/intelligence` → processing status for actual queued/blocked outcomes. If the language is uncertain/unsupported, select the correct manual source code in Intake and confirm it; this supersedes the old translation and queues a fresh version. Lingua provides real open-source identification but does not cover every Indic language reliably; manual selection remains available for all supported model languages/scripts.

Read the translation next to the original, correct it, record a reason and confirm review. The machine output/provenance remains retained separately from the reviewed text; the original complaint is unchanged. Registration rejects an unreviewed current translation. Human review is mandatory for decisions. Nothing merges or approves a complaint automatically.

Actual engineering inference passed **Marathi → English, Hindi → English and English → Hindi**, plus an actual service → leased SQL queue → provenance persistence → human-correction gate test using fictional data. One longer CPU reverse-translation probe reached the enforced deadline; shorter input passed. The service rejects partial output rather than returning a fabricated result. Requests are limited to 20,000 body characters and 4,000 subject characters. Default inference deadline is 120 seconds, configurable only within the bounded service limit; cold loading can make an initial worker attempt time out and retry. Translation quality still awaits your review.

Reproduce engineering checks, if desired:

```powershell
npm run phase9:test:translation
npm run phase9:test:translation:database
```

The database check creates/removes only a fresh disposable database on **55432**, uses synthetic identities/source text, and does not alter your persistent manual data on 55433 or hosted cases. Its provider response is actual inference, unlike explicitly labelled contract simulations in the standard unit suite.

## 11. Other integrations and release limits

Gmail still requires an explicitly approved dedicated mailbox address and OAuth access. The fourth Auth address is not authorized for ingestion. Do not connect/read it. Gemini remains separately configured for approved development content. No Google translation fallback exists.

Fresh security advisor access succeeded: seven legacy mutable-search-path warnings, the intentional current-session-revocation RPC definer warning, and disabled leaked-password protection remain documented in `docs/phase9/README.md`. The new private functions have fixed search paths, FORCE-RLS source tables and restricted execution. Hosted operational writes, independent HTTPS/security/release review and final owner acceptance remain pending. No global Live Mode switch is enabled by this work.

After any owner deletion/recreation, refresh local reference profiles with the setup command in section 3. Use the preserved approved administrator for local-only Bureau Head delegation if testing SLA/transfer/disposal approval. This does not elevate original hosted officer roles. Never delete/reset deployed tables to clean up a manual test.


## 12. Preserved operational workflow regression

Record case numbers and source references privately. Use separate browser profiles for A/B/admin; logging out clears a shared profile across tabs.

1. Follow the new password/approval tests above.
2. **Institution registry.** As A, open `/institutions`, create a development institution with an explicitly fictional Permanent ID such as `DEV-OWNER-001`. Duplicate normalized IDs must fail. The administrator can correct its name/state/region with a reason. Never create a false real AICTE institution record in hosted data.
3. **Register a complaint.** Open `/intake`. Save a unique manual source reference, original text/language, optional course/issue and your authorized Bureau. Select that draft, verify its institution, choose the configured category and yourself as officer, optionally opt into limited discovery, then register. No case exists before verification/registration. Review any pending duplicate/translation results first. A successful command must refresh the database snapshot, not just display a toast.
4. **Dashboard consistency.** Refresh `/dashboard`, `/complaints`, institution profile and `/analytics`. The new case must appear and totals must reconcile with your authorized registry. Reload/restart the app to check persistence. Zero values are legitimate. Category/ageing/region counts derive from actual isolated records. The original Overview now reads this same authorized PostgreSQL data.
5. **Kanban and work.** Open `/kanban`. Drag `NEW → ASSIGNED → UNDER_REVIEW`, enter a reason and commit; test the keyboard form too. Invalid jumps and stale versions must be rejected. Use the case detail page for assignment, priorities, tasks, task completion and accountable comments. Refresh other tabs to verify updates. `UNDER_REVIEW` is the deployed raw code, not an invented `IN_PROGRESS` case state.
6. **Attachments.** Upload a UTF-8 `.txt` development file; verify hash/size metadata, actual download bytes and a second version. Text policy explicitly says `NOT_REQUIRED`, not antivirus CLEAN. PDF/PNG/JPEG stay quarantined without configured real ClamAV; download/verification must fail while pending/infected. Configure an actual scanner and run the worker to rescan pending binaries. Bureau Head evidence review is required for disposal.
7. **Cross-Bureau access.** In B's separate profile, verify A's private case/details/documents are absent. An explicitly discoverable case exposes only its ID/number/institution/category/Bureau. Request DETAILS with a reason and expiry within seven days. A's local Bureau Head independently approves in `/coordination`; B may then read details but not documents. Request DOCUMENTS separately, test expiry and source-head revocation, and confirm visibility disappears after refresh. Ordinary officers cannot approve their own requests.
8. **Relationships and graph.** Create a second authorized case. Propose/review typed relationships in its detail page, including dependencies; cycles must fail. `/graph` and `/dependencies` filter by text/Bureau/context type, navigate cases and show actual action nodes. Dashed institution context never proves the same issue. Record overlapping same-topic inspection or approval/rejection actions to produce explainable potential conflicts; a head must have access to both cases to review. Confirm linked-case update notifications only reach currently authorized recipients.
9. **Transfer.** A's local source head requests transfer to B's Bureau and its real authorized officer. B's independent local destination head reviews the minimal transfer in Coordination without prematurely receiving the case description. On completion B gains assignment, A loses ordinary ownership, the case history persists and original SLA timestamps remain unchanged. Source and destination cannot be the same approver.
10. **SLA/calendar.** Administrator publishes a labelled **development-only** policy with explicit requirements and expiry. A local head sets an actual future deadline under that policy. Administrator enables its reminder schedule in Settings. The worker records reminder/overdue notifications idempotently; repeated ticks must not duplicate them. No statutory deadline is inferred. Schedule hearings/reviews/approvals/Bureau activities; Overview and full Calendar share their selector. Test previous/next month, Today, event-day selection and actual case links.
11. **Resolution.** Complete/cancel outstanding work, verify accepted evidence, resolve findings/conflicts/dependencies and move to UNDER_REVIEW. Select a current policy and persist a fresh Quality Gate evaluation. A current Bureau Head may dispose only after required checks pass. Changed records invalidate evaluations. Disposed cases reject mutation; reopening is deliberately unavailable until a versioned review-cycle contract is approved.
12. **Search/reports/notifications.** Search/filter/page the registry; verify reports contain only authorized cases and mark notifications read. Settings, team directory, Intelligence and testing-help routes must load truthful scoped/empty/error states.
