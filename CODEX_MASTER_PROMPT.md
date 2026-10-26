# CODEX MASTER IMPLEMENTATION PROMPT — SYNAPSE

You are the lead full-stack engineer, UI implementation specialist, and QA engineer for **SYNAPSE**, an AICTE institution-related complaint coordination and resolution platform for SIH 2026, PS 26264.

**Execute the work in the repository, not just describe it.** Build a functioning, visually faithful, desktop-first web prototype immediately. Do not stop at planning, scaffolding, or static mockups. Work incrementally, run the app, inspect results, fix errors, and report precisely what is implemented. Do not ask routine clarification questions; choose sensible, documented defaults. Never claim an integration or test is working unless you actually verified it.

## 0. READ THESE LOCAL INPUTS FIRST — SOURCE PRIORITY

1. `reference/screenshots/fernly-reference-01.png` through `fernly-reference-07.png`: **visual ground truth** for seven Fernly pages. Use these for overall composition, proportions, visual hierarchy, spacing, typography, density, chart appearance, and sidebar/topbar/card design. Examine each screenshot, not only the first.
2. `reference/designmd/designmd-demo-codeandchill-store/design.md`: **measured design system** (color, type, radius, shadows, components, states).
3. `reference/designmd/designmd-demo-codeandchill-store/tokens/tokens.css`, `code/theme.css`, `code/globals.css`, `code/components.tsx`, `code/components.css`, and `agents/AGENTS.md`: reusable design implementation guidance. Audit generated components before reuse; measurements can contain artifacts (e.g., zero-height inputs) and should not override clear screenshot evidence.
4. `docs/SYNAPSE_Complete_PRD_v1.0.md`: **product and workflow source of truth**. Use its roles, complaint lifecycle, innovations, security constraints, and acceptance tests. Visual reference must never override product semantics.
5. If present, inspect the real Supabase schema/migrations and existing application code before writing integration code. **Do not invent deployed table names or bypass RLS**.

When references disagree: screenshots determine appearance, measured design tokens guide implementation, PRD determines product behavior, and verified deployed schema determines actual persistence. Write any unresolved conflicts in `docs/IMPLEMENTATION_NOTES.md`.

## 1. NON-NEGOTIABLE GOAL

The app should look and feel as close to Fernly as practical **but be SYNAPSE, not Fernly**. Preserve the recognizable soft minimalist SaaS design: pale gray canvas, large rounded off-white app shell, inset white cards, generous gutters, forest-green gradient pills, restrained borders/shadows, Plus Jakarta Sans typography, outlined icons, pill filters, small colored tags, circular avatars, polished charts, soft hover states, clean density. Do not substitute a generic shadcn admin template, dark theme, bright blue government portal, glassmorphism, or random AI gradients. Do not use the Fernly name, logo, user identities, marketing content, or unrelated task/project data in the product.

Visual goal at desktop ~1536×1024: left rounded fixed sidebar around 250–270px, narrow shell gutters, separate rounded topbar, large rounded main workspace, compact page headings, balanced 4-column KPI cards and asymmetrical bento dashboard, all visually aligned with the screenshots. **These sizes are screenshot-derived starting estimates, not hard-coded absolute requirements**. Use screenshots and actual rendering to tune. Keep the main app usable at 1366px and 1440px; adapt cleanly to tablet/mobile with an accessible sidebar drawer and responsive cards/tables.

Measured tokens to begin with (verify against design.md): `#f5f6f5` canvas, `#fdfdfc` surface, `#131a15` primary text, `#646d67` secondary text, `#e3e7e4` border, `#1d7347` accent, `#0d3a23` deep green, `#5dbd8b` mid-green; Plus Jakarta Sans; cards ~20px radius, inputs ~12px, pill controls; restrained 200–250ms transitions; reduced-motion support. A darker gray outer canvas is visible in some screenshots: compare and tune from visual evidence rather than blindly using one token. Create a centralized token layer. Use lucide-react icons, Recharts for charts, and React Flow for relationship graph. Avoid hardcoded one-off styling repeated across pages.

## 2. BUILD STACK AND PROJECT SHAPE

