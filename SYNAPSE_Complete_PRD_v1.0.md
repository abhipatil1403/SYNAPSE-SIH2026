# SYNAPSE — Complete Product Requirements Document (PRD)

**SIH 2026 · Problem Statement 26264 · AICTE**  
**Version:** 1.0  
**Product:** SYNAPSE — Integrated AICTE Complaint Monitoring, Intelligence & Cross-Bureau Coordination Platform  
**Primary users:** Authorized AICTE personnel  
**Database:** Supabase / PostgreSQL  
**Target:** Functional SIH prototype

> This is a proposed product specification, not an official AICTE operating manual. Actual Bureau authorities, statutory deadlines, retention rules, and regulatory procedures require validation before production use.

## 1. Executive Summary

### 1.1 Problem

Institution-related complaints can span AICTE Bureaus and Cells. Fragmented responsibility, documents, case histories, and follow-up actions make it difficult to monitor complaints and ensure accountable resolution. Conventional dashboards may count pending and resolved complaints but do not necessarily identify related matters, inter-Bureau dependencies, potentially contradictory evidence, overlapping regulatory actions, or unsupported case closure.

### 1.2 Vision

**SYNAPSE transforms fragmented complaint tracking into coordinated, evidence-backed, accountable case resolution.**

### 1.3 Principles

1. One authoritative case record; multiple Bureaus participate through work items.
2. Human authority over AI recommendations and approvals.
3. Security by default: discovery, details, documents, and actions are separately controlled.
4. Evidence-backed findings with traceable sources.
5. Immutable or appropriately protected decision and event history.
6. Configurable, versioned policies instead of hardcoded regulatory assumptions.
7. A working SIH prototype with a maintainable path to production.

### 1.4 Product success

An authorized user can receive a complaint, review its intake draft, register or associate a case, assign responsibility, investigate evidence, coordinate Bureaus, review intelligence findings, validate resolution, and perform authorized disposal with complete auditability.

## 2. Scope

| Capability | SIH target | Later evolution |
|---|---|---|
| Authentication and permissions | Working | Enterprise SSO/federation |
| Complaint intake | Email and manual; draft review | Additional official channels |
| Languages | English, Hindi, Marathi processing | More languages |
| Case management | End-to-end lifecycle | Advanced automation |
| Bureau coordination | Assignments, tasks, approvals, transfers | External integrations |
| Duplicate matching | Explainable human-reviewed suggestions | Large-scale calibrated matching |
| Four innovations | Real demonstrable findings | Expanded rule and model coverage |
| SLA and Quality Gate | Configurable and functional | Official policy hardening |
| Reports | Operational KPIs and exports | Advanced analytics |
| Audit and security | Enforced and tested | Compliance/retention expansion |

**Out of initial scope:** public complaint portal, blockchain, autonomous regulatory determinations, automatic destructive merges, unverified legal conclusions, separate graph database, unnecessary microservices, and claims of live government integrations not actually connected.

## 3. Users and Authorization

| Role | Responsibilities | Boundary |
|---|---|---|
| System Administrator | Accounts, Bureau memberships, configuration | No automatic right to confidential case content |
| Supervisory Authority | Authorized oversight and escalations | Policy-scoped |
| Bureau Head | Bureau workload, assignments, approvals | Bureau/case-scoped |
| Case Officer | Investigations, evidence, work items | Assigned or explicitly accessible cases |
| Intake Officer | Draft review and registration | Intake-scoped |
| Auditor | Authorized histories and audit review | Read-only and scoped |
| System Worker | Email, AI, alerts | Narrow machine permissions; no human approvals |

Multiple roles may be assigned to one user. Authentication and authorization must remain separate.

### 3.1 Identity

- Authenticate protected access, e.g. via Supabase Auth.
- Map authenticated identities securely to internal users.
- Enforce suspension, role revocation, and Bureau membership changes.
- Do not accept client-supplied user IDs, Bureau membership, or role claims as authoritative.
- Keep service credentials out of browsers.
- Attribute significant actions to a human or system principal.
- The previously reviewed database's `synapse.user_id` session setting must only be populated across a verified trusted backend boundary, never controlled by untrusted clients.

### 3.2 Access scopes

