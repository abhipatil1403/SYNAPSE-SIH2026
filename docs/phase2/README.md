**Current authority: [Phase 2 security sign-off](SECURITY_SIGNOFF.md). Original JWT expiry is verified; persistent preview remains NO-GO because provider-only logout permits direct-RPC replay until JWT expiry. The manual privilege review completed; managed advisor output is unavailable.**

# Phase 2 — authentication and two-account isolation

Phase 2 is implemented and verified with the two approved accounts. Persistent read-preview activation remains blocked by actual token-expiry evidence and independent security review. Global Live Mode, business writes, the delivered server read gate and the database read gate remain disabled outside bounded controlled tests. Phase 1's baseline, migrations, Demo Mode and dashboard UI are preserved.

## Credentials and trust

Operator credentials belong only in ignored `.env.operator.local` at the repository root:

```dotenv
SUPABASE_SECRET_KEY=
DATABASE_URL=
# Optional custom path; default below is used automatically if present.
SUPABASE_DB_CA_FILE=
```

Use Settings → API Keys → Secret key and the direct/session-pooler connection from Connect. Download the server root certificate from Database Settings → SSL Configuration to `.local/phase2/supabase-db-root.crt`, or set `SUPABASE_DB_CA_FILE`. URL-encode special characters in the database password. Omit TLS query overrides. Certificate and hostname verification remain enabled, with CA trust scoped to the operator connection; the configured CA resolved the observed `SELF_SIGNED_CERT_IN_CHAIN` error. Connections to a different project are rejected.

The secret key is used only for approved Auth administration. Operator PostgreSQL access performs reviewed migrations, provisioning, fixture preparation and authorization tests. Application data reads always use the publishable key and the actual user's JWT. Operator credentials are removed from the temporary web process environment and never imported into browser/application data code.

The URL and publishable key remain in `.env.local`; global mode remains `demo`. `SYNAPSE_PREVIEW_AUTH_IDS` is a server-only allowlist of actual Auth UUIDs, empty by default. No Demo Mode identity or browser-selected role affects live identity.

## Approved provisioning

The actual approved email pair is stored only in ignored `.local/phase2/approved-accounts.json`. Exact active `CASE_OFFICER` records and Approval/Academic Bureau records are checked against the deployed schema. Ambiguous matches fail closed; missing Bureaus may be clearly labeled development-only seeds, without renaming operational records. Both approved accounts, active internal mappings and separate current Bureau memberships/role assignments are now provisioned. Test authority expires **2026-10-29 at 12:00 UTC**.

Passwords are random and stored only in a Windows CurrentUser DPAPI-encrypted vault under `.local/phase2/`. No plaintext credentials are logged, committed or sent in email. The vault is written atomically and its round-trip is checked before Auth mutations. Provisioning refuses unrelated existing accounts, revoked/suspended mappings and identity collisions.

The first attempt created Officer A's Auth user before Windows PowerShell module loading broke encryption. No internal mapping/access existed then. `recover-provisioning.mjs --recover-unmapped-owned-account` securely rotated only this newly created, never-used, unmapped account owned by the approved run, then saved its credential in DPAPI. That recovery rejects accounts older than one hour, previously used accounts and unrelated/operational identities. The vault now calls .NET DPAPI directly, avoiding the module-loading failure. Both accounts subsequently passed real login tests.

Two clearly synthetic, additive case fixtures, a development institution/category and any missing development Bureaus support isolation testing. Existing operational records are not overwritten. No document files are fabricated.

## Applied migration and security boundary

`20261026121302_phase2_session_revocation.sql` is applied and matches deployed migration history. Its reviewed SHA-256 is recorded in `migration-review.json`. It adds:

- A restricted NOLOGIN/NOINHERIT/NOBYPASSRLS session-revoker role and private forced-RLS session tombstones. Its current-session-only RPC has no client identity arguments or business-table privileges.
- Strict verified-gateway subject/session/role/expiry checks and immediate registry rejection of an otherwise valid JWT after SYNAPSE logout.
- An expiring `read_until` database lease, preventing a failed test from leaving reads enabled indefinitely.

The first hosted application attempt rolled back on a function-comment ownership error. Moving that comment into the owner role scope fixed it; all 69 local SQL assertions were rerun before successful application. No broad grants, schema exposure, RLS bypass, legacy workflow rewrite or database reset occurred. Both read RPCs retain their restricted non-owner role, empty search path, row security and authenticated-only execution grants. All **30 original legacy functions** match the baseline in the current hosted audit.

