# Session liveness candidate — NOT APPLIED

Candidate: `supabase/candidates/20261026140913_phase3_verified_session_liveness.sql`. It was named with `supabase migration new`, then moved outside `supabase/migrations/` so ordinary application migration tooling cannot accidentally apply it.

The direct RPC **already checks SYNAPSE revocation tombstones** through `phase1_auth_subject()`. Application logout inserts that tombstone before provider logout. Provider-only logout removes `auth.sessions` but does not insert a SYNAPSE tombstone. The missing check is managed-session liveness, not application tombstone validation. An otherwise signed/unexpired token therefore retained its previously authorized case scope in the Phase 2 test.

## Required owner and approval

The current deployed `auth.sessions` owner is `supabase_auth_admin`, RLS is enabled, and the current operator cannot assume that role. Fresh managed advisor access is available again; this does **not** confer managed-schema policy ownership or remove the Phase 2 NO-GO. No hosted mutation was attempted by this milestone.

The candidate requires an explicitly approved migration principal authorized to manage **both** the managed table policy/column ACL and the application roles/functions. Being able to query the table or use an API secret is not sufficient. Its first DO block rejects a principal lacking table-owner authority before making any change. If no such supported owner route is available, leave the file where it is and request a supported Supabase session-validation mechanism. Do not set BYPASSRLS, disable Auth RLS or use a service client to work around this boundary.

## Exact reviewed behavior

- Adds `synapse_session_validator`, NOLOGIN/NOINHERIT/NOBYPASSRLS, owning no tables and inheriting no roles.
- Grants only Auth/SYNAPSE schema USAGE and `auth.sessions(id,user_id,not_after)` SELECT. It cannot read refresh tokens, unrelated source columns or business tables.
- Adds a role-specific session SELECT policy matching **both** the gateway-verified session ID and subject.
- Adds parameterless private `synapse.phase3_session_is_active()` with empty search path and row security on, owned by the validator. Only the registry reader can execute it; API roles cannot invoke it directly.
- Replaces only `phase1_auth_subject()` to require a live provider session as well as future JWT expiry and absence of an application tombstone. Missing, different-subject and expired managed sessions fail closed. The current-session-only logout RPC remains idempotent and can record a tombstone after provider session removal.
- Enables no mode, read gate or business write, and changes no original legacy function.

## Owner execution procedure

1. Keep the delivered server gate off and verify `SELECT read_enabled,read_until FROM synapse.phase1_access_config` returns false/null. Confirm the approved pair is still active and no broader provisioning occurred.
2. Review the candidate, its SHA-256 in `migration-review.json`, the local test evidence, schema ownership and current advisor findings with the authorized managed-schema owner. Obtain explicit approval for the **exact** file; this document is not that approval.
3. On a disposable managed-equivalent test environment, run the candidate in a single transaction using the authorized principal: `BEGIN;` then the exact SQL file then `COMMIT;`. A failed preflight must end in ROLLBACK. Never partially copy grants into production or change the principal to an API/service role.
4. Inspect the validator role attributes, non-owner source relation, narrow columns, RLS policy, empty search path and helper ACL. API roles must have no Auth-session table privileges or private-helper execution.
5. Execute the real issued-JWT regression runner against the approved pair. Provider-only logout must make the unchanged JWT fail all protected read RPCs before expiry; B must retain only its own Bureau rows. Repeat application logout, refresh, original expiry, suspension, mapping/role/membership revocation and forbidden writes. Local simulated session rows do not prove this hosted behavior.
6. Only after those tests and independent sign-off, move/copy the reviewed file into the applied migration chain and record the exact SQL/hash in migration history through the authorized versioned deployment path. Do not rewrite Phase 1/2 history. Persistent preview remains a separate release decision.

## Rollback considerations

Rollback reopens the provider-only logout weakness and is allowed **only with both read gates disabled**. In one authorized owner transaction: restore `phase1_auth_subject()` exactly from applied migration `20261026121302_phase2_session_revocation.sql`; drop `phase3_session_is_active()`; drop policy `synapse_phase3_current_session` on `auth.sessions`; revoke the validator's three-column SELECT, schema USAGE and helper EXECUTE grants; revoke its memberships; drop the now-unused validator role. Never delete existing tombstones or Auth sessions. A forward corrective migration is preferred after deployment; append rollback history rather than deleting the original version.

## Evidence distinction

The disposable PostgreSQL suite replays the original baseline and all applied migrations first, executes 69 existing authorization assertions, applies this candidate **locally**, and simulates managed-session rows under RLS. It tests live, deleted, different-subject and provider-expired sessions and private-helper grants. No real JWT is issued by that local suite. The hosted session fix is **BLOCKED / UNAPPLIED** until the owner procedure is available.

Supabase references: [session invalidation](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out), [advisor 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).


## Phase 16 dated follow-up (2026-10-28 local date)

The historical failure and unapplied managed-schema candidate above remain intact. The current private web gateway now requires a real provider refresh followed by online user verification before protected requests (`lib/auth/live-session.ts`). `docs/phase16/HOSTED_SESSION_RESULTS.json` records newly executed real login/refresh/logout/replay tests for the three approved current accounts: provider user lookup after logout returned 403, refresh replay 400 and strict application replay was denied. Both legacy public case RPCs remain ACL-closed before and after logout; no safe reopening is claimed. No managed Auth table or ownership boundary was changed. This current evidence supersedes the assumption that the old provider-user behavior necessarily persists; it does not establish independent release approval, hosted positive business-write acceptance or complete production readiness. See `docs/phase16/RELEASE_REVIEW.md`.