1. **Discovery:** sanitized information that a related case exists.
2. **Details:** permitted case content and timeline.
3. **Evidence:** specifically authorized documents and versions.
4. **Action:** explicitly permitted changes, approvals, or operations.

Grants have a purpose, scope, authority, duration, revocation state, and audit record. Search, graph views, exports, notifications, and AI retrieval follow identical restrictions.

### 3.3 Baseline action policy

- Intake Officers: review and confirm authorized drafts.
- Case Officers: investigate assigned cases and propose findings/resolution.
- Bureau Heads: scoped assignments and policy-authorized access/transfer/closure decisions.
- Supervisors: only explicitly delegated cross-Bureau approvals and oversight.
- Admins: configuration and membership administration, not blanket case access.
- Auditors: scoped read-only access.

All privileged operations require server-side and, where applicable, database-side authorization.

## 4. Information Architecture

**Workspace:** Dashboard, Intake Queue, Case Registry, My Tasks, Coordination.  
**Intelligence:** Intelligence Center, Dependency Explorer, Resolution Queue.  
**Insights:** Reports & Analytics, Notifications.  
**Governance:** Administration, Access Requests, Audit Logs, Policies.

Navigation is permission-filtered, but hidden navigation is not a security control.

The **Case Detail** is the central workspace, with tabs:

`Overview | Timeline | Evidence | Work Items | Coordination | Intelligence | Dependencies | SLA | Resolution | Audit`

Global header: page title, authorized Bureau context, search, notifications, user menu. Global search must respect field- and case-level visibility.

## 5. Canonical Domain Definitions

| Term | Definition |
|---|---|
| Institution | Officially identified educational institution |
| Campus | Separate campus/branch when supported by source records |
| Submission | One received complaint communication/intake record |
| Draft | Unconfirmed intake item awaiting human review |
| Case | Canonical registered complaint/regulatory matter |
| Issue/Incident | Underlying matter potentially involving several cases |
| Work Item | Bureau-owned task within a case |
| Lead Bureau | One Bureau accountable for case coordination |
| Participating Bureau | Bureau with assigned work or approved involvement |
| Case Relationship | Typed, proposed or confirmed link between cases |
| Evidence | Source material with provenance and version history |
| Claim | Specific statement attributed to a source |
| Finding | AI/rule-generated observation with human-review state |
| SLA Instance | Deadline obligation tied to a policy version |
| Disposition | Authorized outcome for a case review cycle |

**Invariants:** Same institution ≠ same complaint; related ≠ duplicate; duplicate ≠ deletion; case status ≠ individual work-item status.

## 6. Complaint Lifecycle

1. Receive via email, manual entry, or approved future connector.
2. Preserve original submission, attachments, identifiers, and timestamps.
3. Process language, extraction, translation, and candidate matches.
4. Human reviews draft and proposed association.
5. Register a new case or associate the submission with an existing case.
6. Assign lead Bureau, accountable officer, work items, and SLA.
7. Investigate, collect evidence, coordinate Bureaus, record actions.
8. Generate and review AI/rule findings and dependencies.
9. Evaluate current Resolution Quality Gate.
10. Authorize disposition; retain history and support controlled reopening.

### 6.1 States

Canonical proposal: `REGISTERED → TRIAGED → ASSIGNED → IN_PROGRESS → RESOLUTION_REVIEW → DISPOSED`.

Controlled additional states: `ON_HOLD`, `REOPENED`. Drafts are not registered cases. Hold does not automatically pause an SLA. Reopening starts a tracked new review cycle while preserving earlier dispositions.

### 6.2 Transition requirements

| Transition | Preconditions |
|---|---|
| Draft → Registered | Human confirms intake |
| Registered → Triaged | Required classification validated |
| Triaged → Assigned | Lead Bureau and accountable officer set |
| Assigned → In Progress | Authorized work begins |
| In Progress → Resolution Review | Required investigation tasks addressed or accounted for |
| Resolution Review → Disposed | Current valid Quality Gate and authorized approval |
| Disposed → Reopened | Authorized reason and new review cycle |
| Allowed state → On Hold | Authorized reason and recorded event |
| On Hold → Allowed state | Authorized resumption and history |

