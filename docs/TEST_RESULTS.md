# Verified results — 26 October 2026

## Phase 2 security sign-off — latest

Read [the complete security sign-off](phase2/SECURITY_SIGNOFF.md) for exact UTC timestamps and file changes. **Read-only activation: NO-GO. Phase 3 preparation: GO only for offline contracts/design/tests behind disabled gates.**

The exact original JWT (pinned fingerprint, original verified signature and exp) was rejected by the hosted gateway with **401 / PGRST303** after **26 October 2026, 19:20:59 IST**. No refresh or replacement was used for that check. The fresh manual catalog review confirmed restricted RPC ownership/grants/RLS and preserved database integrity, but actual provider-only logout left its unexpired JWT able to read the direct RPC. That is a verified failure, not an assumed risk. The managed advisor remains **ADVISOR UNAVAILABLE**.

**Passing:** 72 unit tests; 23 full browser tests; 15 locked/provider HTTP checks; 69 local and 69 hosted SQL assertions; actual two-account login, refresh/logout UI, Bureau isolation, suspension/role/mapping revocation, expired membership and original JWT expiry; typecheck, lint and production build. **Focused negatives:** eight passing checks and one confirmed failure for external session invalidation. No all-green security claim is made.

The database/server gates remain off, no preview listener remains on 3001/3002, global mode is Demo and live business writes remain disabled. Local operator/private Windows ACLs were corrected; Next dev/start now reject operator credentials. Source/docs/build/test artifact exact-value scans found no configured secrets or approved emails. Git history, hosted logs, unsuccessful GraphQL introspection and an unspecified remote HTTPS deployment are explicitly not certified. No new migration or dashboard redesign was introduced.

## Phase 2 implementation verification — earlier

| Check | Result |
|---|---|
| Deterministic baseline and manifest | PASS, preserved |
| Local disposable database authorization | PASS, **69 / 69** assertions |
| Actual hosted database authorization | PASS, **69 / 69** assertions; fixtures rolled back |
| Hosted ownership/grants/RLS/history | PASS; all three migrations match; 30 original functions unchanged |
| Real Supabase Auth / two-Bureau isolation | PASS, both approved accounts; refresh rotation, suspension, role revocation and logout replay denial |
| Actual HTTP + Edge authentication | PASS, two cookie jars, both login/refresh/logout UI controls, own-only case rendering, origin/write/role-injection rejection |
| Unit tests | PASS, **71 / 71** |
| Full browser regression | PASS, **23 / 23**, 2.5 minutes, existing dashboard/Demo workflows included |
| Locked application/provider HTTP checks | PASS, **15 / 15**, including forged JWT rejection |
| Typecheck / lint / production build | PASS |
| Real signed-token expiry rejection | BLOCKED until expiry probe reaches **2026-10-26 13:50:59 UTC** |
| Independent RPC/advisor 0029 signoff | BLOCKED; connector advisor access denied; operator catalog audit succeeded |

The approved test pair and separate expiring internal scopes are provisioned. Credentials are DPAPI encrypted and absent from reports. Two synthetic case fixtures are explicitly development-only. The bounded loopback preview was stopped, database read gate is verified false with null lease, delivered server gate is off, global mode is Demo and business writes are disabled. Live-preview activation is **not approved**. Test evidence is in [Phase 2](phase2/README.md), especially `hosted-security-review.json`, `hosted-authorization-results.json`, `session-readiness.json`, `http-session-results.json`, `readiness-results.json` and `final-state.json`.

The initial migration ownership error rolled back completely and was corrected before application. The Windows vault issue was fixed before securely recovering only the just-created unused test account. Provider logout replay returns SQLSTATE 28000 / HTTP 403 for an authenticated expired application session; the server maps it to 401. No provider expiry, independent review or HTTPS-deployment result is inferred from local tests. Current Phase 2 controlled tests succeeded; the Phase 1 policy-blocked preview attempt below is historical.

## Phase 1 verification — historical