Local and hosted SQL suites each passed **49 Phase 1 + 20 Phase 2 assertions** and rolled back their fixtures. Managed PostgreSQL is not superuser: the Phase 2 fixture transaction temporarily permits the administrator to SET the reader role and rolls that membership change back. API roles gain no privileges. Test leases preserve PostgreSQL timestamp precision by comparing exact server timestamp text; both actual session and HTTP runs restored their gate.

Advisor 0029 describes the intentional authenticated SECURITY DEFINER boundary. Automated ownership/grant/RLS verification is not independent security signoff. See `SECURITY_REVIEW.md`.

## Sessions and UI

- Real password login performs online `getUser()` validation, resolves the explicit active Auth/internal binding and checks the server Auth UUID allowlist.
- Request-scoped server clients use HttpOnly, SameSite Lax cookies scoped to `/api/phase1`; cookies are Secure on HTTPS. Private responses are no-store and return no session tokens.
- Same-origin refresh rotates the provider session and rechecks current database authorization.
- Logout works with the read gate off, records current-session revocation before provider sign-out, always clears cookie chunks and reports incomplete remote revocation honestly. Cross-tab logout clears/revalidates visible case data.
- Protected API routes serve only authorized read-only case DTOs. The public preview shell contains no private SSR payload. Dashboard, fictional Demo Mode actors and workflows remain separate.

## Reproduction

Run from the repository root; commands never print credentials:

```powershell
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/preflight.mjs
npm.cmd run baseline:check
npm.cmd run test:database:phase2
npm.cmd run phase2:audit
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/hosted-tests.mjs
npm.cmd run phase2:provision:check
```

The migration/provisioning steps are already applied. Their reproducible, explicitly selected operator procedures are:

```powershell
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/apply-reviewed.mjs --apply-reviewed
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/provision.mjs --apply
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/fixtures.mjs --apply
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/verify-auth.mjs --controlled-read
node --env-file=.env.local --env-file=.env.operator.local scripts/phase2/test-preview.mjs --controlled-read
```

The separately authorized operator path was used after connector requests were denied; it is not an automatic permission workaround. Migration application matches exact recorded source and refuses history drift. Controlled verification refuses an already enabled gate or additional active identity mappings. It obtains a ten-minute database read lease and restores the prior disabled state. `test-preview.mjs` starts a bounded loopback-only production process on 127.0.0.1:3001, runs actual HTTP/Edge checks and stops it in cleanup. The global application configuration is never changed.

## Evidence

| Evidence | Verified scope |
|---|---|
| `hosted-security-before.json` | Pre-migration current ownership, grants, RLS and Phase 1 history |
| `hosted-security-review.json` | Current read-RPC security, all migration source matches, 30 legacy functions preserved, approved separate Bureau scopes |
| `hosted-authorization-results.json` | 69 hosted simulated-claim SQL assertions; all fixtures rolled back |
| `local-database-results.json` | Baseline restore/comparison and 69 local simulated-claim SQL assertions |
| `provisioning-results.json` | Two approved accounts, bounded authority, no public credentials |
| `session-readiness.json` | Actual issued JWTs: login, online/signature identity, refresh rotation, Bureau/search isolation, document/operation denial, suspension/role revocation, logout access-token replay denial and refresh-token invalidation |
| `http-session-results.json` | Two real cookie jars/Edge contexts, actual login forms, authorized list rendering, refresh/logout controls, origin protection, write/role-injection rejection and independent logout |
| `locked-http-results.json` | 15 locked-app/provider checks, including forged JWT rejection; positive Auth flags apply only to that locked profile |

`GET /api/phase1/readiness` combines a current Auth health/environment probe with matching-project receipts no older than 24 hours. Missing, malformed, future or stale evidence remains blocked. Conflicting fresh receipts fail closed regardless of file order; current checks override receipts. No emails, UUIDs, tokens or case data are exposed. Readiness never enables a mode or writes.

## Remaining blockers

**Critical for persistent preview activation:** the fresh sign-off found a confirmed provider-only logout replay defect. Original signed-token expiry is now verified. The fresh manual RPC/grant/RLS review completed and records a failed lifecycle sign-off, with no external-human certification claimed. Current connector advisor/metadata requests are denied; direct operator catalog checks passed, but no fresh managed-advisor result is claimed.

Administrative/provider-only sign-out outside SYNAPSE still needs session synchronization/auth.sessions validation if immediate JWT invalidation is required. Loopback checks do not certify HTTPS Secure-cookie delivery, deployment policies or MFA/session policy. Legacy business-write, storage and operational workflow blockers remain outside this read-only phase.

The Phase 1 enabled-preview rejection by automatic approval review is historical. This Phase 2 bounded loopback test succeeded; no current policy rejection is claimed for it. Global Live Mode, all business writes and persistent preview activation remain disabled.
