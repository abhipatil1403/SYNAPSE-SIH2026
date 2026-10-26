# Phase 1 corrective migration review

Scope: preserve the deployed lifecycle, 30 legacy function definitions, operational data, Demo Mode and all write restrictions. Add one disabled authenticated registry workflow. No reset, table exposure, blanket API grants, service credentials, or automated role/identity provisioning.

## Decisions

- Existing `external_subject` and `current_user_id()` remain legacy contracts; they cannot safely become browser authorization. A new privileged `auth_identity_links` binding references actual `auth.users` IDs and active internal users. Deletion of an Auth identity removes its binding; explicit revocation and internal suspension take effect on each read. No user-editable metadata or email matching is used.
- Only two RPCs are added to the already exposed `public` schema. They are owned by a dedicated NOLOGIN, NOINHERIT, NOBYPASSRLS role that owns no tables, has only column SELECT privileges and cannot execute legacy write or bypass helpers. Its functions set an empty search path and `row_security=on`. All source tables it reads have RLS. Authenticated callers receive EXECUTE on only these two RPCs, no schema/table grants.
- `cases_select_authorized` and `access_grants_select_authorized` move from PUBLIC to their sole existing effective SELECT grantee, `synapse_app`. A migration precondition rejects unexpected grantees. Their expressions stay unchanged. This isolates the new reader from legacy definer helpers without broadening old access.
- Enabling RLS on reference tables preserves existing `synapse_app` lookup reads with explicit legacy policies. Other newly protected tables had no existing non-owner read grants. Existing postgres-owned workflow helpers retain their previous behavior; none is exposed by this phase.
- Case Officers see assigned cases or explicit DETAILS/COORDINATE grants. Heads/Auditors require active matching Bureau membership and role scope. Senior Management/Reviewers require explicit grants. SYSTEM_ADMIN alone grants no case content. Roles and memberships are time-bounded; REGION scopes are unsupported and fail closed. DOCUMENTS/DISCOVER/EXPORT grants do not confer registry details.
- DRAFT cases are excluded from the registered-case list. Raw legacy lifecycle and priority codes remain visible in a separate typed read model. Ambiguous lifecycle mappings are never persisted. No write-capable taxonomy migration is approved in this phase.
- Each case has one result row; the earliest outstanding case-level SLA is selected, task-level instances are excluded, and missing deadlines remain null. Case numbers/versions cross JSON as strings to preserve bigint precision.
- Both a database readiness switch (default false) and a server environment switch (default false) gate preview access. Neither activates Live Mode. No account, membership, grant, or live case is provisioned by the migration.
- Hosted postgres is not a superuser. Function ownership transfer uses temporary SET membership in the new reader role and temporary CREATE on public. Both capabilities are removed within the same migration transaction; the creator retains ADMIN-only membership (INHERIT false, SET false) for future migrations. No application role receives membership. The first hosted application attempt exposed that requirement and rolled back completely; catalog checks confirmed no partial objects or policy changes remained.
- Hosted Auth schema USAGE is managed by `supabase_admin` and cannot be delegated by postgres. The second migration replaces the new `auth.uid()` dependencies with `phase1_auth_subject()`, an invoker helper reading gateway-verified `request.jwt.claims`. It rejects malformed subjects, non-authenticated roles and anonymous identities. The gateway verifies the JWT signature, the server performs online `getUser()`, and SQL independently resolves the explicit active identity link. It never accepts `synapse.user_id`, the legacy claim-sub setting, email matching or user-editable metadata as authority. The reader has no managed Auth schema usage.
- Public-schema default function ACLs initially included service_role. The second migration explicitly removes PUBLIC/anon/service_role EXECUTE from the two RPCs; only authenticated callers and the function owner retain it. A service key is neither required nor accepted as a staff principal.
- The security advisor flags the two intentional authenticated SECURITY DEFINER RPCs. This is a reviewed privilege boundary, not a way around RLS: the owner is NOBYPASSRLS, owns no source table, has no writes, and all readable source tables enforce RLS. Record this intentional design and obtain independent security signoff before activation. The seven legacy search-path warnings remain unmodified.

## Applied history

The two migration files were created with the Supabase CLI and their timestamp filenames aligned to the actual deployed migration-history versions: `20261026105644` and `20261026110430`. The captured baseline is not registered as an applied migration. Before the first successful deployment, two ownership/grant attempts rolled back entirely. Hosted authorization tests then exposed the managed Auth-schema permission limitation; their fixtures also rolled back, including configuration. Explicit synthetic case numbers avoided advancing a nontransactional identity sequence. The corrective second migration resolved that hosted difference. Final hosted authorization checks: 49/49, with no surviving users, links, cases or sequence changes.

## Review gates before applying

1. Read-only baseline captured and deterministic SQL/manifest verified.
2. Baseline restored into a disposable database; source catalog/legacy function definitions compared.
3. Corrective migration applied locally; role ownership, column grants, RLS, identity forgery/expiry/suspension, cross-Bureau isolation, query validation, defaults and write denial tested.
4. Only after those checks, apply the exact versioned migration through the connected Supabase migration tool. Re-run authorization tests in a rolled-back transaction and inspect advisors/grants. No fixture survives that transaction.

## Still excluded

Live activation; operational user provisioning; document access/storage; draft confirmation; write APIs; lifecycle changes; approvals/disposal fixes; jobs; AI processing; concurrency-sensitive commands; official policies. A real Auth-account end-to-end test requires an approved provisioned test account. Simulated JWT claims in database tests prove SQL policy behavior, not Auth issuance or HTTP JWT validation.