No arbitrary frontend update to controlled status fields. Validate permissions, expected state, and business rules in a transaction.

## 7. Command Center

**Purpose:** Role-specific workload, deadlines, alerts, and operational performance.

**Components:** total authorized cases; status breakdown; overdue and approaching-SLA cases; unassigned cases; pending transfers/access requests; unreviewed AI findings; blocked dependencies; pending Quality Gate evaluations; Bureau workload and trends.

**Filters:** Bureau, institution, category, priority, dates, status, assigned officer—subject to authorization.

**Acceptance:** KPI formulas are documented, counts reconcile to authorized underlying records, multiple SLA instances do not double-count cases, drilldowns respect access, and empty/loading/error states work. Use UTC storage with consistent localized display.

## 8. Intake and Draft Review

### 8.1 Email capture

Preserve source mailbox/integration, provider message ID, sender/recipients, subject, received timestamp, original body, language, attachments and secured references, fingerprint, processing attempts, and associated draft/submission/case IDs.

### 8.2 Idempotency

Repeated delivery of the *same source message* does not create another logical draft. Distinct similar messages remain separate submissions and can be proposed for association. Retries must not duplicate attachments, translations, or registrations.

### 8.3 Review UI

Show original and translated text, extracted institution, category, priority, duplicate candidates, AI confidence/limitations, attachments, and warnings.

**Actions:** confirm new case, associate existing case, correct extraction, request information, reject/non-actionable with reason, save draft.

Human corrections remain distinguishable from original AI output.

### 8.4 Edge cases

- Duplicate delivery: idempotent record.
- Similar but distinct complaint: preserve separate submission.
- Unidentified institution: review, never invent an institution.
- Multiple institutions/issues: allow reviewer-directed split/association under policy.
- Unsupported/malicious attachment: preserve safe metadata, quarantine unsafe files.
- Translation failure: original remains reviewable.
- Concurrent confirmations: only one winning registration/association transaction.

**Acceptance:** Hindi/Marathi email is preserved, processed, and human-confirmed before registration.

## 9. Case Registry, Detail, and Evidence

### 9.1 Registry

Paginated, searchable, sortable authorized cases showing case number, permitted subject, institution, lead Bureau, status, priority, officer, received date, SLA indicator, and last activity. Discovery-only results are sanitized.

### 9.2 Detail

Overview shows identity, institution, classification, ownership, status, priority, SLA, and permitted description. Timeline displays chronological registration, assignment, evidence, transfer, finding review, approval, and disposition events with actors and timestamps, without leaking restricted data.

### 9.3 Editing

Allow only permitted fields. Use optimistic concurrency. Status, lead Bureau, officer, disposal, and approvals require dedicated workflow operations, not generic updates.

### 9.4 Evidence

Support upload, authorized preview/download, metadata, classification, source provenance, hash, version history, and access controls. Files remain in private storage. Issue short-lived signed URLs only after authorization.

## 10. Cross-Bureau Coordination

- Exactly one active lead Bureau and accountable officer per case.
- Participating Bureaus work through independently assigned work items.
- Workspace shows assignments, task progress, discussions, access requests, transfers, dependencies, and authorized actions.
- Access requests specify purpose, scope, and duration; designated authority approves/rejects and audit records are preserved.
- A DETAILS grant does not automatically confer DOCUMENTS access.
- Transfers follow request → authorized decision → atomic ownership update → history → notification.
- Transfers never silently reset SLA obligations.
- A failed transfer transaction must not leave two current owners or mismatched approval state.

## 11. Intelligence Center

Every finding includes ID, type, cases, permitted evidence references, explanation, model/rule version, generation time, confidence/severity where meaningful, review state, reviewer, decision, and resulting action links.

**Lifecycle:** `GENERATED → PENDING_REVIEW → CONFIRMED / REJECTED / NEEDS_INFORMATION`, with later `SUPERSEDED`/`RESOLVED` where appropriate.

AI can extract, classify, translate, summarize, suggest relationships, and flag concerns. It cannot autonomously grant access, transfer ownership, merge cases, approve regulatory actions, or dispose cases. Uncalibrated scores must not be presented as validated probabilities.

