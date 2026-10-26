**Historical Phase 2 implementation report. Read the newer [SECURITY_SIGNOFF.md](SECURITY_SIGNOFF.md): actual expiry is now verified, and provider-only logout replay is a confirmed activation blocker.**

# Phase 2 completion report — 26 October 2026

Real authentication and the read-only registry were verified against hosted Supabase using the two approved accounts. **Persistent read-only preview is not yet cleared for activation. Global Live Mode and business writes remain disabled.**

## Exact implementation changes

| Files | Result |
|---|---|
| `supabase/migrations/20261026121302_phase2_session_revocation.sql` | Applied session tombstones/current-session logout RPC, restricted revoker role, stricter verified JWT subject checks, expiring read lease; exact deployed/local source match |
| `supabase/tests/phase1-authorization.sql`, `phase1-authorization.original.sql`, `phase2-authorization.sql` | Original evidence preserved; current compatible claim/lease tests plus 20 new session/RLS assertions |
| `lib/live/config.ts`, `server.ts`, `session.ts`, `contracts.ts` | Actual Auth UUID allowlist, online identity verification, request-scoped HttpOnly cookies, explicit revocation/provider logout ordering and safe cookie cleanup |
| `app/api/phase1/sign-in/route.ts`, `sign-out/route.ts`, `refresh/route.ts` | Real login; same-origin refresh with reauthorization; logout works while read gate is locked |
| `lib/live/readiness.ts`, `readiness-server.ts`, `app/api/phase1/readiness/route.ts` | Current provider/env checks, expiring project-scoped evidence, conflicting evidence fails closed; no automatic activation |
| `components/live-case-registry.tsx`, `live-readiness.tsx`, scoped live-preview rules in `app/globals.css` | Refresh/logout interactions, cross-tab clearing, safe read-only registry and expandable readiness checklist |
| `.env.example`, `.env.operator.example`, `.gitignore` | Separate public/application/operator configuration; actual credentials remain ignored |
| `scripts/phase2/operator.mjs`, `database-tls.mjs`, `security.mjs`, `hosted-audit.mjs`, `apply-reviewed.mjs`, `preflight.mjs` | Verified TLS/project pinning, exact migration/hash checks, current deployed ownership/RLS/grant/legacy audit |
| `scripts/phase2/plan.mjs`, `vault.mjs`, `provision.mjs`, `recover-provisioning.mjs`, `fixtures.mjs` | Approved bounded provisioning, CurrentUser DPAPI, tightly guarded interrupted-creation recovery and additive development fixtures |
| `scripts/phase2/lease.mjs`, `hosted-tests.mjs`, `verify-auth.mjs`, `verify-http.mjs`, `test-preview.mjs` | Hosted SQL, real JWTs, real HTTP/Edge isolation, exact timestamp cleanup, bounded loopback test process |
| `scripts/test-database.mjs`, `tests/session.test.ts`, `readiness.test.ts`, `provisioning.test.ts`, `database-tls.test.ts`, `tests/e2e/phase2.spec.ts` | Database/session/readiness/provisioning/TLS/browser regression coverage |
| `package.json`, `package-lock.json`, `README.md`, `docs/TEST_RESULTS.md`, `docs/phase2/*` | Operator PostgreSQL tooling, reproducible commands, evidence and current blockers |

The Phase 1 baseline and both prior migrations remain intact. All **30 original legacy functions match the hosted baseline**. The dashboard and Demo Mode workflows remain intact; no application business-write endpoint was enabled.

## Provisioned scope

The approved emails stay in the private approval plan. Exact deployed scopes are:

| Slot | Development Bureau | Code | Role |
|---|---|---|---|
| A | Approval Bureau · Phase 2 development test | `P2_APPROVAL_OFFICERS` | `CASE_OFFICER` |
| B | Academic Bureau · Phase 2 development test | `P2_ACADEMIC_OFFICERS` | `CASE_OFFICER` |

These clearly labeled Bureaus were seeded because exact approved Bureau records were absent. Both accounts have active trusted internal mappings and separate expiring memberships/role assignments, valid until **2026-10-29 12:00 UTC**. Two explicitly synthetic cases support positive/negative reads. Passwords are random and DPAPI encrypted, never public. The ignored operator environment file and downloaded root CA are configured; no environment values appear in this report.

## Verified tests

- **71/71 unit tests**, **23/23 complete browser tests**, **15/15 locked-app/provider HTTP checks**; typecheck, zero-warning lint and optimized production build passed.
- **69/69 local and 69/69 hosted SQL authorization assertions** passed; SQL fixtures rolled back. Managed-role behavior was tested without granting API roles private access.
- Both accounts received real signed Supabase JWTs, passed signature/online identity validation and resolved distinct internal users.
- Refresh tokens rotated; actual access-token replay after application logout and saved refresh-token replay after provider logout were rejected.
- Each officer read its own case and could not retrieve/search the other Bureau case. Documents and legacy business operations were denied.
- Suspension and role revocation immediately removed Officer A's reads, while B retained only its own scope; original approved state was restored.
- Two separate Edge cookie jars rendered only their own authorized case rows. Both real login forms, refresh/logout controls, HttpOnly/SameSite/path checks, origin protection, role injection rejection and HTTP 405 business-write rejection passed.
- Current hosted ownership/grants/RLS, migration statements, original function definitions and exact approved Bureau/role joins passed. No unsafe read-RPC grant was found requiring a separate corrective grant migration.
- A source/document/browser-bundle scan found **zero matches** for actual operator secrets, database URL or test passwords across 119 files.

The isolated port-3001 process was stopped. `final-state.json` confirms database read gate false, null lease, 72 private tables, global Demo Mode and no persistent preview activation. The application remains available on localhost:3000 in Demo Mode. See the timestamped JSON evidence and `README.md` for reproduction commands.

## Unresolved blockers and limits

**Critical activation gates:**

1. Actual signed-token expiry rejection is pending until **2026-10-26 13:50:59 UTC / 19:20:59 IST**. An unchanged issued token is encrypted for this test. Rerun `verify-auth.mjs --controlled-read` after that time; a forged or edited token is not substituted for expiry proof.
2. Independent review of intentional authenticated SECURITY DEFINER RPCs/advisor 0029 is pending. Connector metadata/advisor/SQL requests were denied; separately authorized direct operator inspection succeeded. No fresh managed-advisor output or independent signoff is claimed.

**Operational limits:** immediate invalidation after external administrator/provider-only sign-out needs session synchronization or managed-session validation; HTTPS Secure-cookie delivery, distributed login throttling, MFA/session policy and deployment checks remain unverified. Loopback success is not production certification. Legacy business-write, storage and lifecycle-integration blockers remain outside this read-only phase.

The initial migration ownership failure rolled back completely before correction. An initial Windows vault failure left only an unused, unmapped Auth account; the restricted recovery fixed its credential securely before provisioning. Test cleanup was corrected to preserve PostgreSQL timestamp precision; subsequent actual runs restored their lease successfully.

The Phase 1 automatic approval rejection is historical. The explicitly authorized Phase 2 bounded preview ran successfully; no current policy-blocked result is reported as a pass or as a current activation denial. The dynamic readiness response remains **false**, reporting the two outstanding gates above.
