# SYNAPSE Phase 2 security sign-off

**Read-only preview activation: NO-GO. Global Live Mode and business writes: NO-GO.**

**Phase 3 implementation preparation: GO only for offline contracts, migration design and test preparation behind disabled gates.** This is not approval to activate a preview, execute operational writes, provision production staff or deploy live workflows. No Phase 3 work was started by this audit.

## Executive summary

The existing implementation was inspected against current hosted PostgreSQL definitions, effective privileges, RLS policies and actual Supabase-issued JWTs. The dashboard and Demo Mode are preserved. No migration, reset, schema exposure or permanent database grant was introduced during this sign-off pass. Original-token expiry is now verified; the session-lifecycle defect remains the critical blocker.

The review found a **confirmed session-lifecycle gap**: provider-only logout deletes the managed session, but its unexpired JWT still returns authorized case rows through the directly callable registry RPC. Online `getUser()` rejects that stale session, so the application server adds protection; the public Data API RPC remains a route around that check. The replay retained its former scope; it did not grant another Bureau's records. SYNAPSE's own logout correctly records a tombstone and immediately rejects replay. Persistent read activation must remain blocked until the direct-RPC lifecycle boundary is corrected and retested.

The original expiry token was recovered, signature-verified and fingerprinted before expiry. Its exact `exp` is **1793022659**, corresponding to **26 October 2026 13:50:59 UTC / 19:20:59 IST**. The final result is in `original-expiry-results.json`; see the timestamped expiry addendum below. No fresh login or token refresh is used by that verifier.

This is a dedicated fresh manual/code/catalog review by Codex in the same development conversation. It is independent of the earlier saved implementation assertions, **not an external human or second-reviewer certification**.

## Timestamped evidence

All machine-readable evidence carries its exact UTC `checkedAt` or `recordedAt`; IST is UTC +05:30. `signoff-verification.json` also records command completion times and SHA-256 fingerprints of local output logs.

| Evidence | Verified scope |
|---|---|
| `original-expiry-results.json`, `expiry-probe-manifest.json` | Original token fingerprint, signature, `exp`, current time and exact raw gateway result |
| `signoff-catalog.json` | Fresh repeatable-read, READ ONLY catalog transaction: 38 functions, 51 policies, owners, role memberships, source grants and RLS |
| `signoff-integrity.json` | Fresh comparison of all 69 original tables/630 columns, original constraints/indexes/triggers/view/sequences/grants/policies/reference data and documented additions |
| `hosted-security-review.json` | Exact deployed migration history, 30 unchanged legacy functions and the approved distinct Bureau scopes |
| `session-readiness.json` | Actual issued-JWT login, refresh rotation, suspension, role revocation, cross-Bureau isolation and application/provider logout replay tests |
| `negative-readiness.json` | Issued-JWT identity revocation, membership expiry, invalid signatures, actor injection, object enumeration and confirmed provider-only logout failure |
| `http-session-results.json` | Two real Edge contexts/cookie jars, both actual login forms, case-list rendering, refresh/logout controls and forbidden writes |
| `web-environment-results.json` | Actual Next.js development and production startup refusal with a non-secret operator-variable sentinel; no sentinel value emitted |
| `local-credential-acl.json` | Corrected Windows permissions on operator/private files; no broad-user allow rules remain |
| `artifact-secret-scan.json` | Exact-value scan of local source, docs, test artifacts, logs and client/server build output; private env/vault intentionally excluded |

## JWT expiry evidence

The original encrypted probe remains in the CurrentUser DPAPI vault. Only a one-way SHA-256 fingerprint is public:

`a2c1d082a207afbff061cf747c89cebc7aa3daa4f923a92eb12ae5107aa52102`

It was first observed at **2026-10-26T13:06:51.176Z**. Its issuer, numeric expiry, recorded expiry and signature against the project's public JWKS were checked. The verifier compares the fingerprint with the pinned manifest and fails closed on substitution. It uses raw HTTP with the exact original bearer JWT, never a refresh-capable client; it does not change either read gate. Explicit gateway expiry rejection is distinguished from SQLSTATE 28000 tombstone rejection.