## 12. Innovation I — Regulatory Conflict Sentinel

**Goal:** Flag potentially incompatible or overlapping regulatory actions requiring coordination.

**Inputs:** action type, institution/campus, underlying issue, Bureau, schedule, status, approved rule/policy version, and evidence.

**Process:** retrieve scoped candidates → evaluate approved rules → generate evidence-backed finding → human review → optional coordination task.

**UI:** alerts, severity, involved actions, timeline, triggering rule, evidence, review and coordination actions.

**Acceptance:** sharing an institution alone never constitutes conflict; alerts cite a rule and actions; reviewers can confirm/dismiss/request investigation. Advisory AI alerts do not automatically block operations, though independent mandatory policy controls remain enforceable.

## 13. Innovation II — Evidence Contradiction Detector

**Goal:** Flag potentially inconsistent factual claims within matching context.

**Inputs:** versioned evidence, extracted claims, source passages, dates, entities, and extraction metadata.

**Process:** extract → normalize entities/dates/units/context → compare → classify potential contradiction/contextual difference/insufficient information → human review.

**UI:** side-by-side sources, highlighted passages, context, version, explanation, confidence where appropriate, review actions.

**Acceptance:** exact evidence versions and source locations cited; different campuses/dates do not automatically count as contradictions; system does not determine which source is truthful; reviewers may confirm/reject/mark inconclusive; later evidence triggers reevaluation without deleting history.

## 14. Innovation III — Dependency Graph

**Goal:** Expose case relationships, operational blockers, and downstream impact.

| Relationship | Semantics |
|---|---|
| `RELATED_TO` | Shared relevant issue/context |
| `DUPLICATE_OF` | Human-confirmed substantially same complaint under criteria |
| `DEPENDS_ON` | Defined decision/progress relies on another case/action |
| `COORDINATES_WITH` | Collaboration needed without necessarily blocking |

Store type, direction where applicable, status, creator, reviewer, rationale/evidence, and history. Graph supports permission-filtered expansion, edge filtering, blocker visualization, impact, and access requests for discovery-only nodes.

Prevent invalid dependency cycles including concurrent insertions. AI-suggested edges must look different from confirmed edges.

**Acceptance:** confirmed changes update graph/impact, invalid cycles fail, and restricted node details remain protected.

## 15. Innovation IV — Resolution Quality Gate

**Goal:** Prevent premature or unsupported case disposal.

Evaluate applicable requirements: investigation tasks, mandatory evidence, Bureau contributions/approvals, dependencies, communications, exceptions, and final authority.

| Outcome | Meaning |
|---|---|
| PASS | Mandatory requirements met; case eligible for authorized disposal |
| WARNING | Advisory issues need review |
| BLOCKED | Mandatory requirement unmet; ordinary disposal prohibited |

UI displays checklist, policy version, evidence, missing items, evaluation timestamp, reviewer, approved exceptions, and approval.

Disposal must recheck current case state, current evaluation validity, checklist version, material evidence changes, dependencies, approvals, and actor authority transactionally. Stale evaluations require rerun. Direct status updates cannot bypass the gate. Overrides only where policy explicitly permits, with authorized approval and audit.

## 16. SLA, Escalation, and Resolution Operations

Version SLA policies by case type, priority, Bureau, event, calendar, and effective date. Each SLA instance records policy version, start, original/current deadlines, status, and completion.

**Lifecycle:** `NOT_STARTED → RUNNING ↔ PAUSED → COMPLETED`, with overdue condition while running.

- Transfers preserve SLA unless policy-authorized adjustment.
- Hold pauses SLA only under approved rules.
- Holidays use configured business calendars.
- Reopening follows versioned reopening policy.
- Policy updates do not silently rewrite existing instances.
- Manual deadline adjustment requires authority, reason, and audit.
- Case-level and work-item SLAs remain distinct.
- Scheduled escalation notifications are idempotent and recoverable.

Do not invent official AICTE deadlines; demo values must be labeled examples.

## 17. Multilingual Processing

Initial complaint-processing languages: English, Hindi, Marathi. Preserve originals; translations are versioned derivatives. Store detection, source/target language, provider/model version, time, and reviewer corrections. UI switches between original and translated content.

