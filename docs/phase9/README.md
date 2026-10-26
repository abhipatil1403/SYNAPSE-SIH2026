# Phase 9 — password signup, owner bootstrap and IndicTrans2

**Hosted activation: NO-GO. Final acceptance: AWAITING USER MANUAL TESTING.** Existing UI, Demo Mode, local PostgreSQL workflows and protected hosted boundaries are preserved.

## Authentication and approval

Login remains Supabase `signInWithPassword`. Signup now uses a transient server-only Supabase client with password signup and no PKCE challenge or email callback redirect; immediate tokens are adopted into the existing HttpOnly SSR cookie client and independently checked with online `getUser`. This avoids SSR's forced PKCE/autoconfirm incompatibility. No local-storage identity or plaintext application-table password is introduced. The owner's manual Confirm Email change was verified through the provider's current settings; no hosted Auth setting was changed by code.

The server idempotently creates pending applications from trusted Auth UUID/email/display preference. No signup role/membership is created, and supplied role fields are rejected. Current approval is rechecked in private SQL; pending/rejected/suspended/revoked accounts remain denied. `/pending-approval` displays the actual stored review state, distinguishing an approved application with expired/revoked authority. Configured `/platform/*` routes now enforce the same server-side route protection; default unconfigured/gated platform behavior and Demo remain intact.

The same login exposes **Administration → User Approvals** only for current System Administrators. Listing includes application receipt/signup time, email/status, allowed Bureau/role controls and bounded review history. Approval/rejection/suspension/revocation still use the existing locked server transactions and audit. No global role is available in public signup or the approval form.

The private gateway additionally returns an exact scoped profile to the server. It is never included in browser account responses. Approved workbench actors are synchronized from these tuples, so a new/recreated account no longer depends on historical development vault imports; multi-Bureau roles are no longer inferred from a flattened role list. Deleted/revoked imported references can be refreshed through owner setup `--references-only`.

## Reviewed application-only migration

`20261026215821_phase9_password_approval_lifecycle.sql` was generated with the Supabase CLI, tested in fresh disposable PostgreSQL and applied through the authorized TLS operator with source-hash/test evidence. Exact review is in `MIGRATION_REVIEW.json`.

- New private `applicants` function resolves only the caller's pending state/scoped profile or an independently authorized administrator's bounded review history.
- New functions use fixed empty search paths and `row_security=on`, with NOLOGIN/NOBYPASSRLS existing owners. Browser/anonymous/service roles cannot execute them. The archive trigger function is not callable by the web gateway; its temporary migration-creator grant is removed.
- A FORCE-RLS archive preserves onboarding history before an owner/provider Auth deletion. Only application-owned FK actions are corrected to cascade onboarding/ephemeral recovery rows; internal users, cases and decision audit remain. No Auth user was deleted in hosted testing, and no managed Auth object/ownership was modified.
- Prior `synapse`/`public` function definitions and the original baseline remain unchanged. Hosted read gates and business writes stay closed. Current gateway ACL/RLS checks pass.

## Secure owner-controlled recreation

Read-only snapshots of the approved configuration administrator and approved officers are stored using CurrentUser DPAPI. The new CLI validates an explicit private owner plan, exact provider UUID/email, a real pending request, closed gates and bounded expiry. Bootstrap refuses another active administrator or an already mapped officer. Rebinding a retired administrator requires the exact encrypted prior internal/Auth identity and proof that the owner deleted the old provider user. It grants configuration-only SYSTEM_ADMIN with audit, no Bureau/case privileges or legacy bypass flag. Exact replay does not renew access.

For reusing retired officer emails, an independent owner procedure refuses an existing provider identity or changed snapshot authority, retains historical internal IDs/cases, suspends old authority and audits a reserved non-deliverable retention label. Fresh same-email applicants remain pending and require administrator approval under new internal IDs; email reuse never inherits old complaints. These transactions were executed positively/negatively, with rollback/idempotency checks, only against synthetic disposable identities. Hosted execution in this phase was **read-only snapshots**, not retirement/bootstrap mutations.