If the original vault/manifest cannot be read, the verifier reports **NOT VERIFIED**. A replacement JWT, edited payload, local simulated claim or previous logout rejection is not accepted as expiry evidence.

## RPC and advisor 0029 review

**Managed advisor: ADVISOR UNAVAILABLE.** The authorized `supabase_get_advisors` security call returned `MCP error -32600: You do not have permission to perform this action`. This is recorded in `advisor-access.json`. No managed-advisor pass is claimed.

A fresh manual catalog equivalent found exactly **three** authenticated-callable SECURITY DEFINER functions in the public API schema. The platform's [0029 source predicate](https://github.com/supabase/splinter/blob/main/lints/0029_authenticated_security_definer_function_executable.sql) flags this exposure shape; it does not certify the implementation's authorization. Actual private-schema denial was also exercised over the hosted API.

| Function | Current owner | Reviewed behavior |
|---|---|---|
| `public.synapse_phase1_me()` | `synapse_case_reader` | Trusted active internal binding; scoped current roles; no browser actor parameter |
| `public.synapse_phase1_cases(text,text,text,integer,integer,text)` | `synapse_case_reader` | RLS-filtered registered cases, validated bounded filters/pagination, accurate authorized totals, no evidence payload or writes |
| `public.synapse_phase2_revoke_session()` | `synapse_session_revoker` | Parameterless current-verified-session tombstone only; idempotent; no business-table access |

Both owners are **NOLOGIN, NOINHERIT, NOBYPASSRLS**, own no source tables and have no inherited escalation path. All three functions set empty `search_path` and `row_security=on`. Non-owner EXECUTE is granted only to `authenticated`, without grant option; PUBLIC, anon and service-role execution is absent. Browser/API roles cannot assume either owner or CREATE in the public schema.

The reader has narrow source-column SELECT grants across 15 RLS-protected tables and no writes. The revoker can SELECT/INSERT only the current session's subject/session columns under forced RLS; it cannot SELECT cases/documents or mutate business tables. Neither owner has managed Auth schema USAGE. API roles have no private SYNAPSE schema USAGE or effective private column grants. The reader cannot execute any of the 30 legacy functions.

Private identity/security helpers remain SECURITY INVOKER with empty search paths. They derive subject/session from gateway-verified JWT claims, enforce authenticated/non-anonymous role and expiry, reject application tombstones, and join the explicit active `auth_identity_links`/internal user mapping. They do not authorize from editable user metadata, email, a Demo actor or `synapse.user_id`. The legacy setting and legacy definer functions remain outside this read path and inaccessible to browser roles.

Role assignments, active roles, current Bureau memberships, assignments and explicit case grants are evaluated through RLS. Counts/searches run on the same authorized relation. No SQL-injection, client actor escalation, unrestricted document path or unauthorized cross-Bureau row was observed. **The session-liveness defect remains a failed sign-off finding despite this privilege-boundary review.**

## Authentication and isolation matrix

