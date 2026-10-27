# Bureau role management continuation

This extends application-owned configuration management. It does not enable complaint writes, public RPCs, permanent read preview or global Live Mode. The three existing approved identities and both original CASE_OFFICER assignments are preserved.

## Reviewed migration

`20261026191333_phase6_admin_role_assignments.sql` was generated using Supabase CLI `migration new`. Its exact review copy is in `supabase/candidates/`; `gateway-review.json` records the SHA-256 used by the existing reviewed application-only deployment procedure.

The only additional source privilege is SELECT of `user_role_assignment_id` for the existing non-login/non-owning/NOBYPASSRLS account manager. Its existing narrow INSERT/UPDATE privileges suffice; no role_id UPDATE, source table ownership or complaint/document access is granted. The new function resides in the unexposed private gateway schema, is owned by that manager, has empty search_path and RLS enabled, and revokes PUBLIC/anon/authenticated/service_role execution. Only the existing restricted web gateway can execute it. Managed Auth objects and old legacy function definitions are unchanged.

Every operation checks trusted server-supplied verified claims, current application session tombstones, active account/identity link and current GLOBAL SYSTEM_ADMIN authority. It locks actor authority through the configuration transaction. Self-management, GLOBAL/REGION targets, SYSTEM_ADMIN elevation and user-supplied Bureau/scope fields are denied. Only current BUREAU assignments for CASE_OFFICER, BUREAU_HEAD, AUDITOR and REVIEWER are manageable.

Role windows must be 1 hour–90 days and fit a current membership in the same Bureau. Revocation can remove a role even if its membership has expired. Replacement expires the original assignment and inserts its successor, retaining history. Same-code window reviews preserve the assignment ID. Expected role/expiry detect stale input; request IDs serialize retries; immutable audit records bind the actor, target, original values, request and result. Conflicting replays fail. Per-user/Bureau serialization prevents creating a duplicate current replacement role. No membership is created or extended by a role review.

## UI and session behavior

`/officer-admin` adds bounded role reviews/revocation alongside existing account approvals and memberships. The list explicitly reports truncation beyond 100 current assignments; further entries require operator review. Global administrator configuration remains outside these controls.

The administration boundary rechecks current session/role on focus, visibility, a 30-second timer, authorization failures and logout broadcasts. On lost/unverifiable authority, all account/member/role forms unmount so late component responses cannot restore records. API authorization remains mandatory on every request; client checks grant no authority. Original database timestamps, including microseconds and timezone representation, are retained when a local expiry field is left unchanged.

## Validation and activation

Disposable database tests execute actual SQL with simulated claims: full approval, independent role replacement/revocation, retained history/audit, direct-call/global/self rejection, membership bounds, stale inputs and replay conflicts. Separate-connection tests verify an in-flight role review blocks actor-role and target-membership revocation until transaction completion. These are not issued-JWT tests.

Hosted validation passed five groups using only real approved sessions. Administrator API and browser reviews kept the exact current CASE_OFFICER code/expiry and every original role assignment record unchanged. Both real officers were denied role lists and decisions. Real administrator-authority revocation temporarily expired only its configuration role; the open administration forms cleared and redirected to Pending Approval, and finally restored the original expiry exactly. Actual logout in another tab cleared the administration page and rejected the old session. Replays/global targets/elevation attempts were rejected. Test receipts are private/ignored. No replacement officer identity or public test password was invented. Role replacement/revocation of an officer is tested in disposable SQL, not applied to either approved hosted officer.

The 97 unit tests, current typecheck, zero-warning lint, production build, isolated SQL authorization/concurrency suite, hosted 11-group issued-JWT suite, hosted five-group role suite, current ten-check gateway catalog audit and five-group real HTTP suite passed. Full Demo/browser regression and exact-head GitHub verification are recorded in delivery evidence. The original 69 historical database assertions and all 30 legacy function definitions remain preserved. Current hosted migration history contains nine reviewed entries; no SLA/managed-session candidate is applied.

The managed Supabase advisor connector again returned a permission denial. Current ACL/RLS/history and source-shape verification use the separately authorized verified-TLS operator connection; this does not imply a clean advisor result. Production HTTPS/email policy, independent gateway release review, and a separate approved pending officer's hosted approval/Bureau-assignment acceptance remain outstanding. Both read gates and business writes must stay closed.