- If repository is empty, initialize Next.js App Router + TypeScript + Tailwind CSS + ESLint, using the installed compatible versions. Prefer the package manager already in the repo.
- Add only necessary dependencies: lucide-react, Recharts, @xyflow/react, Zod, React Hook Form where useful, Supabase SSR/client packages if credentials are available, and a drag-and-drop library if needed for Kanban. Use accessible primitives and reusable components.
- Implement a consistent application shell (`Sidebar`, `Topbar`, `PageHeader`, `SearchCommand`, `UserMenu`, `NotificationMenu`) and UI primitives (`SurfaceCard`, `MetricCard`, `PillButton`, `FilterTabs`, `StatusBadge`, `Avatar`, `EmptyState`, `LoadingSkeleton`, `ConfirmationDialog`, `DataTable`, `ActivityTimeline`, `EvidenceList`).
- Keep strict TS types, feature-organized code, route-level loading/error/empty states, no console errors, no dead buttons. Use sensible file organization (`app/`, `components/`, `features/`, `lib/`, `data/`, `types/`, `docs/`).
- Use server-only boundaries for secrets and privileged operations. Never place a Supabase service-role key in the browser or client bundle.

## 3. APPLICATION INFORMATION ARCHITECTURE

Use this SYNAPSE sidebar (group sections in the Fernly style; scroll if needed, preserve generous spacing):

**WORKSPACE**
- Overview `/dashboard`
- Intake Queue `/intake`
- Complaints `/complaints`
- My Work `/tasks`
- Calendar `/calendar`
- Analytics `/analytics`

**INTELLIGENCE & COORDINATION**
- AI Intelligence `/intelligence`
- Cross-Bureau `/coordination`
- Dependency Explorer `/dependencies`
- Resolution Center `/resolutions`

**GENERAL**
- Bureau Directory `/team`
- Settings `/settings`
- Help `/help`
- Audit & Administration `/admin` (role-gated)

Navigation must actually work. Provide visible active state (green left rail, icon/text emphasis), compact count badge for actionable tasks, correct breadcrumbs/page titles, and a functional global search/command dialog with keyboard shortcut Ctrl/Cmd+K. The exact sidebar can adapt based on roles; unauthorized routes must be protected in real mode, not merely hidden.

## 4. PAGES TO IMPLEMENT — HIGH-FIDELITY AND FUNCTIONAL

### A. Overview dashboard — prioritize first

Use Fernly Dashboard screenshot as composition reference: title + subtitle + primary/secondary actions; 4 KPI cards across; asymmetrical bento grid; elegant chart, reminder/alert panel, Bureau workload list, progress gauge, recent activity and SLA highlights. SYNAPSE KPI labels: **Total Complaints, Resolved Cases, Active Cases, Pending Review**. Make each KPI drill into filtered complaints. Cards below: **Complaint Analytics**, **Upcoming SLA Deadlines**, **Bureau Coordination**, **Resolution Progress**, **Recent Cases**, **AI Findings**. Use truthful demo figures derived from seeded records, not unrelated random numbers. Charts have tooltips, legends, and accessible summaries. Replace Fernly time tracker and mobile ad with meaningful SYNAPSE content while preserving equivalent visual balance and deep-green patterned feature card treatment.

### B. Complaints `/complaints`

High-quality searchable/filterable case registry with case ID, institution, subject, lead Bureau, officer, priority, state, SLA deadline, last update. Tabs and filters; pagination or virtualized rows; row opens detail. Include create/register flow when authorized. Each action persists to demo state and is wired to backend in live mode. Provide empty/loading/error states.

### C. Case detail `/complaints/[id]`

A visually polished operational workspace: header, state/priority/SLA badges, institution details, assigned Bureau/owner, timeline, issue list, evidence/documents with provenance/version metadata, linked cases, work items, AI findings, notes, and authorized actions. Tabs may be used. Explicit approvals, hold/resume, transfer and resolution checks. Respect the PRD state machine. Never equate an AI suggestion with a regulatory decision.

### D. Intake `/intake`

Review unregistered incoming submissions/drafts; search/filter, original text and attachment metadata, extracted fields with confidence and human verification, duplicate/related recommendations, register/associate/reject-with-reason actions. Draft ≠ case. In demo mode, simulate realistic incoming records and record every decision.

### E. My Work `/tasks`

**Visually match Fernly Tasks Kanban**: 4 softly outlined rounded columns, white task cards, status dots and count pills, category badges, priority labels, action menus, progress tracks, due metadata, avatar initials, filters (All/My work/High priority/Due this week), and `New Work Item`. Suggested columns: To Do, In Progress, In Review, Done. Drag/drop and menu-based movement must enforce permissions and legal transitions; keyboard alternative required. Never make dragging a complaint across columns equivalent to legal disposal; this board represents *work items*, not the case lifecycle.

### F. Calendar `/calendar`

Match Fernly calendar's large monthly grid + right rail of today's events and upcoming items. Show SLA deadlines, Bureau reviews, hearings, approvals, and follow-ups. Month navigation, Today button, selectable day, filters, event details; dates derived from demo data and actual date rather than screenshot's hardcoded October 2026 events.