| Command / check | Result |
|---|---|
| `npm.cmd run baseline:check` | PASS, deterministic SQL and SHA-256 manifest match the original catalog |
| `npm.cmd run test:database` | PASS, disposable restore/comparison, both corrective migrations, **49 / 49** SQL authorization assertions, no surviving fixtures or sequence changes |
| Same authorization SQL on deployed Supabase PostgreSQL 17.11 | PASS, **49 / 49**, rolled back, both preview gates remain off |
| Deployed migration-history comparison | PASS, both local files match recorded deployed SQL; all 30 legacy functions unchanged |
| `npm.cmd test` | PASS, **58 / 58** domain/calendar/live-contract/request-security tests |
| `npm.cmd run test:e2e` against production server | PASS, **21 / 21**, 2.0 minutes |
| `node --env-file=.env.local scripts/test-phase1-http.mjs` | PASS, **15 / 15** locked-app and real-provider checks |
| Typecheck / lint / production build | PASS, zero TypeScript errors or ESLint warnings/errors |

The actual Supabase provider rejects a forged JWT (Auth: 403 `bad_jwt`; Data API: 401), anonymous registry RPC access (401), and private-schema access (406). The delivered app remains explicitly in Demo Mode; `/live-preview` shows a locked state, and its write methods return 405. The database readiness flag remains false; no Auth accounts, internal users, identity links or cases were provisioned.

**Not verified:** a successful real-issued-JWT login, session refresh, two-account session isolation or positive end-to-end registry access. Those require approved provisioned identities. SQL tests simulate verified gateway claims in a rolled-back transaction; the two registry UI tests use explicit test-only HTTP fixtures. Neither substitutes for real Auth issuance. Starting a separate enabled-preview HTTP test server was rejected by automatic approval review (`blocked by policy`); no alternative activation was attempted. The delivered locked-app/provider profile passed instead.

See `phase1/README.md`, `phase1/local-database-results.json`, `phase1/deployed-database-results.json`, `phase1/http-results.json`, and `phase1/migration-manifest.json` for exact boundaries, evidence and remaining activation/write blockers. Screenshot: `screenshots/phase1-preview-locked.png`.

The optional last read-only catalog refresh after resumption was denied by the Supabase connector. Earlier successful hosted authorization and post-migration catalog evidence are retained with their original timestamps; no fresh catalog confirmation is claimed. The final locked-app/provider HTTP checks passed again.

## Overview refinement verification — earlier

| Command / check | Result |
|---|---|
| `npm.cmd run typecheck` | PASS, no TypeScript errors |
| `npm.cmd run lint` | PASS, zero ESLint warnings/errors |
| `npm.cmd test` | PASS, **49 / 49** domain and calendar/chart tests |
| `npm.cmd run build` | PASS, optimized Next.js 16.4.3 build |
| `npm.cmd start` | PASS, production server ready on localhost:3000 |
| `npm.cmd run test:e2e` against that production server | PASS, **18 / 18** browser tests, 3.5 minutes |
| Final `npm.cmd run test:e2e -- tests/e2e/overview.spec.ts` | PASS, **4 / 4** after the mobile calendar width correction and final rebuild |
| `/api/health` | 200, explicitly reports local demo persistence and live workflows disabled |
| `/api/integration` | Expected 503, dated verification snapshot and explicit integration blockers |

The complete browser run used installed Microsoft Edge in headless mode, one worker, and a default 1536×1024 viewport. All 14 navigation routes rendered without page errors or console errors in the clean automated browser. Overview checks at **1763, 1536, 1440, 1366, 768, and 390 pixels** found no document-level horizontal overflow. Other responsive checks cover complaints, calendar, dependencies and resolutions. Wide tables remain internally scrollable.

The local production server is the delivered running prototype. The development preview server used earlier was stopped before the final browser pass. To reproduce the final pass, build/start the application and run browser tests in a second terminal; the test configuration reuses the running server.

Visual review after the complete suite caught a mobile-only calendar width mismatch caused by its desktop `align-self` rule. The mobile rule now stretches the card to the column width. A new responsive assertion verifies equal card widths, and the four Overview tests passed again against the rebuilt production application. Final typecheck, lint and build also passed. No workflow or repository logic changed in that correction.

