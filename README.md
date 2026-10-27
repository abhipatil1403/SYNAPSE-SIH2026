# SYNAPSE · SIH 2026

The original Fernly-inspired dashboard now uses authenticated server requests and persistent PostgreSQL. Supabase supplies real email/password authentication and approved officer identity. Operational development data uses a separate loopback PostgreSQL database; hosted Live Mode and hosted business writes remain disabled.

For cloud deployment, the selected no-additional-database setup is [Render Free + existing Supabase](docs/deployment/RENDER.md), configured by `render.yaml`. The [Vercel alternative](docs/deployment/VERCEL.md) remains documented. The [hosted account workspace](docs/phase11/README.md) connects the original shell, profile and authorized User Approvals without opening complaint data. Case/SLA preview requires an explicit server allowlist and approved expiring database lease. Full hosted business workflows remain disabled.

Start at **http://localhost:3000/login**. An active approved officer enters `/dashboard`; pending or revoked authority goes to `/pending-approval`. The Development System Administrator uses **Audit & Administration → User Approvals** at `/admin`. A System Administrator has configuration authority without blanket complaint access.

## Run

Use Node.js 22, npm and the ignored local configuration described in [the manual guide](docs/manual-testing/SYNAPSE_MANUAL_TEST_GUIDE.md). Do not load operator or model-provider secrets into Next.js.

```powershell
npm ci
npm run build
npm run workbench:start
```

The existing isolated PostgreSQL database must be configured and running first. Owner-only initial setup is `npm run workbench:setup`; it never resets the hosted database. Continue using `localhost` as the browser origin. The listener binds to loopback. The worker starts alongside the web server and keeps durable jobs; actual integrations require their own authorized settings.

## One interface

Original routes: `/dashboard`, `/intake`, `/institutions`, `/complaints`, `/complaints/[case-id]`, `/kanban`, `/tasks`, `/calendar`, `/analytics`, `/reports`, `/intelligence`, `/coordination`, `/dependencies`, `/resolutions`, `/team`, `/notifications`, `/settings`, `/help`, `/admin`.

Authentication, approvals, profile and password-recovery links use the same account and original visual theme. Legacy `/platform/*`, `/officer/dashboard` and `/officer-admin` links redirect to original routes. There is no separate platform shell or browser-selected operational identity. Old Demo modules and fixtures are retained only as historical engineering sources; they are not application destinations or authoritative records.

Overview and the full Calendar share one authorized selector. Commands persist versioned changes, audit, notifications and idempotency receipts before refreshing dependent pages. Empty repositories display empty states. Profile edits permit only the signed-in user's display name; role and Bureau changes require separate administrator review.

## Verification and remaining work

Read [Phase 10 evidence and blockers](docs/phase10/README.md) and the [per-page verification matrix](docs/phase10/FEATURE_VERIFICATION_MATRIX.md). Provider availability and complete cross-Bureau verification must be supported by actual checks, not inferred from configuration. Final acceptance remains **AWAITING USER MANUAL TESTING**.

```powershell
npm test
npm run typecheck
npm run lint
npm run test:database:auth
npm run test:database:platform
npm run test:database:sla
npm run test:database:workbench
npm run build
npm run test:browser:isolated
```

Database suites require a dedicated disposable PostgreSQL cluster on loopback, normally port 55432. Never point them at hosted Supabase or the persistent manual environment. The real connected browser runner additionally needs the owner-approved encrypted credential vault:

```powershell
powershell -NoProfile -File scripts/workbench/capture-real-users.ps1
node --env-file=.env.local --env-file=.env.operator.local scripts/phase10/test-connected.mjs
```

Passwords are protected with Windows CurrentUser DPAPI and a current-user-only DACL in ignored `.local/acceptance/real-users.vault`. They never belong in chat or Git. The runner launches a restricted web process, creates all test business records through the actual UI in a fresh database, checks SQL persistence and drops only its own temporary database. Operator credentials are not passed to the web server.

Historical architecture/security evidence: [baseline and Phase 1](docs/phase1/README.md), [Phase 2](docs/phase2/README.md), [Phase 9](docs/phase9/README.md), [original Supabase audit](docs/SUPABASE_AUDIT.md). Historical Demo instructions in those documents do not describe the current application.
