# Vercel authentication preview

This deployment serves the existing Next.js application and hosted Supabase account workspace. [Phase 11](../phase11/README.md) connects the original shell, profile and authorized User Approvals through the trusted account gateway; case/SLA reads require explicit server allowlisting and an approved expiring SQL lease. It does **not** deploy the local operational PostgreSQL backend. Its loopback/origin guards remain intact, and full hosted complaint writes remain disabled.

## Import and build

1. In Vercel, choose **Add New → Project**, connect GitHub and import `abhipatil1403/SYNAPSE-SIH2026`.
2. Use the verified `feature/synapse-phase3-5-platform` branch. If configuring this dedicated preview project's Production branch, use **Settings → Environments → Production → Branch Tracking**. The Vercel environment name does not authorize SYNAPSE Live Mode.
3. Framework: **Next.js**. Root Directory: repository root. Install Command: `npm ci`. Build Command: `npm run build`. Output Directory: framework default. Node.js: **22.x**. Do not use `workbench:start` as a build command and do not configure a custom start command.
4. Add the variables below for the environment you are deploying. Use the Sensitive option for the restricted database URL and rate-limit secret. Do not bulk-import local env files or let a database integration inject an operator/service-role credential.
5. Deploy. Confirm the assigned domain, update `SYNAPSE_APP_ORIGIN` to that exact HTTPS origin, configure Supabase redirects below and **redeploy**. Environment changes affect new deployments only.

## Environment variables

| Name | Value / source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xjnukuerzlrxjjqwmgkn.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing `sb_publishable_...` value from ignored `.env.local` |
| `SYNAPSE_APP_ORIGIN` | `https://YOUR_ASSIGNED_DOMAIN` with no path or trailing slash |
| `SYNAPSE_GATEWAY_DATABASE_URL` | Existing restricted login URL from ignored `.env.gateway.local`; verified shared transaction pooler `aws-0-ap-south-1.pooler.supabase.com:6543`, user `synapse_web_login.xjnukuerzlrxjjqwmgkn`, database `postgres`. Preserve its URL-encoded password. No query parameters. Never use the `postgres` operator login. |
| `SYNAPSE_GATEWAY_CA_PEM` | Entire public root certificate from `.local/phase2/supabase-db-root.crt`, including BEGIN/END lines. Actual line breaks or literal `\n` separators are supported. This is a certificate, never a private key. Leave `SYNAPSE_GATEWAY_CA_FILE` unset on Vercel. |
| `SYNAPSE_AUTH_RATE_SECRET` | A separate random secret of at least 32 characters; keep stable across deployments of this environment |
| `SYNAPSE_TRUST_PROXY` | `true` for direct Vercel ingress, whose forwarded client-IP header is overwritten by Vercel |
| `SYNAPSE_SIGNUP_ENABLED` | `false` for the initial restricted preview; existing approved accounts can sign in |
| `SYNAPSE_PHASE1_READ_ENABLED` | `false` |
| `SYNAPSE_WORKBENCH_ENABLED` | `false` |

Generate a fresh rate secret directly into the local Windows clipboard, without printing it, then paste it into the Vercel field:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

Do not add `DATABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, worker database credentials, Gemini keys, Gmail secrets, `SYNAPSE_TRANSLATION_API_KEY` or `HF_TOKEN` to this web project. The web startup guard deliberately rejects these private worker/operator credentials. The local `.env.integrations.local` is not a Vercel env-import template. `NEXT_PUBLIC_APP_MODE` is not an operational mode switch.

## Supabase URL configuration

In the existing SYNAPSE project, open **Authentication → URL Configuration**. Set Site URL to the actual assigned HTTPS origin. Add the exact recovery callback URL `https://YOUR_ASSIGNED_DOMAIN/auth/callback?flow=recovery`. Preserve the localhost callback for local password recovery. If a distinct staging domain is used, allow its exact callback too; test only on the origin configured for that deployment. Email-link completion must use the browser/session that requested recovery so the PKCE verifier is present.

Do not change Confirm Email, signup permissions, database policies or assignments as part of deployment. Public signup needs separate abuse-policy review; toggling an environment variable is not approval to expose registration.

## Verify the deployed preview

- `/login`: renders; invalid credentials fail and current approved credentials establish a session through the hosted restricted gateway.
- `/api/auth/session`: returns only the current account after login; unauthenticated requests fail.
- `/forgot-password`: use an approved account and verify the actual mailbox/callback on this HTTPS origin.
- Logout: copied prior session cookies must be rejected. Inspect cookies for `HttpOnly`, `Secure` and `SameSite=Lax` in this deployment.
- `/api/workspace/snapshot`: an approved account receives `ACCOUNT_ONLY` metadata with the complaint preview closed. Verify Settings/profile and authorized `/admin`; complaint KPIs remain explicitly unavailable until approved preview access. `/api/health` returning 200 does not prove backend availability.

Local hosted-connection verification tested the new inline certificate using the actual restricted login and a read-only `SELECT 1`, with TLS CA and hostname verification enabled. That is **not** evidence of a Vercel deployment or its network/HTTPS behavior; those checks must run after deployment.

Deployment preparation passed 120 unit tests, typecheck, lint, production build and the source/build/staged-file credential scan. The existing file-based setup also passed actual login, authorized snapshot and logout for all three approved accounts; an incorrect-password request returned HTTP 401. No Vercel deployment has been executed or certified by these local tests.

## Full operational deployment still required

Implement the remaining reviewed transactional workflows in the existing Supabase project; no separate paid PostgreSQL service is required. Reconcile/import data non-destructively, preserve least-privilege identity/Bureau/document authorization, select a reviewed provider-job runtime, and rerun hosted authorization/two-account/HTTPS/expiry tests. Existing localhost URLs, Windows DPAPI vaults and local worker processes cannot become hosted services by copying environment variables. Gmail remains disabled pending an explicitly approved mailbox/OAuth connection. The Phase 10/11 release blockers and human acceptance still apply.

Official references: [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs), [environment variables](https://vercel.com/docs/environment-variables), [Git branch configuration](https://vercel.com/docs/git), [forwarded client-IP header](https://vercel.com/docs/headers/request-headers), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).


## Serverless connection lifecycle

Vercel must use the existing Supabase **transaction** pooler, not its session endpoint. The private gateway uses explicit `BEGIN` / `SET LOCAL ROLE` / function calls / `COMMIT`, with transaction-local claims and unnamed parameterized queries. No session state or named prepared statement is retained. Strict CA and hostname verification remain enabled. `@vercel/functions/db-connections` attaches the shared application pool on Vercel so idle clients can close before suspension; persistent local/Render runtimes do not install that lifecycle hook. The pool is bounded to three clients per instance with a five-second idle timeout. The database role still has its original ten-connection limit; no larger privilege or connection allowance is granted.

Phase 12 confirmed SQLSTATE `53300` while all ten gateway role connections were idle. See `docs/phase12/CONNECTION_RECOVERY.md` for the scoped recovery and actual transaction-pool acceptance evidence. Changing the URL requires a new deployment; never substitute an operator URL or disable TLS to recover availability.