| Scenario | Evidence type | Result |
|---|---|---|
| Approved A/B login and trusted identity resolution | Real provider-issued JWTs | PASS |
| Refresh-token rotation and stable identity/session | Real provider-issued JWTs | PASS |
| Application logout access-token replay and saved refresh-token replay | Exact previously issued tokens | PASS: registry rejects revoked access JWT; provider rejects refresh-token reuse after logout |
| Other-Bureau case retrieval/search | Both officers' actual JWTs | PASS: own fixture visible, other fixture absent/zero results |
| Other actor ID supplied to registry | Both officers' actual JWTs | PASS: unknown identity argument rejected with HTTP 404/PGRST202 |
| Other subject substituted in signed JWT | Both officers' actual JWTs, invalidated signatures | PASS: HTTP 401 |
| Unauthenticated read/logout RPC calls | Actual hosted API | PASS: HTTP 401 |
| Suspended internal officer | Real JWT plus scoped temporary account-state change | PASS: denied; original state restored |
| Role revocation | Real JWT plus scoped temporary expiry | PASS: A loses case rows; B remains scoped; original assignment restored |
| Explicit Auth mapping revoked | Real JWT plus temporary link revocation | PASS: identity/cases denied; original mapping restored conditionally |
| Bureau membership expired | Real JWT plus temporary membership expiry | PASS: scoped roles removed, zero cases, B unaffected; exact expiry restored |
| Private tables, security helpers and legacy business RPCs | Both officers' actual JWTs | PASS: public objects unavailable; private profile HTTP 406; no private schema/table privilege |
| Two browser sessions and logout independence | Actual Edge/HTTP cookies | PASS: distinct identities/cases; logout A does not end B |
| Browser write methods, role injection and cross-origin logout | Actual authenticated HTTP | PASS: 405/400/403 respectively |
| Stale JWT after provider-only logout | Real managed session deletion, exact original JWT | **FAIL: direct registry RPC returns HTTP 200 before JWT expiry; online getUser returned 400** |
| Stale JWT after SYNAPSE tombstone | Same signed session after application revocation | PASS: SQLSTATE 28000 immediately |
| Original JWT after actual expiry | Pinned original encrypted probe, raw HTTP | See final expiry addendum and `original-expiry-results.json`; no substitute token |

The actual issued-JWT matrix covers the two approved Case Officers. Head/Auditor/Admin and richer grant scenarios are covered by rolled-back simulated-claim SQL assertions, **not real newly provisioned accounts**. Positive live document retrieval/storage was not implemented or claimed. GraphQL returned HTTP 200 without a successful introspection schema; enumeration there is **NOT VERIFIED**, and no no-exposure pass is inferred from an empty result.

## Database integrity and grants

All three applied migrations match recorded deployed SQL:

1. `20261026105644_phase1_authenticated_case_reader.sql`
2. `20261026110430_phase1_verified_subject_context.sql`
3. `20261026121302_phase2_session_revocation.sql`

All 30 original legacy function definitions are unchanged. The baseline JSON/SQL/SHA manifest is intact and reproducible. Current integrity comparison preserves every original table shape, 440 original constraints, original indexes, seven triggers, one view, sequence definitions, original grants and five reference datasets. Only documented RLS enablement and the two reviewed legacy SELECT-policy target restrictions differ. Default ACLs are unchanged. Only the three reviewed Phase 1/2 tables were added: 72 private base tables total.

43 private tables still lack RLS; they are not exposed or granted to the API/registry roles. This is not a claim that all tables are ready for Live Mode. All 15 registry-readable sources have RLS. Legacy search-path/write/workflow concerns remain Phase 3 release blockers.

The two approved development identities, Bureaus and two synthetic case fixtures are intentional, labeled and retained for reproducibility. Their memberships/roles expire on **29 October 2026 at 12:00 UTC**. SQL fixtures rolled back. Issued-session revocation metadata is intentionally retained. No new business record, production identity or permanent grant was created in this sign-off pass.

## Verification results

- **72/72 unit tests**, **23/23 complete browser tests**, **15/15 locked-app/provider HTTP checks** passed.
- **69/69 local and 69/69 hosted SQL authorization assertions** passed; fixtures rolled back and the disposable database was removed.
- Actual two-account login/refresh/logout UI controls and cookie isolation passed in the bounded port-3001 process, which was stopped.
- Typecheck, zero-warning lint, production build, deterministic baseline check and script syntax checks passed.
- Focused issued-JWT negative checks: **eight PASS, one confirmed FAIL** (`external_logout_session_invalidation`). They are not summarized as an all-green security suite.
- Both actual Next.js `dev` and `start` refused a non-secret operator-variable sentinel without displaying its value. Unit coverage includes case-insensitive Windows environment names.