Search/matching may use multilingual embeddings or a common translation, but similarity is never automatic duplication. Handle code-mixing, transliteration, misspellings, scanned documents, ambiguous names, and processing failure.

**Acceptance:** a Marathi and English complaint can be recommended as related while preserving original submissions and human authority.

## 18. Reports and Analytics

Reports cover status, category, Bureau, institution, overdue workload, assignment/disposal time, reopenings, participation, confirmed relationships, AI review outcomes, Quality Gate results, and SLA compliance.

Every metric defines count unit and time basis. Work items are not cases; reopened cases require historical event-aware treatment. Exports (CSV/PDF as implemented) are permission-filtered, audited, and restricted by field/row policy. Historical reports use event history or governed snapshots, not only current mutable status.

## 19. Administration and Governance

Capabilities: accounts, roles, memberships, case categories, transitions, access approval rules, SLA/escalation versions, Quality Gate checklists, verified regulatory sources, conflict rules, intake sources, integration health, audit review.

Published policy versions must not be silently changed retroactively. Significant changes create new versions with effective dates and approval records. Prototype sample rules are distinguishable from official rules.

Audit actor, action, target, timestamp, correlation ID, and safe change context. Avoid logging secrets or complete confidential document bodies. Retention and legal holds require verified policy before production.

## 20. Notifications and Collaboration

Notify on assignments, access/transfer requests and decisions, deadlines, escalations, findings, dependencies, and closure approvals. Track event, recipient, delivery state, retries, and deduplication key. Do not leak restricted case content in notification previews. Case discussions are permission-scoped and do not replace formal approval records.

## 21. UI/UX Specification

**Direction:** restrained, accessible, light-theme professional administrative interface; readable data-dense tables; consistent navigation; AI suggestions visibly distinguished from confirmed decisions; no decorative animation that impedes work.

| Screen | Elements | Primary action |
|---|---|---|
| Login | Auth, errors | Authenticate |
| Dashboard | KPIs, alerts, filters | Navigate urgent work |
| Intake Queue | Drafts, original/translated text, suggestions | Confirm/reject |
| Case Registry | Search, filter, sort, pagination | Open case |
| Case Detail | Tabs, evidence, history, actions | Investigate |
| My Tasks | Assignments, due dates | Update task |
| Coordination | Bureaus, transfers, access, discussions | Collaborate |
| Intelligence Center | Findings, sources, review | Review |
| Dependency Explorer | Graph, blockers | Explore dependencies |
| Resolution Queue | Checklists, approvals | Evaluate/dispose |
| Reports | Charts, filters, exports | Analyze |
| Administration | Users, policies, logs | Govern |

Every screen handles loading, empty, forbidden, error, stale, and partial-processing states. Consequential actions require appropriate confirmation and reason capture. Long-running jobs show queued/running/completed/failed states. Revoke protected access promptly across polling/caches. Target WCAG 2.2 AA.

## 22. Recommended Technical Architecture

| Layer | Recommendation |
|---|---|
| Frontend | React + TypeScript |
| Framework | Next.js or Vite React |
| Authentication | Supabase Auth + trusted internal identity mapping |
| Backend | TypeScript service/API layer |
| Database | Existing Supabase PostgreSQL |
| Storage | Private Supabase Storage |
| AI | Backend-controlled model services + deterministic rules |
| Jobs | Worker/queue with retries and idempotency |
| Search | PostgreSQL full-text; optional pgvector |
| Graph | PostgreSQL relationships/recursive queries |
| Monitoring | Structured logs, errors, job health |

**Boundaries:** frontend handles UI; backend validates/authorizes/orchestrates; PostgreSQL enforces integrity and critical transactions; workers process intake, AI, alerts, and SLA jobs. AI workers cannot perform human-only decisions.

## 23. Backend API Contracts

These are logical operations, not claims about already deployed endpoints.

