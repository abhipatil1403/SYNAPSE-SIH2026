# Original dashboard consolidation

**Hosted Live Mode: NO-GO. Hosted business writes: disabled. Final acceptance: AWAITING USER MANUAL TESTING.**

The original dashboard is the sole operational interface. It now uses real Supabase password sessions, trusted server-side identity resolution and the existing isolated PostgreSQL engine. The former `/platform` shell and officer landing pages redirect to original routes. Legacy Demo modules remain historical engineering sources, without a reachable operational Demo identity or browser-local business database.

## Connected architecture

- `OperationalProvider` caches only the current authorized server projection. Commands commit to PostgreSQL before refetching; focus, visibility, polling and cross-tab messages refresh dependent pages. Authentication changes clear the prior identity's cache.
- Original Overview cards, rounded charts, sidebar, search, calendar widget and navigation retain their theme. Metrics use raw registered-case lifecycle codes and actual authorized counts. Genuine empty repositories stay empty.
- Registry, intake, institutions, tasks, Kanban, case operations, evidence, coordination, dependency graph, resolution, reports, analytics, notifications, administration and profile share the original shell and routing.
- Full Calendar reuses the original month grid, keyboard navigation and filter controls. Overview and full Calendar use the same selector. Rescheduling/cancellation preserve prior schedule audit and case-version checks; cancelled events leave both calendar projections.
- CSV export requires an audited current-revision operation and a freshly checked fingerprint of the authorized rows (including before receipt replay), exports only the already-authorized projection and escapes spreadsheet formula prefixes.
- Officer approval requires an explicit Bureau, role and expiry. Approved-account suspension/revocation does not show misleading Bureau-assignment controls. Profile updates permit only the current active user's display name; email/roles/Bureaus cannot be injected through that endpoint.
- Administrator Settings includes the real authenticated readiness checklist. Public health reports configuration without pretending that a database or provider health check ran.

Business writes in this environment use **only the isolated loopback development database**, never hosted Supabase complaint tables. The hosted gateway retains restricted NOLOGIN/NOBYPASSRLS owners, fixed search paths, transactional claim context and browser execution denial. No operator/model-provider secret is loaded into Next.js.

## Reviewed migration and account recovery

`20261027075125_phase10_self_profile.sql` adds one private, audited self-name operation and a column-scoped grant to its existing owner. It does not modify managed Auth objects or any existing complaint function. The exact SQL hash and hosted application evidence are in `PROFILE_MIGRATION_REVIEW.json`; fresh disposable authorization tests cover unauthorized callers, role injection, unmapped identity, suspension and expired authority.

Officer B's approved development Auth identity was absent following the owner's earlier deletion. The recovery runner used real signup, observed Pending Approval and HTTP 403 for complaint access, and retired only its exact snapshotted old internal identity through the existing audited procedure. Historical internal IDs and cases were retained. Independent administrator approval subsequently appeared in hosted audit outside the automated approval step; that step is not represented as an automated pass.

The approval used Approval Bureau while the pre-authorized plan specified Academic Bureau. The exact development-only correction was dry-run checked and applied through the owner operator. It retained CASE_OFFICER, bounded authority by the approved expiry, expired prior assignments without deletion and moved no case. Owner-executed correction provenance is explicit in append-only audit; it is not presented as an issued administrator-session operation. See `OFFICER_B_RECOVERY.json` and `BUREAU_CORRECTION.json`. Officer A was not elevated or reassigned.

The setup script now refreshes existing directory references without relying on pre-deletion password/Auth-UUID vaults. Recreated users enter the local directory through current trusted gateway resolution on login.

## Reproduce verification

The PowerShell capture helper stores current owner-entered passwords using Windows CurrentUser DPAPI and a current-user-only DACL. It persists only the DACL and does not require SeSecurityPrivilege or an elevated terminal.

```powershell
powershell -NoProfile -File scripts/workbench/capture-real-users.ps1
node scripts/phase10/check-real-auth.mjs
node --env-file=.env.local --env-file=.env.operator.local scripts/phase10/test-connected.mjs
node --env-file=.env.local --env-file=.env.operator.local scripts/phase10/test-real-security.mjs --approved-development-security-tests
```

The connected browser runner creates a fresh database on the dedicated disposable cluster, imports active Bureau/category reference metadata only, starts a restricted production web process and creates business records through the real UI. It checks reloads, raw API results, SQL persistence, calendar changes, evidence, reports, authorization and final metric propagation. It drops only its own generated database and roles. The persistent owner-testing database is not seeded or reset.