The initial SQL rerun exposed a test-only empty-table assumption: it counted every revocation row. The assertion now counts only its transaction's synthetic session IDs. Local and hosted reruns passed without deleting existing tombstones. A new negative-test locator was corrected to the deployed `membership_id` column before the complete successful scenario run; its failed attempt restored the gate/mapping and did not change membership state.

## Environment and disclosure safety

The delivered application stays in Demo Mode. Both persistent read gates remain off; the database lease is null after tests. There is no remaining preview listener on ports 3001/3002; only the existing Demo application on port 3000 is retained. Final observations are recorded in `signoff-final-state.json`.

Web startup now rejects inherited `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` and secret-bearing public-prefixed variables. Operator files are separately loaded only by operator scripts. The temporary web child strips operator credentials. No live session token is stored in browser localStorage; browser sessions use HttpOnly/SameSite cookies. Loopback cookie checks do **not** certify HTTPS Secure-cookie delivery on an unspecified remote host.

The operator env/private directory originally inherited broad local Windows-user access. This was corrected to current user, Administrators and SYSTEM; seven paths were checked with zero broad-user allow rules. An ignored SDDL backup exists for controlled recovery. Prior access cannot be disproved; no evidence of actual unauthorized reading was found. If the machine had untrusted users with access before the fix, credential rotation is an operator action to assess, not something silently performed here.

The exact-value artifact scan found no configured operator URL/key, test password, original token or approved email in scanned source/docs/tests/logs/client/server build output. The private env/vault are intentionally excluded. The root CA is a public server-trust certificate, not a private signing key. This workspace has no `.git` metadata, so Git-history disclosure is **NOT VERIFIED**; ignore rules cover env/private/log paths. Hosted log disclosure and an unspecified remote frontend hosting environment are also **NOT VERIFIED**. No secret value was displayed or copied into this report.

## Blockers and operator steps

**Critical — confirmed direct-RPC session-liveness gap.** Keep all persistent gates off. `session-fix-prerequisites.json` verifies that `auth.sessions` has RLS enabled, is owned by `supabase_auth_admin`, and the current operator cannot assume its owner role. No broad Auth grant, new BYPASSRLS helper or managed-schema policy was attempted. Follow the reviewed design constraints in `MANAGED_SESSION_REMEDIATION.md`, obtain a Supabase-supported/authorized owner route, prepare a minimal versioned correction and rerun the exact stale-session test. A clean sign-off requires that test to pass for A while B stays isolated.

**Expiry evidence:** use the original-probe commands below. If the original is absent or its fingerprint differs, record NOT VERIFIED and investigate; never manufacture a replacement pass. Before the checkpoint, leave expiry pending. After a successful original-token test, rerun the separate full session verifier to refresh its older readiness receipt.

**Unavailable checks:** restore authorized connector access or inspect Security Advisor in the project's Supabase dashboard for managed output. The manual catalog review above is the performed equivalent, not a managed-advisor pass. Remote hosting, HTTPS cookie delivery, hosted logs, Git history, MFA/session policy, distributed throttling and actual JWTs for unapproved roles remain outside verified evidence. Legacy business-write/storage/lifecycle and recovery/load requirements remain prerequisites for operational Phase 3 writes.

For GraphQL, have the authorized operator confirm the project's enabled schema/introspection configuration, then POST `{ __schema { queryType { fields { name } } mutationType { fields { name } } } }` as the JSON `query` to `/graphql/v1` using an approved issued JWT entirely in memory. Record only successful field names or a sanitized denial; do not print headers/tokens or treat HTTP 200 with GraphQL errors as proof. For HTTPS, configure an actual trusted HTTPS preview origin after the lifecycle fix, then repeat cookie/origin/session checks through TLS and confirm Secure cookies; the current HTTP runner deliberately accepts loopback only. For Git history and hosted logs, obtain authorized access to the real repository/log source and run a redacted disclosure scan; the current absence of `.git` and denied connector access cannot prove historic non-disclosure.

