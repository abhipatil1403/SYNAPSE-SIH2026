# Engineering checks — 27 October 2026

A hosted HTTP regression exposed a missing decision-timestamp shape: private SQL strips null fields on pending applications and global-role scope/expiry fields. The account schema accepts an absent decision timestamp; an explicit private-profile adapter restores only nullable fields before canonical validation, with regression tests. No authorization restriction was relaxed.

Phase 9 adds reviewed private application lifecycle/profile functions and owner-only administrator/officer recreation procedures. Actual hosted execution applied the reviewed migration and took read-only encrypted snapshots; **no Auth identity was deleted, no officer role was retired, and no administrator rebind was performed**. Disposable synthetic SQL exercises cover positive/negative/idempotent owner transactions and archived deletion/recreated pending isolation.

Owner acceptance remains **AWAITING USER MANUAL TESTING**. This document records executed checks; it does not authorize hosted activation.

| Check | Verified result | Evidence/limit |
|---|---|---|
| Unit/contract tests | **111 passed** | `npm test`; Gemini/Gmail/IndicTrans2 HTTP contracts are explicitly simulated; actual model checks are separate |
| Automated browser regressions | **31 passed** | `npm run test:browser:isolated`; production server with hosted/workbench writes off; Demo and platform-engine UI fixtures distinguished in test names; responsive widths included |
| Typecheck/lint/production build | **PASS** | `npm run typecheck`, `npm run lint`, `npm run build` |
| Baseline check | **PASS** | SHA-256/catalog match; no baseline rewrite/reset |
| Existing isolated SQL suites | **PASS** | `test:database:platform`, `test:database:auth`, `test:database:sla`; original 69 tables/30 legacy functions reconstructed in disposable databases; managed Auth/JWT helpers simulated locally |
| New isolated workbench SQL suite | **11 groups passed** | `test:database:workbench`; actual PostgreSQL environment RLS, non-owner runtime/domain scope, uniqueness/idempotency/concurrency, scoped grant/revocation, independent transfer, actual recorded conflicts/SLA, evidence bytes/hash/closure, 40 synthetic-source jobs, atomic source-attachment promotion, **simulated** provider pipeline/human translation gate, rollback and reload |
| Fresh hosted issued-JWT authorization | **11 groups passed** | `verify-hosted-auth.ts --controlled-read`; original A/B positive reads/isolation, current authority, refresh and both logout boundaries; bounded test lease closed afterward |
| Actual administrator approval portal | **PASS** | Real shared login → Administration → User Approvals → stored dates/history controls → logout. Read-only browser verification; no decision or role changed. |
| Fresh hosted ACL/RLS/grant audit | **10 groups passed** | `audit-gateway.mjs`; fixed search path/owners, no privileged runtime/source grants, public reads closed, FORCE RLS, final read gate closed |
| Fresh hosted HTTP/browser Auth checks | **5 groups passed** | `verify-web-auth.mjs --controlled-read`; actual A/B login forms/scoped reads, route/CSRF/recovery restrictions, refresh, temporary mapping revocation and replay denial; temporary source changes restored and lease closed |
| Real-account isolated HTTP workflow | **5 groups passed** | `scripts/workbench/test-http.mjs`; anonymous denial; actual A/B/admin hosted password login and current identity; database-backed scoped projection, configuration-only admin without cases, unknown document denial, CSRF/logout; actual recovered role-revoked applicant stays Pending Approval/403. No hosted business record or original officer role changed. |
| Fourth applicant actual mailbox recovery | **PASS** | Human supplied actual newest unopened email URL; original PKCE callback/password change; old password/session rejected; new login preserves revoked role; logout |
| Fourth applicant natural JWT expiry | **PASS** | Exact original issued token fingerprint/signature verified; explicit hosted 401 for natural expiry, no substituted/edited token |
| Current password signup | **IMPLEMENTED; fresh owner acceptance pending** | Real SDK no-PKCE/immediate-session contract verified; owner-disabled Confirm Email verified online. Historical verification callback is no longer a dependency. No approved unused fifth address was supplied; no account was invented/deleted to manufacture a pass. |
| Actual IndicTrans2 inference | **PASS, three directions** | Official pinned MIT models, actual local WSL CPU inference: Marathi → English, Hindi → English, English → Hindi; unauthorized API denied. Concurrent build/model cold-start probes hit resource/time limits. Final Linux-cache, one-resident-direction service passed all three directions; quality acceptance remains manual. |
| Actual model-to-SQL integration | **PASS** | Actual authenticated service → leased disposable PostgreSQL queue → retained original/machine text/model SHA → human review/correction gate. Fictional source text/synthetic actors; no hosted complaint sent. |
| Python service checks | **5 passed** | Real Lingua detection and explicitly stubbed HTTP/error contracts; separate actual model runs above. |
| Gmail delivery / real Gemini / binary scanner | **BLOCKED** | Exact dedicated mailbox approval/OAuth, approved-project Gemini key and scanner configuration absent. No mailbox read, embedding result or binary scan success claimed. |
| Supabase security advisors | **EXECUTED; warnings remain** | Seven legacy mutable-search-path warnings, intentional caller-only session-revocation definer notice, leaked-password protection disabled. Exact functions/rationale in Phase 9; no silent managed/legacy changes. |

The actual HTTP check initially rejected requests using `127.0.0.1` as Origin against the configured `localhost` Auth origin. Same-origin protection correctly failed closed. The workbench launchers, guide and HTTP runner now consistently use `http://localhost:3000`, while the network listener remains loopback-only. The corrected real-account checks pass. No CSRF exception or alternate-origin allowlist was added.

The staged credential scan covers operator/gateway/runtime credentials, all approved Auth test credentials/cookies/JWTs, real saved mailbox URLs, worker provider secrets and Gmail OAuth tokens; it prints aggregate results only. Baseline hashes are rechecked. Public route destinations stored by recovery runners are excluded only when they contain no secret callback parameters.

Generated hosted receipts and private local logs remain ignored. See [feature readiness](FEATURE_READINESS.md) for the hosted activation boundaries and [manual guide](SYNAPSE_MANUAL_TEST_GUIDE.md) for reproducible commands. GitHub final-head CI evidence is reported in the delivery/PR, not assumed from an earlier commit.

## Bootstrap and external security-scan review

Both GitHub Actions runs for implementation commit `2b2131e` passed. GitGuardian separately reported a **Generic Database Assignment** at `scripts/workbench/setup.mjs:26`, the `initdb` argument construction. Source inspection establishes that the reported expression is a private password-file **path reference**, not a password/credential value. Exact configured-secret scans also passed. No credential rotation or history rewrite is justified by that code-only finding.

The follow-up makes option/value arguments explicit and configures SCRAM for both TCP and local-socket authentication on newly created clusters. A fresh disposable `initdb` probe accepted those exact arguments; no server was started and no existing cluster was modified. Idempotent `workbench:setup` also passed against the existing isolated environment. No scanner ignore rule or check-result bypass was added. GitGuardian's final external classification is reported separately in delivery; Actions success does not imply that a third-party security finding has been resolved.