### G. Analytics `/analytics`

Match Fernly Analytics layout: 4 compact KPI cards with sparklines, wide time-series chart, donut breakdown, contribution/activity heatmap, Bureau performance leaderboard. SYNAPSE metrics: resolved volume, overdue cases, on-time disposal, median resolution time, intake trend, distribution by Bureau/category, activity heatmap. Period filters 7D/30D/90D, CSV export of *authorized* visible data, correct calculations and denominators; avoid misleading metrics.

### H. Bureau Directory `/team`

Match Fernly Team's four-column member card grid: avatar, presence only if genuinely available (otherwise omit or mark simulated), role/Bureau, open and completed work items, workload bar, Profile button. Use realistic fictional AICTE Bureau staff. Do not imply cross-Bureau access from this directory; permissions still apply.

### I. AI Intelligence `/intelligence`

Findings inbox with 4 types: duplicate/related case suggestions, **Regulatory Conflict Sentinel**, **Evidence Contradiction Detector**, and case triage insights. Every finding must show type, severity, evidence references, explanation, confidence/uncertainty, rule/model version if available, review state, and human accept/dismiss/escalate controls. For prototype, deterministic explainable fixtures/rules are preferred to fake AI API results. Clearly label simulated findings. Never assert a legal/regulatory conflict without approved policy evidence and human review.

### J. Cross-Bureau `/coordination`

Lead Bureau, participating Bureaus, tasks, approvals, transfers, and access requests. Visible assignment and review histories. Support a realistic multi-Bureau case demo. Unauthorized access denied in real mode.

### K. Dependency Explorer `/dependencies`

React Flow graph of case/work-item relationships, using typed links `RELATED_TO`, `DUPLICATE_OF`, `DEPENDS_ON`, `COORDINATES_WITH`; node selection opens detail panel; filtering, zoom, legend, link provenance. No automatic merging; reject illegal dependency cycles for directed dependency edges.

### L. Resolution Center `/resolutions`

Queue of cases pending closure with a **Resolution Quality Gate**: mandatory evidence, task completion, dependency status, approval authority, audit, exceptions. Show actionable missing requirements. Authorized users can approve/reject/reopen where permitted. Enforce validation in the data/service layer, not just the UI. Human-controlled disposal only.

### M. Settings `/settings`

Mirror Fernly Settings layout: inner vertical tab navigation + white form card, avatar, profile inputs, notification preferences, appearance/accessibility. Functional form validation, save/discard, confirmation/toast. Include a clearly separated role-aware administration area for policy/SLA configuration if in scope.

### N. Help `/help`

Mirror Fernly Help's strong forest-green patterned hero, topic cards, FAQ accordion, shortcuts panel, and support resources. Replace all Fernly copy with SYNAPSE complaint-management help. No fake support SLA or nonfunctional chat button.

### O. Admin `/admin`

Role-restricted user/Bureau management overview, policy versions, audit access, and security state. For prototype, show realistic authorized fixtures and honest labels where actions need server configuration. Do not fabricate actual permissions or government policies.

## 5. DEMO DATA AND INTERACTION CONTRACT

Make the prototype useful immediately even without Supabase credentials:

- Implement a clearly labeled **Demo Mode** with deterministic fictional institutions, Bureaus, officers, cases, submissions, evidence metadata, tasks, findings, audit events, SLA deadlines, and linked cases. No real personal data or real official AICTE determinations.
- Persist demo mutations across refresh using a client-side store/local persistence with a versioned schema and a Reset Demo Data action. Isolate demo persistence from production integration.
- All UI actions must have an effect: search, filters, tabs, menus, dialogs, case creation, assignment, comments, task status, findings review, calendar navigation, settings, CSV export, graph selection, and keyboard shortcuts. No dead CTAs or fake success toasts.
- Provide role-switching **only inside explicitly marked demo mode** to demonstrate Supervisor, Case Officer, Bureau Head, Auditor, and Admin perspectives. Do not confuse this with real authentication.
- Model permissions in demo logic too; show meaningful disabled states with explanation. In real mode, server/DB must independently enforce all permissions.
- Use seeded storylines: a complaint with a potentially related prior case, a case involving two Bureaus, a disputed document claim, a reviewable regulatory conflict alert, and a resolution blocked by a missing mandatory item. The jury should be able to demonstrate all four innovations in one cohesive journey.
- Never generate unsubstantiated real regulations. Use explicitly labeled synthetic policy rules in demo mode.