| Operation | Example endpoint | Contract |
|---|---|---|
| Identity | `GET /api/me` | User, roles, permitted Bureau contexts |
| Draft list | `GET /api/intake/drafts` | Authorized drafts |
| Draft confirmation | `POST /api/intake/drafts/{id}/confirm` | Atomic registration/association |
| Case list | `GET /api/cases` | Authorized paginated/filterable results |
| Case detail | `GET /api/cases/{id}` | Permission-filtered detail |
| Transition | `POST /api/cases/{id}/transitions` | Controlled state change |
| Work item | `POST /api/cases/{id}/work-items` | Authorized Bureau task |
| Transfer request | `POST /api/cases/{id}/transfers` | Request |
| Transfer decision | `POST /api/transfers/{id}/decision` | Authorized approval/rejection |
| Access request | `POST /api/access-requests` | Scoped request |
| Evidence | `POST /api/cases/{id}/evidence` | Authorized upload workflow |
| Relationship decision | `POST /api/relationships/{id}/decision` | Confirm/reject |
| Findings | `GET /api/cases/{id}/findings` | Authorized findings |
| Finding review | `POST /api/findings/{id}/review` | Human review |
| Graph | `GET /api/cases/{id}/graph` | Permission-filtered graph |
| Quality Gate | `POST /api/cases/{id}/resolution/evaluate` | Evaluate current requirements |
| Disposal | `POST /api/cases/{id}/dispose` | Transactionally enforced closure |
| Reports | `GET /api/reports/...` | Scoped analytics |

**API standards:** validated payloads, idempotency keys for retryable commands, optimistic concurrency, server-side authorization, safe errors, pagination, rate limits, and correlation IDs.

**Error categories:** unauthenticated, forbidden, not found, validation, stale version, state conflict, rate-limited, background job failure, service unavailable. Avoid disclosing restricted details in errors.

## 24. Existing Supabase Schema Integration

The previously reviewed corrective package includes five ordered migrations, ERD, dictionary, security docs, and tests. **Use the actual deployed schema; do not invent table names or assume functions are live.**

Verify actual schemas, keys, indexes, constraints, functions, grants, RLS, Auth mapping, storage policies, migration history, and seed data. Tables visible in Supabase are not proof that workflows or permissions pass tests.

**Ownership:** database teammate—migrations, RLS, constraints, workflow functions; backend—authenticated APIs and orchestration; AI—models/rules/findings/evaluation; frontend—screens and integration.

All changes use version-controlled migrations. Avoid undocumented Supabase dashboard schema edits; use reviewed compatibility changes for breaking updates.

## 25. AI Engineering

| Task | Approach | Human involvement |
|---|---|---|
| Language detection | Classifier/model | Review uncertain |
| Translation | Approved model/service | Verify consequential content |
| Institution extraction | Extraction + deterministic validation | Confirm ambiguity |
| Classification | Model/rules | Confirm intake |
| Duplicate matching | Candidate retrieval + semantic comparison | Confirm relationship |
| Conflict | Approved rules + explanation | Review alert |
| Contradiction | Claim extraction/contextual comparison | Verify |
| Dependency | Rules/contextual suggestion | Confirm edge |
| Quality Gate | Deterministic checklist | Authorized disposal |

**Duplicate pipeline:** preprocessing → institution candidate matching → candidate retrieval → semantic comparison → evidence-backed explanation → human decision. Delivery deduplication and semantic duplicate detection are separate.

AI outputs use validated structured schemas with source references and model/rule version. Emails/documents are untrusted and may contain prompt injection. Limit tools, retrieval, data exposure, and privileges. Do not transmit classified documents to unapproved external models. Core manual workflows must remain available when AI fails.

**Evaluation:** labeled examples for true duplicates, related-but-distinct, unrelated same-institution complaints, contextual contradictions, false conflicts, and dependency decisions. Report measured precision/recall where appropriate, false positives, latency, and correction rates. No unsupported accuracy/cost claims.

## 26. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Security | API + DB enforcement, least privilege |
| Privacy | Encryption, approved AI data handling |
| Reliability | Retries and idempotency |
| Integrity | Transactional consequential changes |
| Performance | Common list/dashboard operations target p95 <2s under agreed test load |
| Scalability | Pagination, indexes, bounded graph traversal |
| Accessibility | Target WCAG 2.2 AA |
| Audit | Traceable events and decisions |
| Maintainability | Typed APIs, tests, migrations, docs |
| Recovery | Tested backup/restore and job recovery |
| Observability | Structured logs, correlation, alerts |

