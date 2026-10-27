# Hosted Gmail OAuth and intake

Production alias verified with authenticated Vercel deployment metadata (project `synapse-sih-2026`, production READY):

`https://synapse-sih-2026.vercel.app/api/integrations/gmail/oauth/callback`

This is the exact Google OAuth redirect URI. It is not the Supabase Auth callback, not a localhost helper, and not a JavaScript origin. The production alias is stable across deployments; do not register an ephemeral build URL.

## Google setup

1. In the Google Cloud project that owns the OAuth client, enable Gmail API.
2. Open Google Auth Platform > Branding and Audience. For development testing, use External / Testing and add only the dedicated approved complaint mailbox as a test user. The existing fourth officer Auth-test address is not approved for mailbox ingestion.
3. Open Google Auth Platform > Clients > the Web application OAuth client used in Vercel. Under **Authorized redirect URIs**, add the exact HTTPS URI above and save. A Desktop client is not appropriate for this hosted callback.
4. Under Data Access, request only `https://www.googleapis.com/auth/gmail.readonly`. The application rejects additional Gmail/write scopes and verifies the actual `users/me/profile` email against the approved address before saving any credential.
5. Production distribution of this restricted scope can require Google's verification/security assessment. Testing-mode refresh grants commonly expire after seven days; a reconnect is required. Do not label a Testing consent app verified production.

Official references: [Web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail server OAuth](https://developers.google.com/workspace/gmail/api/auth/web-server), [restricted scopes](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Vercel environment

Set these as **server-only**, Production variables in the existing project; never use a NEXT_PUBLIC prefix. Keep their values out of Git, logs, screenshots and chat.

| Variable | Purpose |
| --- | --- |
| SYNAPSE_APP_ORIGIN | `https://synapse-sih-2026.vercel.app` |
| SYNAPSE_GMAIL_APPROVED_ADDRESS | Exact dedicated complaint Gmail address explicitly approved by the owner |
| SYNAPSE_GMAIL_CLIENT_ID | Web OAuth client ID |
| SYNAPSE_GMAIL_CLIENT_SECRET | Matching web OAuth client secret |
| SYNAPSE_GMAIL_TOKEN_ENCRYPTION_KEY | Canonical base64 encoding of 32 random bytes; keep stable to decrypt saved tokens |
| CRON_SECRET | Independent random secret, at least 32 characters; Vercel adds it as a Bearer header |
| SYNAPSE_GMAIL_ENABLED | **false** until real-email verification and release requirements pass |
| SYNAPSE_HOSTED_OPERATIONS_ENABLED | **false** until independent hosted workflow/security release approval |

Retain the existing restricted `SYNAPSE_GATEWAY_DATABASE_URL`, verified public CA PEM, Auth/rate configuration and public Supabase URL/publishable key. Do not add DATABASE_URL, SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY to Vercel. The web startup guard still rejects operator and unrelated worker credentials. The specific Gmail OAuth secret is now permitted only for protected server routes; it is never imported by client code.

For local preparation, names/values belong in ignored `.env.integrations.local`. New random encryption/cron values were generated there without printing them. Do not copy the entire file to the web process: translation/Gemini worker keys are separate. Google API keys do not grant Gmail OAuth mailbox access. Hosted refresh/access tokens are held only as AES-256-GCM ciphertext in private PostgreSQL; the encryption key is separate in Vercel. Key loss/rotation requires controlled reauthorization. The old DPAPI/localhost helper is not used by this hosted flow.

Environment changes require a fresh deployment. Use the production domain above for the consent session so the Secure host-only cookie and redirect stay on the same origin.

## Dashboard authorization and verification

1. Deploy the verified feature branch and reviewed migrations. Migration setup does not authorize a mailbox or enable operations. The separate reviewed `20261027185138_phase15_active_intake_bureau.sql` correction also prevents consent/ingestion routing into a deactivated Bureau. See MIGRATION_REVIEW.json for actual application status.
2. Sign into the original dashboard as the current approved global System Administrator; open **My account / Settings > Complaint mailbox**.
3. Choose an actual active Bureau and an actual approved Case Officer in that Bureau. No default officer/admin or fictional identity is inserted. The server rechecks authority during consent completion and ingestion.
4. Select **Authorize dedicated Gmail**. In Google's account selection use the approved complaint mailbox, not a personal account. Consent returns to the production callback and then Settings. A success message means identity was verified and encrypted credentials saved; it does not mean email ingestion is enabled.
5. Complete the independent hosted transaction/RLS and issued-JWT acceptance review before enabling the operations server switch/database control. There is deliberately no public self-activation button or automatic migration activation. The old public RPCs stay closed.
6. After that release, send an actual development complaint to the approved mailbox. Select **Verify one real email** with SYNAPSE_GMAIL_ENABLED still false. This explicit administrator action can ingest at most one real INBOX message; it cannot bypass the database release gate. An empty inbox does not count as successful ingestion.
7. Confirm the actual draft appears in original Intake with original text, duplicate indicator where applicable, retained MIME, attachments/quarantine and audit. The assigned Case Officer must verify institution/language and manually register or associate the complaint. No automatic merging/registration occurs. Supported attachments are linked to actual protected case evidence on human registration; other files remain in draft quarantine.
8. Only after a real email was ingested and accepted, set SYNAPSE_GMAIL_ENABLED=true and redeploy. Scheduled/manual sync also checks the persisted prior-verification timestamp, so an environment toggle alone cannot establish verification.

## Scheduling and errors

`vercel.json` defines a once-daily `/api/cron/gmail` invocation, compatible with Hobby frequency constraints. The route requires CRON_SECRET and checks the enabled flag before any Google/DB work. No paid resource was created. Vercel schedules run on production deployments; Hobby timing can be imprecise. [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [securing cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Each invocation has a 45-second provider deadline, a 90-second exclusive database lease and at most three imports (one for verification). Initial list/history cursors advance only alongside durable deduplicated queue insertions; interrupted execution resumes queued messages. Expired history falls back to a list rescan without duplicate drafts. Provider/network/size errors remain visible in Settings with pending/failed counts. Explicit Verify or Sync actions requeue failed items under the same exclusive lease; permanent oversize/format failures stay visible until their source issue is resolved. Automatic mail volume is intentionally bounded; a higher-frequency approved scheduler and retention/retry/scale review are needed for production volume. No such resource is silently provisioned.

Disconnect discards stored tokens and stops application reads while retaining original submissions/audit; it does not erase history. Google account-level grant revocation can additionally be performed in the dedicated account's Connected apps settings. Binary attachments are not downloadable or verifiable until a trusted scanner marks them clean. Existing MIME/size limits retain oversized failures explicitly instead of inventing a successful draft.

## Test boundaries

Unit tests use explicitly mocked Google transport. Disposable SQL tests use synthetic claims/data against actual PostgreSQL and restricted roles; they test function ownership, grants, empty search_path, forced RLS, state replay/session mismatch/completion replay, release denial, leases, deduplication, raw MIME/attachment/draft/audit persistence, registration linking, two-Bureau byte/document isolation and revoked officer denial. Neither suite proves actual mailbox consent/delivery. Disposable role logins use fresh random per-run passwords, including on SCRAM-protected CI PostgreSQL; no test password is hardcoded or persisted.

Real Cloud Translation Basic v2 credential validation returned HTTP 200 for a constant development Hindi sample; this does not prove the hosted provider queue is operational. Final browser/mailbox/real-account acceptance is reserved for the user. No browser, mailbox consent, or credentialed user login is automated in this release. Gmail is not operational until an actual email is successfully ingested.
