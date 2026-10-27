> **Phase 9 current flow:** Password signup, owner-controlled administrator recreation and IndicTrans2 supersede the historical signup/translation setup below. Follow [the current manual guide](../manual-testing/SYNAPSE_MANUAL_TEST_GUIDE.md) and [Phase 9 evidence](../phase9/README.md).

# Officer Auth and integration setup

> **Current manual-testing entry point:** [SYNAPSE manual guide](../manual-testing/SYNAPSE_MANUAL_TEST_GUIDE.md). It starts an isolated actual PostgreSQL workspace with real hosted Auth while preserving Demo and hosted gates. The fourth applicant has now completed real independent approval, revocation, recovery and expiry tests and remains role-revoked. The bounded lease helper validates that exact optional fourth mapping/audit in addition to the prior three; unknown identity/authority drift still fails closed. Older paragraphs describing the need for a new pending officer are historical. Fresh automatic signup callback reliability is still unverified.

## Local runtime

The authorized application gateway provisioning procedure has created **`.env.gateway.local`**, ignored by Git and restricted by Windows ACL. It contains only the limited server login, CA path, rate-limit HMAC secret and signup policy. It contains no Supabase operator/service key. Do not copy these values into chat, `NEXT_PUBLIC_*` variables or tracked files.

Start the existing application with:

```powershell
node --env-file=.env.gateway.local node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
```

Run `npm run build` first when sources change. Existing public project configuration stays in `.env.local`. Operator SQL/Auth administration remains in `.env.operator.local`, used only for explicit operator commands. Never load that file into Next.js. The web startup guard also rejects SLA-worker database credentials.

Required gateway variable **names**:

- `SYNAPSE_GATEWAY_DATABASE_URL`
- `SYNAPSE_GATEWAY_CA_FILE`
- `SYNAPSE_AUTH_RATE_SECRET`
- `SYNAPSE_APP_ORIGIN`

`SYNAPSE_SIGNUP_ENABLED=false` keeps invitation-first registration. To permit approval-based public registration, an operator can explicitly set it to `true` in `.env.gateway.local` and restart the runtime. New Auth users still get no internal user/membership/role until independently approved. `SYNAPSE_TRUST_PROXY=true` is appropriate only behind an ingress that replaces—not appends untrusted—forwarded address metadata. Supabase's own rate limits remain active.

## Email verification, invitation and recovery

Supabase's public settings currently report email/password enabled, signup enabled at provider level and email auto-confirm disabled. These settings do **not** prove email delivery.

Use an approved development sender/SMTP setup and allowlist the actual application's `/auth/callback` origin in Supabase Auth URL configuration. Production requires trusted HTTPS and Secure cookies. The current executed browser evidence uses loopback HTTP.

Supported confirmation/recovery/invitation templates may use a provider-verified token-hash link to the allowlisted application:

```text
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite
```

Select the matching template type in the Supabase dashboard; keep its redirect domain fixed and allowlisted. Standard PKCE code callbacks are also handled, including multi-flow verifier IDs. The PKCE recovery type comes from Supabase's verified exchange result, never a query flag. Invite/recovery verification creates a short, session-bound, one-use password-setup grant. Original signup and recovery-verifier cookies are HttpOnly and scoped to `/`; legacy preview cookies keep their old `/api/phase1` scope.

Do not paste email links, OTPs or credentials into a public issue/report. The approved third development account completed actual signup, mailbox verification and Pending Approval checks. Standard PKCE callbacks require the original request's cookie context; the SDK appends its `sb_flow_id` when explicitly enabled, and the callback selects that exact verifier slot. Opening a saved recovery URL in an unrelated browser may consume the email token without retaining the required verifier. Existing two-account password vaults must not be overwritten by an uncoordinated password change.

## Administrator approval

The approved, verified third development account now has one audited GLOBAL SYSTEM_ADMIN assignment expiring on **2026-10-29 at 12:00 UTC**. It has no Bureau membership, no case role and no legacy global-case bypass flag. Neither existing officer was elevated. The operator bootstrap runs only after actual provider email verification and an approval-free Pending Approval login. It validates an ignored private approval plan and exact Auth UUID, refuses unexpected pre-existing authority and preserves the officers' assignments. This is explicit operator approval, not an email/name match or a browser-selected role.

That administrator can visit `/officer-admin`. Approval requires a different actor, a current pending verified account, an active Bureau, an allowed scoped role, a 1-hour–90-day expiry and a recorded reason. Existing email/mapping collisions are rejected for explicit reconciliation. Suspension/revocation expires memberships/roles and records an immutable decision event. Role assignment information is included in approval audit detail. Reactivation of rejected/revoked accounts and global/regional role assignment remain outside the web workflow.

The same page can review/revoke existing Bureau membership windows. Reviews require a reason, current expiry and idempotency key; they do not extend a role or change its code. The real hosted verification reviewed an officer's unchanged expiry, tested safe replay/conflict behavior and rendered the management controls. The separate acceptance flow of a newly pending officer being approved into a Bureau still requires another approved pending identity.