Run from the project root; do not paste credentials into chat:

```powershell
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/verify-original-expiry.mjs
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/verify-auth.mjs --controlled-read
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/signoff-negative.mjs --controlled-read
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/signoff-catalog.mjs
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/signoff-integrity.mjs
npm.cmd run phase2:audit
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/hosted-tests.mjs
npm.cmd run test:database:phase2
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/test-preview.mjs --controlled-read
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/scan-signoff-artifacts.mjs
```

These controlled runners require the approved pair, reject an already active gate and restore their bounded lease. They do not authorize persistent activation. A prior Phase 1 automatic-approval rejection is historical; no current policy-blocked check is described as passing.

## Exact changes in this sign-off pass

- `next.config.ts`; new `lib/web-environment.ts`, `tests/web-environment.test.ts`: fail-closed web/operator credential separation.
- `lib/live/readiness.ts`, `readiness-server.ts`, `tests/e2e/phase2.spec.ts`: require and display new negative/expiry evidence without a static assumption that review is merely pending.
- `supabase/tests/phase2-authorization.sql`: scope the tombstone-count assertion to its own synthetic sessions; no database migration changed.
- New `scripts/phase2/verify-original-expiry.mjs`, `signoff-negative.mjs`, `signoff-catalog.mjs`, `signoff-integrity.mjs`, `scan-signoff-artifacts.mjs`: reproducible original-token, hosted negative, catalog, integrity and disclosure checks.
- `docs/phase2/SECURITY_SIGNOFF.md`, `MANAGED_SESSION_REMEDIATION.md`, pinned expiry manifest, timestamped JSON evidence, readiness receipts and screenshot; Phase 2 README/report and overall test notes link this sign-off.
- Local ACLs on `.env.operator.local` and `.local/phase2` restricted; credentials and passwords were not changed. No dependency, migration or dashboard redesign was introduced.

## Final expiry and state addendum

**Original JWT expiry: PASS**, checked at **2026-10-26T13:51:35.135Z**. The pinned fingerprint matched, the original signature verified, and the unchanged token was rejected with **HTTP 401 / PGRST303**. Gateway date: **Mon, 26 Oct 2026 13:51:37 GMT**. This is actual expiry evidence, separate from logout revocation. The subsequent full session verifier also passed its actual-expiry check without replacing the pinned probe.

**Final state at 2026-10-26T13:54:52.221Z:** database read gate **false**, lease **null**, server gate **off**, preview allowlist empty, global mode **demo**, delivered case-list API **503**, live business writes disabled. Both remaining failed readiness IDs (`rpc_0029_review`, `external_logout_session_invalidation`) describe the **same confirmed provider-only logout lifecycle defect**. No expiry blocker remains. The recorded port check found zero listeners on 3001/3002; only the Demo application is retained.

**Decision remains NO-GO for read-only activation. Phase 3 preparation is GO only within the offline, gated scope above.**

| Evidence | Exact recorded UTC time |
|---|---|
| `signoff-catalog.json` | 2026-10-26T13:54:50.923Z |
| `signoff-integrity.json` | 2026-10-26T13:52:18.028Z |
| `hosted-security-review.json` | 2026-10-26T13:52:21.233Z |
| `hosted-authorization-results.json` | 2026-10-26T13:22:45.504Z |
| `local-database-results.json` | 2026-10-26T13:22:48.589Z |
| `session-readiness.json` | 2026-10-26T13:52:22.514Z |
| `negative-readiness.json` | 2026-10-26T13:34:36.279Z |
| `http-session-results.json` | 2026-10-26T13:28:15.067Z |
| `original-expiry-results.json` | 2026-10-26T13:51:35.135Z |
| `web-environment-results.json` | 2026-10-26T13:27:12.316Z |
| `local-credential-acl.json` | 2026-10-26T13:21:40.7365035Z |
| `signoff-final-state.json` | 2026-10-26T13:54:52.221Z |

