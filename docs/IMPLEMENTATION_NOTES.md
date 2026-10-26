# Implementation notes

## Reference resolution

Later Overview refinement: the seven screenshots are now present under `SYNAPSE_Codex_Starter/reference/screenshots/`. The existing Overview has been calibrated against dashboard reference 04 at 1763×1163; see `OVERVIEW_REFINEMENT.md` and the updated `TEST_RESULTS.md`. The following paragraphs describe the inputs available during the initial implementation.

The input directory was a reference pack, not an existing application or Git repository. The PRD and master prompt were in the root; the primary extraction was `designmd-demo-codeandchill-store/`, not the prompt's `reference/designmd/` path. Neither the seven Fernly screenshots nor the referenced database corrective migration package was present in this repository or the nearby reference folders searched.

The implemented visual system uses the extraction's documented green palette, Plus Jakarta Sans, pale gray outer canvas, separately rounded sidebar/topbar/workspace, white 20px cards, gradient pills, outlined icons and restrained borders. Orange `--g-*` values in the extraction conflict with its documented green palette; the master prompt's SYNAPSE green requirement takes precedence. Zero-height extracted inputs were treated as scan artifacts. No branded Fernly assets, staff identities or unrelated task content were reused. Exact seven-screenshot fidelity cannot be claimed without the missing inputs.

## Implemented behavior

All 14 navigation routes and case detail share a reusable application shell and component layer. Main operational screens include search/filter/sort/pagination, registration, multilingual intake review, case assignments/notes/evidence/work/timeline/actions, Kanban movement with a selector alternative, calendar month/day/filter interactions, source-derived analytics/CSV, fictional directory profiles, saved settings, help topic/search/FAQ, and scoped audit views.

The four innovations are demonstrable with explicit synthetic labels: evidence-backed Conflict Sentinel, source-level evidence contradiction, confirmed typed relationship graph with cycle rejection, and a mandatory Resolution Quality Gate. Findings require human review and reasons; accepting them does not merge or dispose cases. Disposal is separately authorized and revalidates current requirements. Reopening retains the prior disposition timestamp and starts a new cycle.

Access requests record purpose, scope, duration and a Supervisor decision. Sanitized discovery references expose no restricted subject or institution details. DETAILS grants permit read access without DOCUMENTS or action authority. DOCUMENTS requires a separate grant and existing case-detail visibility. COORDINATE does not confer disposal authority or document access. Expired grants fail service checks. Production still requires independently enforced database/server authorization.

## Data and service boundaries

`lib/domain.ts` owns command validation, role/action scope, legal transitions, stale revisions/versions, dependency rules, findings review, intake replay, gate evaluation and audit. `lib/repository.ts` implements typed case/task/finding repository interfaces and browser persistence; no real database table names are invented for demo state. `components/provider.tsx` exposes scoped reads. The browser owner can inspect or alter all local fixtures, so Demo Mode is never represented as secure real authentication.

The versioned Zod persistence parser validates nested records and upgrades the additive local access-request collection with an empty default. Invalid persisted data loads a fresh dataset with a visible warning. Storage errors retain an in-memory session and show an honest warning. Cross-tab storage events refresh state and stale writes are rejected, but local storage cannot provide a multi-tab compare-and-swap transaction; simultaneous writes remain a demo limitation.

Text evidence uses a real SHA-256 hash and preserves same-name versions. Seed documents use explicitly identified demo hash markers, not fabricated cryptographic checksums. File types beyond .txt, OCR, antivirus/quarantine and remote signed URLs are outside this local prototype.

## Supabase outcome

Phase 1 update: see `phase1/README.md` for the captured baseline, applied corrective migration history, trusted JWT-to-user mapping, RLS-enforced read-only server architecture, deployed authorization tests, and remaining real-session/provisioning prerequisites. This implementation supersedes the initial absence of a read adapter; it does not enable Live Mode or repair/expose legacy writes.

The connected Adi organization and active healthy SYNAPSE project were verified. The actual schema, constraints, policies, function code, indexes, triggers, grants, advisors, empty user/case/storage state and migration history were inspected. Publishable-key Auth health and private-schema access were probed; two no-actor workflow denials passed. Read `SUPABASE_AUDIT.md` for the full dated findings.

Live integration is **blocked**, not secretly mocked. The identity helper uses an unbound session setting, the deployed lifecycle differs from the PRD, global-administrator bypasses conflict with the product access model, closure freshness/current-authority checks need review, and no private evidence storage or operational users exist. Client roles lack schema usage and the Data API rejects `synapse`. No schema/grants/roles/buckets/business records were changed. A locally ignored publishable-key configuration and repeatable read-only network diagnostic are provided. Unsupported real-mode configuration fails closed.

## Deliberate limits

- No live email ingestion, model provider calls, autonomous decisions, external notification delivery, support chat, account provisioning or government integration is claimed.
- Translations, matching, conflict and contradiction findings are precomputed deterministic examples with uncertainty labels.
- Supervisor review stands in for delegated cross-Bureau transfer/access authority. Production may require independent source/target approvals and approved separation-of-duty rules.
- Deadline examples use calendar days; no official holiday calendar, statutory SLA, automatic pause, scheduler or escalation worker is invented.
- Analytics reports current-state received cohorts and current disposal dates, not reconstructed historical compliance. Missing denominators render as an em dash.
- Admin membership and policy panels are inspectable fixtures with explicit server-configuration requirements. There are no fake account-grant or policy-publish success buttons.
- Local audit is workflow-generated and scoped, but not tamper-proof. Backup/restore, load tests, live RLS, real authentication, concurrent DB approval/transfer/graph tests and full recovery tests remain open.
- PDF/Word evidence, multilingual UI chrome, remote avatars and production hosting are outside this prototype. The application was built locally in the requested repository.

## Verification

See `TEST_RESULTS.md` for exact final commands, pass counts, browser dimensions and captured screenshots. Windows/npm startup and cold Turbopack compilation are slow on this F: filesystem. The installed Next.js 16.4 development server protects HMR assets by hostname; tests intentionally use localhost. The Node test output's first JSON serialization assertion was corrected to compare stable serialized values rather than optional undefined object keys.