Use the exact before-deletion and recreation sequence in [the manual guide](../manual-testing/SYNAPSE_MANUAL_TEST_GUIDE.md). Do not delete the last administrator before preserving the private owner recovery proof.

## Genuine local translation

Google Cloud Translation was removed from the selected transport and worker; no fallback exists. The authenticated Python service loads the official MIT IndicTrans2 distilled Indic-En and En-Indic 200M checkpoints at fixed revisions in `services/translation/manifest.json`. Only one model direction remains resident at a time; changing direction unloads the previous model under the single-worker fence. Compatible runtime pins include PyTorch CPU 2.7.1, Transformers 4.51.3 and IndicTransToolkit 1.1.1, under Linux/Ubuntu WSL Python 3.12. Checkpoints are gated by Hugging Face; the owner approved access and supplied the private read token. Model preparation includes safetensors, pinned remote code and both SentencePiece files. Serving is offline and removes the download token from the process environment. The cache defaults to the Linux filesystem (`~/.cache/synapse-it2/huggingface`, optional `HF_HOME` override), avoiding repeated model memory-map reads across the Windows/WSL mount.

Bearer authentication precedes body parsing, request sizes/concurrency are bounded, source text is not logged/echoed in errors, outputs must terminate correctly and timeouts return errors rather than partial/fabricated translations. Real Lingua language identification has manual selection fallback. Translation rows preserve original complaint content, immutable machine output, model/revision/source/target/detector provenance, review state and human corrections. A language change supersedes prior results and queues fresh processing; institution-only verification no longer unnecessarily queues another translation.

**Actual inference verified:** Marathi → English, Hindi → English and English → Hindi using fictional development text. **Actual integration verified:** local service → leased PostgreSQL queue → persisted model provenance → mandatory human review/correction, with original/machine text retained. Contract simulations are labelled separately. Concurrent build/model cold-start probes exhausted development memory; the final Linux-cache, one-resident-direction service passed all three directions. Actual administrator browser navigation through User Approvals/date/history controls also passed, without a decision or role change. One longer CPU reverse probe hit the enforced deadline; a shorter probe passed. This remains a resource/performance limit, not an all-input latency or linguistic-quality certification. Human translation quality acceptance is pending.

Official sources: [IndicTrans2 interface](https://github.com/AI4Bharat/IndicTrans2/tree/main/huggingface_interface), [Indic-En model/license](https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M), [En-Indic model/license](https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M), [Toolkit/runtime compatibility](https://github.com/VarunGumma/IndicTransToolkit), [Supabase password signup](https://supabase.com/docs/reference/javascript/auth-signup).

## Current security advisor results

Connector access is now available; the fresh security advisor call succeeded. It returned:

- **Seven legacy mutable-search-path warnings:** `synapse.guard_case_access_grant_write`, `enforce_symmetric_relationship_order`, `guard_case_update`, `guard_submission_insert`, `guard_case_insert`, `reject_audit_mutation`, `current_user_id`. These pre-existing legacy functions were deliberately not silently rewritten. They require a separate dependency/behavior review before hosted operational release. [Advisor 0011 remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- **One authenticated definer warning:** `public.synapse_phase2_revoke_session()`. Its existing authenticated execution is intentional: it tombstones only the verified caller's current session, with no complaint authority. Anonymous/service execution and business writes remain closed. Removing this permission would break the established logout boundary; it was not removed merely to hide an advisor notice. [Advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- **Leaked password protection disabled:** verified provider warning; no hosted setting changed by the agent. The owner must review its configuration/plan requirements before production. [Password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Other release prerequisites remain: independent deployment/gateway/security review, HTTPS/Secure-cookie evidence, production recovery/abuse policy, hosted operational/RLS/storage acceptance, approved Gmail mailbox/OAuth and owner manual acceptance. The old automatic verification-callback failure is historical; it is no longer a dependency of the selected password signup journey. Fresh new-user hosted signup/approval/rejection is reserved for the owner's manual reset tests: all four approved development addresses were already provisioned, and no unused fifth identity was supplied or invented.

GitGuardian's historical nonsecret `initdb --pwfile` finding remains subject to the owner's external classification. No suppression, history rewrite or security-check bypass is added.
