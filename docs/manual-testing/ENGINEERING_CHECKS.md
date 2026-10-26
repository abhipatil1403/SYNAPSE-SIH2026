# Engineering checks — 27 October 2026

Owner acceptance remains **AWAITING USER MANUAL TESTING**. This document records executed checks; it does not authorize hosted activation.

| Check | Verified result | Evidence/limit |
|---|---|---|
| Unit/contract tests | **105 passed** | `npm test`; Google/Gmail HTTP transports are explicitly simulated |
| Automated browser regressions | **31 passed** | `npm run test:browser:isolated`; production server with hosted/workbench writes off; Demo and platform-engine UI fixtures distinguished in test names; responsive widths included |
| Typecheck/lint/production build | **PASS** | `npm run typecheck`, `npm run lint`, `npm run build` |
| Baseline check | **PASS** | SHA-256/catalog match; no baseline rewrite/reset |
| Existing isolated SQL suites | **PASS** | `test:database:platform`, `test:database:auth`, `test:database:sla`; original 69 tables/30 legacy functions reconstructed in disposable databases; managed Auth/JWT helpers simulated locally |
| New isolated workbench SQL suite | **11 groups passed** | `test:database:workbench`; actual PostgreSQL environment RLS, non-owner runtime/domain scope, uniqueness/idempotency/concurrency, scoped grant/revocation, independent transfer, actual recorded conflicts/SLA, evidence bytes/hash/closure, 40 synthetic-source jobs, atomic source-attachment promotion, **simulated** provider pipeline/human translation gate, rollback and reload |
| Fresh hosted issued-JWT authorization | **11 groups passed** | `verify-hosted-auth.ts --controlled-read`; original A/B positive reads/isolation, current authority, refresh and both logout boundaries; bounded test lease closed afterward |
| Fresh hosted ACL/RLS/grant audit | **10 groups passed** | `audit-gateway.mjs`; fixed search path/owners, no privileged runtime/source grants, public reads closed, FORCE RLS, final read gate closed |
| Fresh hosted HTTP/browser Auth checks | **5 groups passed** | `verify-web-auth.mjs --controlled-read`; actual A/B login forms/scoped reads, route/CSRF/recovery restrictions, refresh, temporary mapping revocation and replay denial; temporary source changes restored and lease closed |
| Real-account isolated HTTP workflow | **5 groups passed** | `scripts/workbench/test-http.mjs`; anonymous denial; actual A/B/admin hosted password login and current identity; database-backed scoped projection, configuration-only admin without cases, unknown document denial, CSRF/logout; actual recovered role-revoked applicant stays Pending Approval/403. No hosted business record or original officer role changed. |
| Fourth applicant actual mailbox recovery | **PASS** | Human supplied actual newest unopened email URL; original PKCE callback/password change; old password/session rejected; new login preserves revoked role; logout |
| Fourth applicant natural JWT expiry | **PASS** | Exact original issued token fingerprint/signature verified; explicit hosted 401 for natural expiry, no substituted/edited token |
| Automatic signup callback reliability | **BLOCKED** | First callback failed, despite real provider confirmation. Separate password login/Pending Approval passed. Safe diagnostics added; no successful fresh signup callback evidence is inferred from recovery. |
| Gmail delivery / real Gemini / real Translation / binary scanner | **BLOCKED** | Adapters implemented; exact mailbox approval/OAuth and actual provider keys/scanner configuration absent. No mailbox read or actual inference/scan success claimed. |
| Supabase connector advisors | **BLOCKED BY TOOL POLICY** | Denied connector call; direct authorized catalog tests do not substitute for a clean advisor run |

The actual HTTP check initially rejected requests using `127.0.0.1` as Origin against the configured `localhost` Auth origin. Same-origin protection correctly failed closed. The workbench launchers, guide and HTTP runner now consistently use `http://localhost:3000`, while the network listener remains loopback-only. The corrected real-account checks pass. No CSRF exception or alternate-origin allowlist was added.

The staged credential scan covers operator/gateway/runtime credentials, all approved Auth test credentials/cookies/JWTs, real saved mailbox URLs, worker provider secrets and Gmail OAuth tokens; it prints aggregate results only. Baseline hashes are rechecked. Public route destinations stored by recovery runners are excluded only when they contain no secret callback parameters.

Generated hosted receipts and private local logs remain ignored. See [feature readiness](FEATURE_READINESS.md) for the hosted activation boundaries and [manual guide](SYNAPSE_MANUAL_TEST_GUIDE.md) for reproducible commands. GitHub final-head CI evidence is reported in the delivery/PR, not assumed from an earlier commit.

## Bootstrap and external security-scan review

Both GitHub Actions runs for implementation commit `2b2131e` passed. GitGuardian separately reported a **Generic Database Assignment** at `scripts/workbench/setup.mjs:26`, the `initdb` argument construction. Source inspection establishes that the reported expression is a private password-file **path reference**, not a password/credential value. Exact configured-secret scans also passed. No credential rotation or history rewrite is justified by that code-only finding.

The follow-up makes option/value arguments explicit and configures SCRAM for both TCP and local-socket authentication on newly created clusters. A fresh disposable `initdb` probe accepted those exact arguments; no server was started and no existing cluster was modified. Idempotent `workbench:setup` also passed against the existing isolated environment. No scanner ignore rule or check-result bypass was added. GitGuardian's final external classification is reported separately in delivery; Actions success does not imply that a third-party security finding has been resolved.