## 6. SUPABASE REAL-MODE INTEGRATION — NO GUESSWORK

Inspect `.env.example`, actual migrations/schema and available credentials. If credentials/schema are present, implement verified Supabase Auth, server-side role mapping, RLS-compatible queries, private evidence storage, typed data services, audit and workflow functions as supported. Check actual database behavior and tests before claiming completion. If not available, ship a functioning demo-mode application and a clean repository abstraction (`CaseRepository`, `TaskRepository`, `FindingRepository`, etc.) with an explicit integration checklist. **Do not invent real Supabase table names or claim the deployed database has been tested.**

Critical controls: Supabase Auth identity must map securely to internal user; never trust a browser-set `synapse.user_id` or client-selected role for authorization. Validate all transitions and disposal approvals on the server/database. Preserve versioned evidence, audit, idempotency for intake, concurrency handling for approvals, and restricted data visibility. Never embed service-role keys in frontend code. Clearly distinguish demo-only actions from real authorized actions.

## 7. EXECUTION ORDER — START CODING NOW

1. Inspect files and existing repo. Read design.md, screenshot references, PRD, and token/code files. Create a concise task plan in `docs/BUILD_PLAN.md` (do not stop here).
2. Scaffold/configure Next.js + TS, fonts, tokens, globals, icon system, reusable components, app shell and navigation.
3. Implement deterministic typed demo dataset, repository/service layer, state machine/permissions, persistence, and demo-mode indicator.
4. Build **Overview dashboard** with high visual fidelity. Run dev server and compare with screenshot; correct layout, fonts, proportions, radius, spacing, charts, colors and icon sizing.
5. Build **My Work Kanban**, **Calendar**, **Analytics**, **Team**, **Settings**, and **Help** matching their screenshot compositions; wire interactions.
6. Build complaint-specific screens: **Intake**, **Complaints**, **Case Detail**, **Coordination**, **AI Intelligence**, **Dependency Explorer**, **Resolution Center**, and **Admin** in the same visual system.
7. Implement all seeded scenario flows, authorization checks, quality-gate constraints, error/empty/loading states, and data exports.
8. Run lint, typecheck, build, and tests. Add meaningful unit/integration tests for case transitions, role permissions, findings review, dependency cycle rejection, Quality Gate, and demo persistence. Add browser smoke/visual checks if Playwright/browser tooling is available. Fix failures.
9. Update README with exact run commands, demo logins/role switching, environment setup, implemented routes, limitations, and Supabase integration requirements. Write `docs/IMPLEMENTATION_NOTES.md` with deviations and unverified items.
10. Provide a final report of working features, tests actually run, screenshots captured if possible, and remaining gaps. **Continue implementing as much as possible within the session; do not return only a plan or a mockup.**

## 8. ACCEPTANCE CRITERIA

- At least 14 routes listed above are navigable and rendered using one cohesive Fernly-derived visual system.
- Dashboard/Tasks/Calendar/Analytics/Team/Settings/Help are visually recognizable counterparts to their seven screenshots, but contain only SYNAPSE branding and relevant domain content.
- At ~1536×1024, layout shows distinct sidebar/topbar/content panels with balanced whitespace, soft rounded surfaces, correct green palette, matching type, and no overlapping/clipped content.
- All key demo workflows function across pages and persist after refresh. A case's changes are reflected in dashboard metrics, lists, details, and audit timeline.
- The four innovations have visible, explainable, human-reviewed demonstration flows; Quality Gate cannot be bypassed via UI or underlying demo service.
- No fake integrations, exposed secrets, broken routes, console errors, inaccessible dialogs, or fabricated production readiness claims.
- Typecheck, lint, production build and relevant tests pass, or exact failures are documented truthfully.

## 9. IMPORTANT VISUAL QA NOTES

- The extracted design.md is from a live scan at a **1142×698 viewport** and reports incomplete cross-origin assets/styles. It is useful but not a complete source-code export; screenshots are authoritative for full-page composition.
- Generated `components.tsx` is a **starter**, not the Fernly application. Some extracted values (for example an input with `h-0`) are measurement artifacts; fix such defects instead of copying blindly.
- Avoid excessive empty space, tiny unreadable text, unrelated illustrations, and generic AI dashboards. Use a faithful sidebar with active left indicator and carefully tuned card grid.
- Preserve the *design language*, not original trademarks, proprietary images, or product copy. If an exact branded asset is not licensed, create an original SYNAPSE wordmark/icon in a visually compatible style.

**Start by reading the reference files and inspecting the repository, then immediately implement the app shell and Overview page. Continue building through the execution order without waiting for another prompt.**
