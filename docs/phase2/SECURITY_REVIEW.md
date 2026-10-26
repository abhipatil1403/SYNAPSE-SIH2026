# Phase 2 security review — verified implementation, independent signoff pending

The Phase 1 baseline, both applied migrations and all 30 legacy function definitions are preserved. Connector calls to project metadata, advisor and SQL inspection are currently denied. The separately authorized operator connection subsequently passed a fresh deployed catalog/grant/RLS audit over verified TLS. `hosted-security-review.json` records the actual results and exact migration history; `hosted-authorization-results.json` records 69 passing rolled-back assertions. No fresh managed-advisor run or independent human signoff is claimed.

## Read RPC / advisor 0029 review

The recorded `synapse_phase1_me` and `synapse_phase1_cases` functions are owned by `synapse_case_reader`, a NOLOGIN, NOINHERIT, NOBYPASSRLS role owning no source table. Both set an empty search path and row_security=on. Column SELECT grants are narrow, every available source table has RLS, anon/service_role/PUBLIC EXECUTE was removed, and authenticated receives only the intended RPC EXECUTE. The private operational schema remains unexposed. No service credential is used by application queries.

These are intentional SECURITY DEFINER boundaries. Advisor [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) identifies their callable-definer shape, not proof that table RLS is bypassed. The narrow non-owner role is necessary to access private source columns without granting browser roles schema/table access. Independently verify current ownership, inherited privileges, grants and source-table RLS using `scripts/phase2/hosted-audit.mjs` before activation. No independent human approval is inferred from automated tests.

## Confirmed gap and applied correction

Supabase access JWTs can remain valid after provider sign-out until expiration. Phase 1 only called provider signOut, so it lacked an application-session replay denial. The applied migration adds a private forced-RLS revocation table and an isolated NOLOGIN/NOBYPASSRLS session-revoker role. That role can insert **only its own gateway-verified subject/session ID**; it has no business-table read or write rights. The registry role still has no writes. A narrowly callable logout RPC records a tombstone, making that session fail future registry checks even with an otherwise unexpired JWT. Other accounts/sessions cannot see or revoke it. No metadata/client actor is accepted.

JWT subject resolution additionally requires a valid UUID subject and session_id, authenticated non-anonymous role, numeric future exp, and no matching revocation. Gateway signature validation remains essential; SQL fixtures do not replace it. This mechanism immediately revokes sessions logged out **through SYNAPSE**. Administrative/provider-only sign-outs outside SYNAPSE still need an auth.sessions check or synchronized revocation; they are not claimed covered by local tests.

Controlled database preview access gains an expiring `read_until` lease. A test-run crash cannot leave reads enabled indefinitely. The verifier refuses an already enabled gate and any extra active identity mappings beyond the two approved accounts, uses a ten-minute lease, and restores the prior gate after tests. Global Live Mode and application business writes remain disabled.

## Application changes

- Logout remains available when read access is locked, records session revocation before provider sign-out, always clears local HttpOnly cookie chunks, and does not report success if server-side revocation fails.
- Explicit same-origin POST refresh performs provider rotation, verifies online Auth identity and current database authorization, and returns no tokens.
- Server preview account allowlist uses actual Auth UUIDs; an empty list authorizes no one. It is separate from Demo Mode. Supabase JWT/RLS authorization still applies independently.
- Cross-tab sign-out broadcasts trigger immediate UI clearing/revalidation. No credentials enter localStorage or the browser bundle. Protected data remains in no-store API responses; the public preview page contains no private SSR payload.
- Dynamic readiness uses current environment/network observations and fresh matching-project receipts (24-hour maximum); missing/stale evidence remains blocked. It never treats an earlier static audit as current proof or enables a mode.

## Operator controls

Operator-only secret key is used solely for Auth account management. Database operator access is used for reviewed migrations, explicit identity/membership/role provisioning and isolated development fixtures—not for application case reads. Test account passwords are cryptographically random and DPAPI encrypted for the current Windows user, under ignored `.local/phase2/`. No unrelated identity adoption, broad grant, schema reset or production identity invention occurs. The restricted recovery procedure rotated only the newly created, never-used, unmapped Officer A account after an initial vault failure; subsequent provisioning and real authentication passed. Memberships/roles expire within seven days; reruns refuse revoked/suspended mappings rather than reactivate them.

## Remaining release gates

Current hosted catalog/migration checks, approved provisioning, actual issued-JWT login/rotation/logout replay, two-Bureau isolation and loopback cookie/server-route tests passed. Persistent preview activation still requires actual signed-token expiry rejection and independent RPC/advisor review. The bounded controlled preview was tested successfully and stopped. Full Live Mode/business writes remain out of scope. Session timeouts/MFA, external administrator logout synchronization, distributed login throttling and HTTPS deployment policy remain operational hardening items.