## Tested workflows

1. Separate DETAILS and DOCUMENTS requests, Supervisor approval, source isolation, and later authorized source preview.
2. Text evidence upload, SHA-256 retention, refresh persistence and download.
3. Responsive layouts and no document overflow across four alternate widths.
4. All 14 navigation routes with shared shell and no page/console errors.
5. Case notes after refresh and accountable actor in the audit timeline.
6. Ctrl+K scoped global search and navigation.
7. Auditor read-only action restrictions and Admin's lack of blanket case access.
8. Blocked closure versus a passing, human-approved disposal; persisted removal from the review queue.
9. Marathi original/precomputed translation, required extraction verification, registration, and registry count reconciliation.
10. Kanban adjacent-stage movement persisted after refresh.
11. Human finding review with a reason and no automatic merging.
12. Reverse dependency rejection with an actionable cycle error.
13. Settings save/refresh/discard, calendar navigation, and mobile drawer navigation.
14. Seven desktop visual captures and a mobile dashboard capture.
15. Overview calendar previous/next month, Today, day agenda, actual event navigation and full-calendar handoff with the selected date.
16. December/January boundaries and keyboard date selection.
17. Calendar authorization scope and chart period/series controls.
18. Compact Overview proportions, substantial chart marks, readable numeric typography and reduced motion at six viewport widths.

The domain suite additionally covers malformed persistence, deterministic seeding, role and audit scope, stale revisions/versions, illegal transitions, hold/resume, work permissions, forged/stale Quality Gate attempts, reopening history, evidence version preservation, self-links/cycles, intake idempotency, unauthorized export, transfer decisions, scoped grant expiry and rejection of browser-supplied grant claims. Ten added tests cover India midnight, leap years/month boundaries, malformed dates, authorized shared events, offset-aware sorting, actual optional scheduled event inputs, and exact chart bucket reconciliation.

Earlier development runs exposed a protected HMR-hostname mismatch, test locators that matched nested select labels or both Next's route announcer and the error toast, and a cold-development bootstrap timeout while building concurrently. These were resolved or isolated. The final complete pass used **localhost and the production build**, with no source edits during execution. No app check is reported as passing on the basis of a failed earlier run.

## Visual artifacts

Captured at 1536×1024, full-page:

- `screenshots/dashboard-desktop.png`
- `screenshots/tasks-desktop.png`
- `screenshots/calendar-desktop.png`
- `screenshots/analytics-desktop.png`
- `screenshots/team-desktop.png`
- `screenshots/settings-desktop.png`
- `screenshots/help-desktop.png`

Mobile capture: `screenshots/dashboard-mobile.png` at 390×844. The captured pages were visually inspected. Charts have source-derived data; screenshot checks disable animation to capture final values.

The Fernly screenshots are now available in `SYNAPSE_Codex_Starter/reference/screenshots/`. Overview was compared with dashboard reference 04 at its exact **1763×1163** viewport. Additional captures are `screenshots/overview-refined-{1763,1536,1440,1366,768,390}.png`. At 1536×1024, full-page height decreased from **1832px to 1457px** (20.5%) while adding Calendar and increasing typography, chart columns and gauge size. The preserved baseline is `screenshots/overview-before-1536.png`. See `OVERVIEW_REFINEMENT.md` for calibrated dimensions and shared calendar behavior.

## Supabase checks actually performed

Verified the connected Adi / SYNAPSE project, platform health, schema/table metadata, actual column and function definitions, constraints, indexes, policies, triggers, RLS coverage, migration history, empty operational/Auth/storage state, sampled client grants, security/performance advisors and log-source distribution. A publishable-key Auth health probe returned 200; private-schema Data API access returned expected 406/PGRST106. Two no-actor workflow authorization probes rejected with SQLSTATE 28000 and did not mutate application data.

**Not claimed:** live Supabase authentication, live UI persistence, comprehensive RLS tests, all security-definer-function tests, real document storage, production concurrency/load/recovery/backup tests, or official policy validation. Read `SUPABASE_AUDIT.md` for the concrete blockers and evidence.