The Bureau role section reviews/revokes current CASE_OFFICER, BUREAU_HEAD, AUDITOR and REVIEWER assignments. Changes require independent current administrator authority, expected role/expiry, reason and idempotency key. An expiry must fit a current membership; replacement preserves the expired assignment in history. Self/global/regional assignments and SYSTEM_ADMIN elevation are rejected. The administration page clears its account/member/role components when current authority is lost or another tab logs out. See [ROLE_MANAGEMENT_REVIEW.md](ROLE_MANAGEMENT_REVIEW.md).

Operator-only reproduction helpers read approved identities/passwords from ignored plans and DPAPI vaults:

```powershell
node --env-file=.env.local --env-file=.env.operator.local scripts/phase6-7/bootstrap-admin.mjs --bootstrap-verified-admin
node --env-file=.env.local scripts/phase6-7/verify-admin-login.mjs
node --env-file=.env.local --env-file=.env.operator.local scripts/phase6-7/verify-admin-roles.mjs
node --env-file=.env.local --env-file=.env.gateway.local scripts/phase6-7/begin-admin-reset.mjs
node --env-file=.env.local scripts/phase6-7/complete-admin-reset.mjs
```

The reset completion helper requires the newest unopened actual mailbox link in ignored `.local/phase2/admin-reset-link.txt` and restores its encrypted original verifier cookies. It refuses stale requests/unapproved destinations. Completion checks the old password/session are denied, verifies the new password and updates the private vault only after provider success. Do not rerun signup or reset requests to evade provider email limits.

## Reproduce current checks

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:database:platform
npm run test:database:auth
npm run test:database:sla
npx playwright test
node --env-file=.env.local --env-file=.env.operator.local scripts/phase6-7/audit-gateway.mjs
node --import tsx --env-file=.env.local --env-file=.env.gateway.local --env-file=.env.operator.local scripts/phase6-7/verify-hosted-auth.ts --controlled-read
node --env-file=.env.local --env-file=.env.gateway.local --env-file=.env.operator.local scripts/phase6-7/verify-web-auth.mjs --controlled-read
```

Run hosted lease tests **sequentially**. The historical exact-two mapping guard remains unchanged. The new development helper permits only those same two officers plus the separately approved, verified configuration administrator, with its exact bounded role and no Bureau/case role. It rejects unknown/extra mappings and active previews, restores original account/role/membership values and closes its bounded read lease. The browser helper strips operator secrets before launching its temporary server and stops port 3001 afterward. It writes no credential trace or storage-state file.

## SLA worker — prepared, not deployed

The candidate `20261026163237_phase7_scoped_sla_worker.sql` is **unapplied**. Review it, current effective work-item readers, RLS and approved policy/Bureau configuration before any hosted application. It supplies no login, enabled configuration or schedule. The source SELECT role correction preserves the original `synapse_app` access and refuses unexpected explicit readers; no legacy helper is granted to the worker.

Its candidate timestamp predates later applied Auth corrections. At approval time, use `supabase migration new` to create a fresh forward migration and copy the exact reviewed SQL/hash; do not reorder applied history or use an indiscriminate include-all migration push.

The processor uses actual persisted SLA deadlines, approved versioned thresholds and current officer/supervisor membership. It inserts an atomic delivery receipt and notification, does not move a case into ESCALATED and does not guess deadlines. Each batch is capped at 100 unsent recipient obligations, so already delivered rows cannot starve later cases. The unique receipt includes SLA ID, actual deadline, kind and recipient. Notification failure rolls back its receipt; retry does not duplicate delivery. Paused/met/cancelled instances, completed work, disposed cases, suspended users and unauthorized Bureaus are excluded.

After security/write approval only, provision a separate limited `synapse_sla_login` able to assume **only** the prepared worker role, and use `.env.worker.local`:

- `SYNAPSE_SLA_DATABASE_URL`
- `SYNAPSE_SLA_CA_FILE`
- `SYNAPSE_SLA_ENABLED`

`node --env-file=.env.worker.local scripts/phase6-7/run-sla-worker.mjs --once` performs one batch. Without `--once` it runs every minute with bounded error backoff. An OS service/container supervisor must restart it after process/connection failure. No hosted scheduler, worker login or enabled SLA config has been provisioned in this milestone.

## Semantic and translation providers

`lib/automation/providers.ts` implements the documented Ollama embedding API with a required model digest pin, bounded batches, no silent input truncation, vector validation and safe provider failures. Azure Translator uses its real API with source-language detection and stores returned translation provenance in its result contract. These adapters have contract simulations, **not a configured operational pipeline or real provider inference evidence**.

The approved endpoint/model/digest and Azure key/region must remain in a future worker's private configuration. No model/provider is selected or paid for automatically. Durable email ingestion/queue, mailbox OAuth, original-table bridge, indexed shortlist persistence, human translation review and benchmark evidence remain required implementation; merely supplying keys will not complete them. No unavailable AICTE/CPGRAMS integration is claimed.