The final build passed typecheck, lint, production compilation and all 117 unit tests. Both authenticated browser tests passed with actual issued Supabase sessions; the three public authentication browser checks are separate from those account tests. The hosted security report records 14 passing checks, including provider-only logout followed by denial of a copied SSR cookie. Three current accounts passed login, authorized snapshot and logout; an actual incorrect-password request returned HTTP 401. These checks do not establish the outstanding natural-expiry soak or production activation prerequisites.

The PostgreSQL workbench regression also registers and reloads original complaint text longer than 20,000 characters without truncation. State is validated before collection persistence; an invalid generated record rolls back without poisoning subsequent reads. The case summary limit now matches the existing 200,000-character intake limit.

`CONNECTED_DATABASE_EVIDENCE.json`, `TWO_ACCOUNT_BROWSER_EVIDENCE.json`, `REAL_AUTH_CHECK.json` and `REAL_SECURITY_EVIDENCE.json` contain only checks that actually executed. A failed or missing report is a blocker. The [per-page matrix](FEATURE_VERIFICATION_MATRIX.md) distinguishes browser evidence from real PostgreSQL suites using synthetic identities and from provider contract doubles.

Automatic Playwright page snapshots and traces are disabled for credential safety. A diagnostic failure snapshot previously exposed Officer A's password in this private chat. The generated artifact was redacted, the owner confirmed password rotation and recaptured credentials, and subsequent checks use the new vault. Failed login forms are also cleared before assertions. Never inspect or publish raw authentication artifacts.

## Remaining limitations and release blockers

- **Gemini development integration: VERIFIED provider + PostgreSQL pipeline.** The dedicated Google AI Studio key in `SYNAPSE_GEMINI_EMBEDDINGS_API_KEY` passed actual 768-dimensional embedding inference. The leased SQL queue persisted vectors/model provenance, category suggestions, actual matching recommendations and a human decision (`GEMINI_PROVIDER_EVIDENCE.json`, `GEMINI_DATABASE_EVIDENCE.json`). Tests used approved fictional source text; the SQL-pipeline identity is explicitly synthetic. No automatic merge occurs. The worker does not read the old `SYNAPSE_GEMINI_API_KEY`; existing values and Gmail OAuth settings remain separate. The initial old-key service restrictions were observed and not bypassed.
  Retrieval uses environment/institution/fingerprint index shortlisting and lexical ranking before bounded actual cosine reranking. A GIN lexical index exists; the small-fixture RLS query selected an environment B-tree instead. GIN runtime use, scale performance and an ANN vector index are not established. The 49-candidate cap and development thresholds still require retrieval/quality calibration and manual acceptance.
- **Gmail intake: BLOCKED.** No dedicated mailbox/OAuth access is approved. The fourth Auth-testing address remains excluded. Queue/fingerprint/attachment/deduplication tests with synthetic sources do not establish actual mailbox delivery.
- **IndicTrans2:** actual pinned-model inference and SQL queue/provenance tests are separate from engineering doubles; consult the dated test evidence. Human translation-quality acceptance remains pending. Serving requires the authenticated local CPU service; configured URLs alone do not establish operation.
- **Binary malware scanning: INCOMPLETE without an actual scanner.** PDF/PNG/JPEG downloads stay quarantined. UTF-8 text follows the explicit NOT_REQUIRED text policy; that is not a fabricated clean malware scan.
- **Reopening:** a reviewed persisted review-cycle implementation is still required. Disposed records remain read-only. No dead reopening button or false success is exposed. Disposal completes its active SLA clocks while retaining original due dates.
- **Hosted activation:** current-account expiry-only soak testing, reviewed HTTPS/Secure-cookie deployment, production mail/abuse policy, background-worker authorization freshness, cross-database authorization/commit race review, independent release approval and production workflow deployment remain outstanding. Current per-request checks do not establish atomic authorization across two database systems.
- **Existing advisories:** seven legacy mutable-search-path functions, intentionally caller-only `synapse_phase2_revoke_session` advisor 0029 and disabled leaked-password protection remain recorded. The private profile operation has no browser execution grant. Existing managed-schema ownership boundaries are preserved.

There is no global Live switch in the browser, and passing engineering suites cannot enable hosted business writes.
