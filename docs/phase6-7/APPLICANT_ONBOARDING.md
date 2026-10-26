# Fourth applicant — actual hosted onboarding evidence

Approved identity details live only in ignored `.local/phase2/approved-applicant.json` and Windows DPAPI vaults. This report deliberately contains no email address, password, JWT, verification/recovery link or cookie.

## Executed workflow

| Requested step | Actual result |
|---|---|
| Verify absence | **PASS** bounded Supabase Auth lookup and deployed internal-user lookup both confirmed absence before signup |
| Real signup | **PASS** existing `/signup` browser form → actual application API → hosted Supabase email/password signup. No internal identity, membership or role was created during signup |
| Actual mailbox confirmation | **PASS provider confirmation**, after the human saved the actual unopened email link and the runner used the original encrypted PKCE cookies. The provider confirmed-email state was independently checked. **The first automatic application callback failed**; a separate actual password login then succeeded into Pending Approval. No forced confirmation or fake link was used |
| Initial access denial | **PASS** before confirmation session/case APIs returned 401. After confirmation the real applicant session had no roles/memberships/internal mapping and case/admin APIs returned 403 |
| Independent administrator approval | **PASS** existing authorized Development System Administrator logged in and committed the real administration form. Approval atomically created one bounded BUREAU CASE_OFFICER assignment and membership in the existing development Approval Bureau, expiring 2026-10-29 12:00 UTC. Audit identifies that administrator as actor. No operator SQL provisioned the applicant's privileges |
| Approved login/dashboard | **PASS** real password login reached `/officer/dashboard` with exactly the approved Bureau and CASE_OFFICER role |
| Authorized case reads/isolation | **PASS** under an explicit ten-minute test lease, the original officers still read their own assigned cases and could not see the other Bureau's case. The new applicant, who has no case assignment, saw a truthful empty registry and no same-Bureau or cross-Bureau metadata. No case was created/reassigned to manufacture a positive row |
| Role/API restrictions | **PASS** applicant cannot approve accounts, manage memberships/roles, call either direct protected public read RPC, or enable platform writes. Actual HTTP session refresh succeeded |
| Actual applicant-only role revocation | **PASS** existing administrator revoked the applicant's role through the actual role-review UI/API, with immutable audit. A real unexpired session issued before revocation resolved to Pending Approval and was denied cases. Original officers retained exact assignments/memberships and reads |
| Logout/replay | **PASS** actual applicant logout; replay of the previously valid session cookies returned 401 |
| Applicant reset email/password change | **PASS** after earlier actual provider 429s. A fresh request was accepted, the human supplied its newest actual unopened recovery URL, and the original PKCE context completed real callback/password change. Old password/session were rejected; new password login resolved with the current revoked authority, then logout succeeded. Verified 2026-10-26 21:08 UTC. |
| Natural expiry of actual applicant JWT | **PASS** exact original issued JWT fingerprint and signature checked against hosted JWKS; after its natural expiry at 2026-10-26 20:48:01 UTC, actual hosted REST explicitly rejected it for expiry (401), verified 20:48:38 UTC. No modified/substituted token or refresh was used. |

At the end of the revocation test, the fourth applicant's internal identity and bounded Bureau membership remain recorded, while its single Case Officer assignment is expired. It has no current complaint privileges. This is intentional test outcome, not an automatically reactivated account. The original two officers remain Case Officers; the third administrator remains configuration-only. There are four approved identity mappings, nine applied migrations and the same two existing development cases. Global Demo Mode, default server reads off, database reads off/no lease, business writes off, and both prior SLA/managed-session candidates remain unapplied.

## Exact changes

