# SYNAPSE · SIH 2026

A working desktop-first complaint coordination prototype for PS 26264. Next.js App Router, strict TypeScript, Tailwind, Plus Jakarta Sans, Lucide, Recharts and React Flow. The supplied extracted Fernly design language is adapted to SYNAPSE; all institutions, officers, evidence, policies and findings in the running workspace are fictional.

## Run

Requires Node.js 22 or later and npm. From this repository:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard). On Windows use `npm.cmd` if the PowerShell npm shim is blocked by script policy.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd start
npm.cmd run test:e2e
```

Browser tests use the locally installed Microsoft Edge channel and a 1536×1024 default viewport. Start the dev server at **localhost**, not 127.0.0.1: the installed Next.js version protects dev assets by origin. Tests reuse an existing server or start one themselves. Alternate 1366, 1440, 768 and 390 pixel layouts are covered. No external service is required for the demo.

## Explore

The labeled **Demo perspective** selector offers Supervisor, Case Officer, Bureau Head, Intake Officer, Auditor and Admin. There is no demo password and no claim of real authentication. The default Supervisor sees all fictional cases. The Case Officer is Meera Iyer, assigned to Approval cases. Heads and Auditors use the Approval Bureau scope. Admin manages configuration visibility without blanket case access.

Routes: `/dashboard`, `/intake`, `/complaints`, `/complaints/[case-id]`, `/tasks`, `/calendar`, `/analytics`, `/team`, `/intelligence`, `/coordination`, `/dependencies`, `/resolutions`, `/settings`, `/help`, `/admin`.

- Review the original Marathi submission in Intake, inspect its precomputed translation, verify the institution, and register a distinct case or associate it with an authorized case.
- Open SYN-2026-1041 and SYN-2026-1042 for the connected approval/faculty story. AI Intelligence explains the related-case, synthetic conflict, and source-level contradiction findings.
- Move work through adjacent Kanban stages with dragging or the card selector. Add comments or versioned .txt evidence from case detail.
- Switch to Case Officer in Cross-Bureau, request DETAILS on the sanitized related-case reference, approve as Supervisor, and inspect document isolation. Request DOCUMENTS separately when justified.
- Dependency Explorer shows human-confirmed typed links and rejects a reverse edge that creates a cycle.
- Resolution Center contrasts SYN-2026-1043, blocked by missing evidence and a prerequisite, with SYN-2026-1046, eligible for a current gate evaluation and human-approved disposal.
- Use Ctrl/⌘+K for global search. Settings → Workspace resets the local dataset after confirmation.

## Persistence and boundaries

Fictional data is validated with Zod and stored under `synapse.demo.v1` in browser local storage. Commands enforce role/action scope, legal transitions, version checks, reason capture and audit. A workspace revision invalidates earlier closure evaluations. Other-tab updates refresh the store and stale writes are rejected. Browser-local storage is not a multi-user database; simultaneous cross-tab writes are not guaranteed transactional. Reload/reset recovers the demo. Text evidence is limited to 30 KB per file, hashed with SHA-256 and retained locally. Seed evidence has explicitly labeled demo hash markers.

Work item stages and case lifecycle are separate. Confirmed AI findings cannot merge or dispose cases. Synthetic policies and example SLAs have no official regulatory authority. Analytics shows current-state cohorts and current disposal dates; it does not claim event-sourced historical compliance.

## Supabase

The **Adi / SYNAPSE** project was found and inspected. A local ignored `.env.local` contains its verified URL and publishable key; no service-role key is used. The application remains explicitly in **Demo Mode**. Phase 1 adds a separate, default-locked authenticated read-only registry at `/live-preview`; it never uses Demo Mode identity or records.

Use `.env.example` for a new checkout. Only `NEXT_PUBLIC_APP_MODE=demo` is enabled. Setting another mode displays a blocked-integration page rather than serving fictional data as live records. `/api/health` identifies demo mode; `/api/integration` returns 503 and dated, non-sensitive integration blockers.

```powershell
node --env-file=.env.local scripts/check-supabase.mjs
```

This read-only probe writes `docs/supabase-network-check.json`. Read [Phase 1 implementation, contracts and blockers](docs/phase1/README.md), [the original Supabase audit](docs/SUPABASE_AUDIT.md), and [PRD traceability](docs/PRD_TRACEABILITY.md). The original 69-table schema has a reproducible baseline outside the migration chain. Two versioned corrections add explicit identity/readiness tables (71 tables total) and two RLS-enforced read RPCs. The private schema remains unexposed, no broad API grants were made, and all 30 legacy functions remain unchanged. Phase 2 adds real sessions, two approved test identities in separate Bureaus and a third reviewed migration for session revocation and expiring read leases (72 private tables total). Two synthetic cases support actual authorization checks. Both delivered preview gates remain off. See [Phase 2 authentication and evidence](docs/phase2/README.md); global Live Mode and business writes remain disabled.

```powershell
npm.cmd run baseline:check
npm.cmd run test:database
```

The database harness requires a dedicated PostgreSQL test cluster on loopback (default port 55432); see the Phase 1 notes. Do not point it at Supabase. `SYNAPSE_PHASE1_READ_ENABLED` is a separate server-only gate and is not a Live Mode switch. Do not unlock it or the database gate until approved accounts, real-session tests and security signoff are complete.

Current release decision: [Phase 2 security sign-off](docs/phase2/SECURITY_SIGNOFF.md) is **NO-GO for read-only activation** because provider-only logout replay remains possible at the direct RPC boundary. Original JWT expiry has been verified. Demo Mode stays enabled; no live writes are authorized.

## References and verification

- Product specification: `SYNAPSE_Complete_PRD_v1.0.md`.
- Visual extraction: `designmd-demo-codeandchill-store/`.
- The reference screenshots are now available under `SYNAPSE_Codex_Starter/reference/screenshots/`. The refined Overview is calibrated against dashboard reference 04; see [the refinement notes](docs/OVERVIEW_REFINEMENT.md).
- [Implementation notes](docs/IMPLEMENTATION_NOTES.md) document deviations and remaining integration work.
- Browser captures are generated in `docs/screenshots/`; failed-test artifacts go to ignored `test-results/`.

This is a functional local prototype, not a production deployment or a completed government integration.