Test with realistic dataset sizes and concurrent operations. Simultaneous approvals/transfers, duplicate delivery, and parallel graph edits must produce valid final database states. Verify Supabase plan-specific backup capabilities rather than assuming them.

## 27. Security Threat Model

| Threat | Mitigation |
|---|---|
| Unauthorized case access | Scoped API auth + RLS |
| Cross-Bureau leakage | Discovery/detail/document separation |
| Identity spoofing | Trusted Auth-to-user mapping |
| Service key exposure | Server-only secrets |
| SQL injection | Parameterized queries |
| Malicious files | Validation, quarantine/scanning where available |
| Prompt injection | Treat content as untrusted; restricted AI tools |
| Unauthorized disposal | Transactional Quality Gate |
| Approval bypass | Check recorded approver authority |
| Race conditions | Locks/transactions/concurrency checks |
| Audit tampering | Restricted append-only event path |
| Export leakage | Scoped export and audit |
| External AI exposure | Provider approval and data minimization |
| Worker failure | Retry limits, dead-letter visibility |

Critical authorization bypasses are release blockers.

## 28. Testing and Acceptance

**Levels:** database integrity/RLS; unit rules; API authorization and idempotency; AI labeled evaluations; integration; UI; end-to-end; security; failure recovery.

| ID | Scenario | Pass condition |
|---|---|---|
| T01 | New complaint | Draft confirmation creates exactly one case |
| T02 | Repeated delivery | No duplicate draft/case |
| T03 | Similar distinct complaint | Preserved as separate unless human-linked |
| T04 | Multilingual intake | Original and translation retained |
| T05 | Cross-Bureau work | One case, separate Bureau work items |
| T06 | Unauthorized access | UI/API/search/export protect case details |
| T07 | Document isolation | DETAILS does not imply DOCUMENTS |
| T08 | Transfer | Atomic owner and history change |
| T09 | Duplicate AI | No automatic merge/closure |
| T10 | Conflict Sentinel | Rule- and evidence-backed review |
| T11 | Contradiction | Exact version/source references and context |
| T12 | Dependency | Graph updates; cycles rejected |
| T13 | SLA | Pause/transfer/calendar/reopen follow versioned rules |
| T14 | Blocked closure | Missing mandatory item prevents disposal |
| T15 | Valid closure | Current passing evaluation + authority required |
| T16 | Reopening | Previous disposition retained; new cycle |
| T17 | Concurrency | No corrupt final state |
| T18 | AI outage | Manual workflows continue |
| T19 | Audit | Correct actors, timestamps, references |
| T20 | Role revocation | Access removed across reads/actions |

Each protected operation also requires negative authorization tests.

## 29. Demo Dataset and Jury Flow

Use **fictional** institutions, officers, and documents; label demo policy rules as simulated.

Scenarios: (A) two independent complaints at one institution; (B) cross-Bureau related complaints; (C) duplicate email; (D) contradictory claims; (E) overlapping regulatory actions; (F) blocked dependent case; (G) missing closure document; (H) valid disposal.

**Suggested 6–8 minute demonstration:**

| Time | Demo |
|---|---|
| 0:00–1:00 | Dashboard overview |
| 1:00–2:00 | Multilingual intake + human confirmation |
| 2:00–3:00 | Case Detail + Bureau coordination |
| 3:00–4:00 | Duplicate recommendation + dependency graph |
| 4:00–5:30 | Conflict + contradiction findings |
| 5:30–6:30 | Quality Gate + disposal |
| 6:30–8:00 | Audit, accountability, differentiation |

Have a shorter version and clearly labeled precomputed AI fallback if external model access fails.

## 30. Roadmap and Ownership

| Phase | Deliverable | Exit condition |
|---|---|---|
| 0 Foundation | Migrations, Auth, RLS, storage | Restricted-role tests pass |
| 1 Backend | Intake/case/work-item/evidence/transfer APIs | Integration tests pass |
| 2 Frontend | Login/dashboard/registry/intake/detail | Live data and transitions |
| 3 Coordination | Tasks/access/transfer | Multi-role flow passes |
| 4 AI | Language/translation/duplicate | Reviewed findings persisted |
| 5 Innovations | Sentinel, contradiction, graph, gate | Four end-to-end demos |
| 6 Operations | SLA, notifications, reports, audit | Operational tests pass |
| 7 Hardening | Security, concurrency, performance, recovery | Release gates pass |

