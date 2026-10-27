"use client";
import {ActionForm} from "./feedback";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CircleHelp,
  Eye,
  FolderKanban,
  Layers,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "./symbols";
import { officers, bureaus, createSeed } from "@/lib/seed";
import type { Settings } from "@/lib/types";
import { useDemo } from "./provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Forbidden,
  Modal,
  PageHeader,
  Tabs,
  csv,
  date,
  downloadText,
} from "./ui";

export function Team() {
  const { tasks, cases } = useDemo();
  const [query, setQuery] = useState("");
  const [bureau, setBureau] = useState("All Bureaus");
  const [profile, setProfile] = useState<string | null>(null);
  const p = officers.find((o) => o.id === profile);
  const filtered = officers.filter(
    (o) =>
      (bureau === "All Bureaus" || o.bureau === bureau) &&
      `${o.name} ${o.bureau} ${o.role}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Bureau Directory"
        subtitle="The people behind every step forward."
      >
        <Badge tone="green">{officers.length} fictional colleagues</Badge>
      </PageHeader>
      <div className="toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            aria-label="Search directory"
            placeholder="Search people or Bureaus…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Directory Bureau"
          value={bureau}
          onChange={(e) => setBureau(e.target.value)}
        >
          {["All Bureaus", ...bureaus].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="directory-grid">
        {filtered.map((o) => {
          const work = tasks.filter((t) => t.assignee === o.id);
          const open = work.filter((t) => t.status !== "Done").length;
          const done = work.length - open;
          return (
            <Card className="member-card" key={o.id}>
              <Avatar id={o.id} />
              <h2>{o.name}</h2>
              <p>{o.role}</p>
              <Badge tone="green">{o.bureau} Bureau</Badge>
              <div className="member-stats">
                <div>
                  <strong>{open}</strong>
                  <span>Open work items</span>
                </div>
                <div>
                  <strong>{done}</strong>
                  <span>Completed</span>
                </div>
              </div>
              <div className="workload-track">
                <span
                  style={{
                    width: `${work.length ? (done / work.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="fine-print">
                Work completed ·{" "}
                {work.length ? Math.round((done / work.length) * 100) : 0}% in
                your scope
              </p>
              <Button className="full" onClick={() => setProfile(o.id)}>
                View Profile <ArrowUpRight size={13} />
              </Button>
            </Card>
          );
        })}
      </div>
      {!filtered.length && <Empty title="No matching colleagues" />}
      <p className="fine-print" style={{ marginTop: 20 }}>
        Fictional directory. Presence is not tracked. Work counts include only
        records visible to your current perspective; membership never grants
        case or document access.
      </p>
      {p && (
        <Modal title="Colleague profile" onClose={() => setProfile(null)}>
          <div className="profile-row">
            <Avatar id={p.id} />
            <div>
              <h2>{p.name}</h2>
              <p>
                {p.role} · {p.bureau} Bureau
              </p>
            </div>
          </div>
          <Badge tone="green">Fictional staff profile</Badge>
          <h3 style={{ margin: "25px 0 10px" }}>Authorized assigned cases</h3>
          {cases
            .filter((c) => c.officer === p.id)
            .map((c) => (
              <Link
                href={`/complaints/${c.id}`}
                className="recent-row"
                key={c.id}
                onClick={() => setProfile(null)}
              >
                <span className="case-icon">
                  <FolderKanban size={15} />
                </span>
                <div>
                  <strong>{c.subject}</strong>
                  <p>{c.id}</p>
                </div>
                <ArrowUpRight size={14} />
              </Link>
            ))}
          {!cases.some((c) => c.officer === p.id) && (
            <p className="description">
              No case assignments visible in your scope.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

export function SettingsPage() {
  const { state, actor, run, reset } = useDemo();
  const [tab, setTab] = useState("My Profile");
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(
      { type: "settings", settings: draft },
      "Profile and preferences saved to this browser",
    );
  }
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Make this workspace feel a little more like yours."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {[
            ["My Profile", UserRound],
            ["Notifications", Bell],
            ["Appearance", Eye],
            ["Workspace", Layers],
          ].map(([label, Icon]) => (
            <button
              key={label as string}
              className={tab === label ? "active" : ""}
              onClick={() => setTab(label as string)}
            >
              {typeof Icon !== "string" && <Icon size={17} />} {label as string}
            </button>
          ))}
        </nav>
        <Card className="settings-form">
          <ActionForm onSubmit={submit}>
            <h2>{tab}</h2>
            <p className="section-description">
              {tab === "My Profile"
                ? "Your demo profile, kept locally in this browser."
                : tab === "Notifications"
                  ? "Choose what this demo workspace highlights for you."
                  : tab === "Appearance"
                    ? "Thoughtful defaults for focus and accessibility."
                    : "Manage the fictional demonstration workspace."}
            </p>
            {tab === "My Profile" && (
              <>
                <div className="profile-row">
                  <Avatar name={draft.name} />
                  <div>
                    <strong>{actor.name}</strong>
                    <p className="fine-print">
                      Simulated identity · {actor.role}
                      <br />
                      Profile preferences do not change authorization.
                    </p>
                  </div>
                </div>
                <div className="form-stack">
                  <div className="form-grid">
                    <label>
                      Display name
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Email address
                      <input
                        required
                        type="email"
                        value={draft.email}
                        onChange={(e) =>
                          setDraft({ ...draft, email: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      Demo role
                      <input value={actor.role} disabled />
                    </label>
                    <label>
                      Bureau context
                      <input value={actor.bureau} disabled />
                    </label>
                  </div>
                  <p className="fine-print">
                    No email is sent. Actual identity and roles must be managed
                    through verified Supabase Auth and internal membership
                    records.
                  </p>
                </div>
              </>
            )}
            {tab === "Notifications" && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.deadlines}
                    onChange={(e) =>
                      setDraft({ ...draft, deadlines: e.target.checked })
                    }
                  />
                  <span>
                    Highlight approaching deadlines
                    <small>
                      Controls deadline notifications in the local demo.
                    </small>
                  </span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.digest}
                    onChange={(e) =>
                      setDraft({ ...draft, digest: e.target.checked })
                    }
                  />
                  <span>
                    Show activity digest
                    <small>
                      Controls activity summaries in the local demo. No external
                      delivery.
                    </small>
                  </span>
                </label>
              </>
            )}
            {tab === "Appearance" && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.compact}
                    onChange={(e) =>
                      setDraft({ ...draft, compact: e.target.checked })
                    }
                  />
                  <span>
                    Compact tables
                    <small>
                      Reduce table row spacing for a denser workspace.
                    </small>
                  </span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.reducedMotion}
                    onChange={(e) =>
                      setDraft({ ...draft, reducedMotion: e.target.checked })
                    }
                  />
                  <span>
                    Reduce motion
                    <small>
                      Disable transitions and loading animations. System
                      preferences are also honored.
                    </small>
                  </span>
                </label>
                <div className="notice" style={{ marginTop: 20 }}>
                  <Eye size={18} />
                  <p>
                    Forest-green light theme. Keyboard focus, readable labels,
                    and a responsive drawer remain available at all sizes.
                  </p>
                </div>
              </>
            )}
            {tab === "Workspace" && (
              <>
                <div className="status-list">
                  <div>
                    <span>Application mode</span>
                    <Badge tone="green">Local Demo</Badge>
                  </div>
                  <div>
                    <span>Persistence version</span>
                    <span>
                      v{state.schemaVersion} · Revision {state.revision}
                    </span>
                  </div>
                  <div>
                    <span>Dataset initialized</span>
                    <span>
                      {date(state.seedDate, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div>
                    <span>Supabase project</span>
                    <span>SYNAPSE · Adi · inspected</span>
                  </div>
                  <div>
                    <span>Live workflows</span>
                    <Badge tone="amber">Integration blocked</Badge>
                  </div>
                </div>
                <p className="description">
                  Live mode remains disabled while Auth mapping, scoped grants,
                  evidence storage and workflow security are unverified. This
                  demo never writes to the deployed database.
                </p>
                <Button kind="danger" onClick={() => setConfirm(true)}>
                  <RotateCcw size={14} />
                  Reset Demo Data
                </Button>
              </>
            )}
            {tab !== "Workspace" && (
              <div className="settings-actions">
                <Button
                  disabled={!dirty}
                  onClick={() => setDraft({ ...state.settings })}
                >
                  Discard Changes
                </Button>
                <Button kind="primary" type="submit" disabled={!dirty}>
                  Save Changes
                </Button>
              </div>
            )}
          </ActionForm>
        </Card>
      </div>
      {confirm && (
        <Modal
          title="Reset the demo workspace"
          onClose={() => setConfirm(false)}
        >
          <p className="dialog-description">
            This replaces local fictional cases, work, notes, evidence, and
            review decisions with the original seed. Nothing in Supabase is
            changed.
          </p>
          <div className="dialog-actions">
            <Button onClick={() => setConfirm(false)}>Keep My Changes</Button>
            <Button
              kind="danger"
              onClick={() => {
                reset();
                setDraft(createSeed().settings);
                setConfirm(false);
              }}
            >
              Reset Demo Data
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

const faqs = [
  {
    q: "How does a complaint become a registered case?",
    a: "Intake Officers and Supervisors review the preserved original submission, compare the precomputed translation, verify the extracted institution, then register or associate it with a reason. Repeating a registration command never creates another case. Drafts are not cases.",
    topic: "Getting Started",
  },
  {
    q: "Can AI merge cases or make regulatory decisions?",
    a: "No. Findings are simulated advisory examples with source references and rule versions. A human confirms or dismisses them with a reason. Related cases stay separate; confirming a relationship in Dependency Explorer does not dispose or merge either record.",
    topic: "AI & Evidence",
  },
  {
    q: "What blocks a case from being disposed?",
    a: "The Quality Gate checks completed work items, a mandatory investigation report, participating Bureau approval, resolved dependencies, final communication, and resolution-review state. A scoped Bureau Head or Supervisor must approve. Any workspace change invalidates the earlier evaluation.",
    topic: "Resolution & Quality",
  },
  {
    q: "How do I demonstrate the four innovations?",
    a: "Start in AI Intelligence to review the synthetic Conflict Sentinel and source-level faculty-count contradiction. Explore the confirmed case graph and try a cycle to see rejection. In Resolution Center, compare the blocked mandatory-report case with the fee-refund case that passes all checks.",
    topic: "Getting Started",
  },
  {
    q: "Does placing a case on hold pause its SLA?",
    a: "No. The demonstration retains the original deadline across holds and transfers. Official pause rules and business calendars require approved, versioned policies before live use. Every displayed deadline is a synthetic example.",
    topic: "Resolution & Quality",
  },
  {
    q: "Can all roles read every case or document?",
    a: "No. The Case Officer sees assigned cases. Bureau Heads and Auditors are Bureau-scoped. The Admin perspective has configuration access without blanket confidential case access. Intake Officers can review drafts. This is demo authorization; production requires independent server and database enforcement.",
    topic: "AI & Evidence",
  },
  {
    q: "Is Supabase connected to the prototype?",
    a: "The Adi / SYNAPSE project was inspected, but live workflows are disabled: internal and Auth users are empty, the identity helper depends on a session setting, client roles lack private-schema usage, and evidence storage is not configured. See the repository Supabase audit for the verified findings.",
    topic: "Getting Started",
  },
  {
    q: "Where are my changes stored?",
    a: "This browser’s local storage holds the fictional workspace under synapse.demo.v1. Changes persist across refresh. The Settings workspace panel resets the seed. No email or notification is sent externally, and there is no remote evidence upload.",
    topic: "Getting Started",
  },
];
export function Help() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All topics");
  const filtered = faqs.filter(
    (f) =>
      (topic === "All topics" || f.topic === topic) &&
      `${f.q} ${f.a}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="help-hero">
        <div className="feature-orbit" />
        <Badge tone="light">
          <CircleHelp size={12} />
          YOUR WORKSPACE GUIDE
        </Badge>
        <h1>
          A little help.
          <br />A clearer way forward.
        </h1>
        <p>
          Find your footing, connect the context, and make the most of your
          SYNAPSE workspace.
        </p>
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search help"
            placeholder="Search guides and answers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>
      <div className="topic-grid">
        {[
          {
            title: "Getting Started",
            desc: "From your first intake review to a well-organized case workspace.",
            icon: BookOpen,
          },
          {
            title: "AI & Evidence",
            desc: "Understand findings, provenance, and the boundaries of human review.",
            icon: Sparkles,
          },
          {
            title: "Resolution & Quality",
            desc: "Close the loop with a clear, evidence-backed Quality Gate.",
            icon: ShieldCheck,
          },
        ].map((t) => (
          <button
            className="card topic-card"
            key={t.title}
            onClick={() => setTopic(t.title)}
          >
            <t.icon size={26} strokeWidth={1.5} />
            <h2>{t.title}</h2>
            <p>{t.desc}</p>
            <span>
              Explore guide <ArrowUpRight size={13} />
            </span>
          </button>
        ))}
      </div>
      <div className="help-lower">
        <Card
          title="Frequently Asked Questions"
          action={
            topic !== "All topics" ? (
              <button
                className="text-btn"
                onClick={() => setTopic("All topics")}
              >
                All topics
              </button>
            ) : undefined
          }
        >
          {filtered.map((f) => (
            <details key={f.q} className="faq-item">
              <summary>
                {f.q}
                <Plus size={15} />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
          {!filtered.length && (
            <Empty
              title="No matching answers"
              description="Try a different search or topic."
            />
          )}
        </Card>
        <div>
          <Card title="A Few Useful Shortcuts">
            <div className="shortcut-row">
              <span>Open global search</span>
              <kbd>Ctrl / ⌘ K</kbd>
            </div>
            <div className="shortcut-row">
              <span>Close a dialog</span>
              <kbd>Esc</kbd>
            </div>
            <div className="shortcut-row">
              <span>Navigate controls</span>
              <kbd>Tab</kbd>
            </div>
            <div className="shortcut-row">
              <span>Open selected action</span>
              <kbd>Enter</kbd>
            </div>
            <p className="fine-print" style={{ marginTop: 18 }}>
              Work cards have a status selector as a keyboard alternative to
              dragging. The graph has a keyboard case selector.
            </p>
          </Card>
          <Card title="Ready for the Jury?" className="jury-card">
            <p className="description">
              Follow the connected story from multilingual intake to
              intelligence, dependencies, and a human-approved resolution.
            </p>
            <Link className="btn primary full" href="/intake">
              Start the Demo Journey <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

export function Admin() {
  const { actor, audit, cases } = useDemo();
  const [tab, setTab] = useState("Audit trail");
  const [query, setQuery] = useState("");
  if (!["Admin", "Supervisor", "Auditor"].includes(actor.role))
    return (
      <Forbidden description="Audit and administration require the Admin, Supervisor or scoped Auditor perspective." />
    );
  const events = audit.filter((e) =>
    `${e.action} ${e.actor} ${e.target} ${e.detail}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function exportAudit() {
    downloadText(
      "synapse-scoped-audit.csv",
      csv([
        ["Action", "Target", "Actor", "At", "Detail"],
        ...events.map((e) => [e.action, e.target, e.actor, e.at, e.detail]),
      ]),
      "text/csv",
    );
  }
  return (
    <>
      <PageHeader
        title="Audit & Administration"
        subtitle="A clear record of what changed, who decided, and why."
      >
        <Badge tone="green">{actor.role} perspective</Badge>
      </PageHeader>
      <Tabs
        options={[
          "Audit trail",
          "Security & Integrations",
          "Policies",
          "Memberships",
        ]}
        value={tab}
        onChange={setTab}
      />
      <div style={{ height: 20 }} />
      {tab === "Audit trail" && (
        <>
          <div className="toolbar">
            <div className="search-input">
              <Search size={15} />
              <input
                aria-label="Search audit"
                placeholder="Search authorized audit events…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button onClick={exportAudit}>
              <ArrowDownToLine size={14} />
              Export Scoped Audit
            </Button>
          </div>
          <Card className="table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ACTION / CONTEXT</th>
                    <th>TARGET</th>
                    <th>ACTOR</th>
                    <th>RECORDED AT</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="subject-cell">
                        <strong>{e.action}</strong>
                        <p>{e.detail}</p>
                      </td>
                      <td>
                        {cases.some((c) => c.id === e.target) ? (
                          <Link href={`/complaints/${e.target}`}>
                            {e.target}
                          </Link>
                        ) : (
                          e.target
                        )}
                      </td>
                      <td>{e.actor}</td>
                      <td>
                        {date(e.at, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!events.length && (
              <Empty
                title="No authorized audit events"
                description="The Admin role has configuration access and no blanket case-content permission."
              />
            )}
          </Card>
          <p className="fine-print" style={{ marginTop: 15 }}>
            Local demo audit is retained by workflow commands but is not
            tamper-proof. Production append-only audit enforcement remains a
            database integration requirement.
          </p>
        </>
      )}
      {tab === "Security & Integrations" && (
        <>
          <div className="notice warning">
            <ShieldCheck size={19} />
            <p>
              Supabase was inspected on 26 October 2026. Its private schema is
              not usable by client roles. Live mode fails closed; no
              service-role key or privileged database context is accepted from
              the browser.
            </p>
          </div>
          <div className="admin-grid">
            <Card title="Verified Supabase Snapshot">
              <div className="status-list">
                {[
                  ["Organization / Project", "Adi / SYNAPSE"],
                  ["Region / Health", "Mumbai / ACTIVE_HEALTHY"],
                  ["Application tables", "69 in synapse"],
                  ["Auth / Internal users", "0 / 0"],
                  ["Cases / Work items", "0 / 0"],
                  ["Migration history", "0 entries"],
                  ["Evidence buckets", "0"],
                ].map(([a, b]) => (
                  <div key={a}>
                    <span>{a}</span>
                    <strong>{b}</strong>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Integration Requirements">
              <div className="status-list">
                {[
                  ["Auth-to-user mapping", "Not verified"],
                  ["Private-schema client usage", "Not granted"],
                  ["Tables without RLS", "53 (private schema)"],
                  ["Mutable search paths", "7 warnings"],
                  ["Workflow security tests", "Pending"],
                  ["Production readiness", "Blocked"],
                ].map(([a, b]) => (
                  <div key={a}>
                    <span>{a}</span>
                    <Badge tone="amber">{b}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Card title="What the findings mean">
            <p className="description">
              The current_user_id function reads a session setting instead of
              binding directly to authenticated identity. Several authorization
              helpers treat global administrators as having blanket case rights,
              which conflicts with the PRD. Security-definer workflows require a
              focused security review before exposure.
            </p>
            <p className="description">
              Missing RLS alone does not prove public exposure: catalog checks
              confirmed that anon and authenticated lack schema usage, and
              sampled tables lack client SELECT / INSERT grants. Do not add
              grants until appropriate policies and trusted identity mapping are
              established.
            </p>
            <p className="fine-print">
              This panel is a dated inspection snapshot, not a live health
              monitor. Detailed verified findings and remediation queries are in
              docs/SUPABASE_AUDIT.md.
            </p>
          </Card>
        </>
      )}
      {tab === "Policies" && (
        <div className="admin-grid">
          {[
            {
              name: "Resolution Quality Gate",
              version: "DEMO-QG v1.0",
              body: "Completed work, mandatory report, participating Bureau approval, dependencies, final communication, resolution review, and scoped human authority.",
            },
            {
              name: "Regulatory Conflict Sentinel",
              version: "DEMO-R01 v1.0",
              body: "Synthetic sequencing rule linking approval review to prerequisite faculty inspection. Advisory only; no official regulatory claim.",
            },
            {
              name: "SLA demonstration",
              version: "DEMO-SLA v1.0",
              body: "Seeded example deadlines; newly registered cases receive a 14-calendar-day example deadline. Hold and transfer preserve deadlines.",
            },
            {
              name: "Case access boundaries",
              version: "DEMO-ACCESS v1.0",
              body: "Officers assigned; heads and auditors scoped to Approval Bureau; Supervisor oversight; Admin configuration only. Production uses independently verified policy.",
            },
          ].map((p) => (
            <Card key={p.name} title={p.name}>
              <Badge tone="amber">Synthetic policy · {p.version}</Badge>
              <p className="description">{p.body}</p>
            </Card>
          ))}
        </div>
      )}
      {tab === "Memberships" && (
        <>
          <div className="notice">
            <ShieldCheck size={18} />
            <p>
              Directory below is fictional. Account provisioning, role grants,
              revocation, and policy publication require trusted server
              configuration; they are not simulated as successful production
              actions.
            </p>
          </div>
          <Card className="table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>MEMBER</th>
                    <th>BUREAU</th>
                    <th>ROLE</th>
                    <th>IDENTITY SOURCE</th>
                  </tr>
                </thead>
                <tbody>
                  {officers.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Avatar id={o.id} small /> {o.name}
                      </td>
                      <td>{o.bureau}</td>
                      <td>{o.role}</td>
                      <td>Fictional fixture · No Auth account</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