- Reproducible operator runners: `begin-applicant-signup.mjs`, `complete-applicant-confirmation.mjs`, `approve-applicant.mjs`, `verify-applicant-workflow.mjs`, `begin-applicant-reset.mjs`, `complete-applicant-reset.mjs`, `verify-applicant-expiry.mjs`.
- `mail-link.mjs` validates actual saved mailbox-link freshness, provider/app origin, flow type, callback destination and bounded redirects; it never prints link material. Original cookie contexts and any intermediate URLs remain DPAPI encrypted.
- `lease.mjs` retains the historical exact-two guard and existing configuration-admin checks. Its only optional fourth identity requires the exact explicit private applicant plan, confirmed Auth UUID, independently audited administrator approval, matching internal account, one exact Bureau role/membership and its approved/revoked state. Unexpected mappings or authority drift fail closed.
- `lib/auth/gateway.ts` reports applicant confirmation, independent approval, authorization, recovery and natural-expiry receipts separately. Missing/stale/blocked evidence cannot enable Live Mode. Automatic signup callback reliability is separately BLOCKED because it was not verified successfully.
- `app/auth/callback/route.ts` adds a fixed-stage diagnostic header on failure (validation, exchange, verified identity, recovery authorization or onboarding/account resolution), with no URL/token/user information. This improves future diagnosis; it does not establish the cause or fix of the first callback failure.
- Staged-secret review now includes applicant credentials, current/intermediate cookies, the exact expiry probe, saved actual mailbox URLs/tokens and the private administrator test session.
- Two added unit tests are **contract simulations**, covering mail-link freshness/type/origin restrictions, external redirect rejection and safe diagnostic propagation. They are not real mailbox tests.

## Test corrections and evidence limits

The approval browser runner initially used an overly exact label selector for a select whose options contribute label text; it was corrected to the existing form's stable named field and the actual approval succeeded. The first post-revocation assertion used the local clock, about one second behind the database. It was corrected to the database's authoritative expiry comparison; source audit proved revocation had committed. The runner resumed only after checking the exact real administrator audit event, retained the earlier passing login/isolation checks and verified later denials/logout. Imported original cookies needed the controlled loopback host for that isolated server. None of these corrections removed an authorization requirement or restored a role to produce a pass.

Generated `applicant-*-results.json` receipts are private/ignored and distinguish completed assertions, callback failure, earlier provider 429s and subsequent real recovery/natural-expiry passes. The initial automatic signup callback's exact cause is **unverified**; do not infer it from an expired/consumed link replay. No schema migration or managed Auth ownership change was needed for this applicant workflow.

## Reproducible recovery/expiry runners (completed)

After an authorized owner confirms approved email capacity is available, request one fresh reset email; do not reuse the old confirmation link:

```powershell
node --env-file=.env.local scripts/phase6-7/begin-applicant-reset.mjs
```

If accepted, save the actual newest unopened reset URL as ignored `.local/phase2/applicant-reset-link.txt`. Keep the original encrypted request cookies. Then:

```powershell
node --env-file=.env.local scripts/phase6-7/complete-applicant-reset.mjs
node --env-file=.env.local scripts/phase6-7/verify-applicant-expiry.mjs
```

Run the expiry verifier only after the preserved token's natural expiry. It does not log in, refresh, replace or edit the probe. A completed password reset must verify the old password/session are denied and the new password logs in with the **current revoked authority**, not resurrect the Case Officer role.

Activation remains **NO-GO**. Applicant recovery and natural expiry now pass; fresh signup callback reliability, production HTTPS/Secure-cookie and SMTP/redirect/abuse policies plus independent gateway release review remain outstanding. Advisor access remains denied by connector policy; no clean advisor claim is made. Hosted case writes/storage/intake/worker/provider workflows remain outside this verified read-only acceptance subset.


## Phase 8 continuation

The isolated PostgreSQL operational workspace and approved Google/Gmail provider adapters are documented in `docs/manual-testing/FEATURE_READINESS.md` and `SYNAPSE_MANUAL_TEST_GUIDE.md`. This supersedes older operational-implementation status paragraphs, without rewriting historical test receipts. Hosted business writes and global Live Mode remain disabled.