Parallel work is possible once schema mappings and typed API contracts are stable. Mocks must not remain embedded in demo-critical production-facing flows.

**Dependencies:** Intake requires Auth/submissions/registration; coordination requires cases/users/memberships/work items; AI matching requires institutions/submissions/cases; conflict requires actions/rules; contradiction requires evidence versions/claims; graph requires confirmed relationships; Quality Gate requires lifecycle/checklists/evidence/approvals; reporting requires event history and authorized queries.

## 31. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase schema/PRD mismatch | Critical | Feature-to-schema mapping |
| RLS/function bypass | Critical | Restricted-role security tests |
| Unverified official rules | High | Versioned demo policies, label assumptions |
| Scope overload | High | P0/P1 gates and fixed demo |
| AI false positives | High | Sources + human review + evaluation |
| Ownership ambiguity | High | Single lead, separate work items |
| Stale closure gate | High | Transactional revalidation |
| Duplicate/failed intake | High | Idempotency and recovery |
| Evidence leakage | Critical | Private storage, scoped access |
| Breaking schema edits | High | Versioned migrations and API contracts |
| Slow graph/report | Medium | Indexes and bounded queries |
| Provider outage | Medium | Graceful fallback |
| Legacy project naming | Low | Standardize SYNAPSE |

## 32. Baseline Decisions

- Product name: **SYNAPSE**.
- Primary product: internal AICTE officer dashboard.
- Database: existing Supabase PostgreSQL; graph PostgreSQL-first.
- Frontend: React + TypeScript; initial UI English.
- Complaint processing: English, Hindi, Marathi.
- One canonical case; one lead Bureau; multiple participating work items.
- Human-reviewed email drafts and case registration.
- AI suggestions only; no destructive automatic merges or human-only approvals.
- Conflict Sentinel advisory; contradiction claim-level/source-backed.
- Dependency edges typed and human-confirmed.
- Quality Gate enforces controlled disposition.
- SLA/checklists/rules versioned; access case/document scoped.
- SIH target: working prototype with production-capable design.

Official authority and policy assumptions require later validation.

## 33. Release Readiness Checklist

- [ ] Deployed migrations and constraints verified.
- [ ] Auth-to-internal-user mapping secured.
- [ ] RLS and privileged database functions tested.
- [ ] Core complaint lifecycle passes end to end.
- [ ] Cross-Bureau permissions/transfers verified.
- [ ] Multilingual intake and duplicate handling tested.
- [ ] All four innovations demonstrated on persisted data.
- [ ] Quality Gate cannot be bypassed.
- [ ] SLA and audit histories verified.
- [ ] Critical security tests pass.
- [ ] Demo-critical frontend uses live backend data.
- [ ] Demo reproducible without manual DB edits.
- [ ] Recovery, backup, and deployment documented.
- [ ] Known limitations and unverified policies disclosed.

## 34. Definition of Done

A feature is complete only when UI works, backend validates and authorizes, database integrity is enforced, audit is recorded, errors/concurrency are handled, restricted users cannot bypass, automated tests cover normal and failure paths, docs/contracts match, realistic data works, and the acceptance criteria pass.

## 35. Architectural Positioning and Next Contract

SYNAPSE is three connected systems:

1. **System of Record:** submissions, cases, institutions, evidence, ownership, decisions, history.
2. **System of Coordination:** Bureaus, work items, transfers, approvals, dependencies, regulatory actions.
3. **System of Verified Resolution:** evidence-backed intelligence, human review, SLAs, and Quality Gate.

**Differentiator:** not only knowing a complaint exists, but understanding its relationships, coordinating its investigation, and establishing why its resolution is justified.

**Next engineering artifact:** a PRD-to-database-to-API traceability matrix mapping every requirement to the verified Supabase table/function, responsible service, authorization rule, and acceptance test. This is necessary to detect integration gaps before implementation.

---

*End of SYNAPSE PRD v1.0.*
