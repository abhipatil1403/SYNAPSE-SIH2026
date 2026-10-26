import type { Actor, Case, DemoState, Role, Task } from "./types";

export const bureaus = [
  "Approval",
  "Academic",
  "Quality Assurance",
  "Administration",
];
export const officers = [
  {
    id: "meera",
    name: "Meera Iyer",
    bureau: "Approval",
    role: "Case Officer",
    initials: "MI",
    color: "peach",
  },
  {
    id: "arjun",
    name: "Arjun Rao",
    bureau: "Academic",
    role: "Bureau Head",
    initials: "AR",
    color: "sage",
  },
  {
    id: "nisha",
    name: "Nisha Menon",
    bureau: "Quality Assurance",
    role: "Case Officer",
    initials: "NM",
    color: "lavender",
  },
  {
    id: "kabir",
    name: "Kabir Shah",
    bureau: "Administration",
    role: "Case Officer",
    initials: "KS",
    color: "sand",
  },
  {
    id: "priya",
    name: "Priya Nair",
    bureau: "Approval",
    role: "Bureau Head",
    initials: "PN",
    color: "sage",
  },
  {
    id: "dev",
    name: "Dev Kulkarni",
    bureau: "Academic",
    role: "Case Officer",
    initials: "DK",
    color: "peach",
  },
  {
    id: "sana",
    name: "Sana Ali",
    bureau: "Quality Assurance",
    role: "Bureau Head",
    initials: "SA",
    color: "sand",
  },
  {
    id: "rohan",
    name: "Rohan Das",
    bureau: "Administration",
    role: "Auditor",
    initials: "RD",
    color: "lavender",
  },
];
export function actorFor(role: Role): Actor {
  const names: Record<Role, string> = {
    Supervisor: "Ananya Sharma",
    "Case Officer": "Meera Iyer",
    "Bureau Head": "Priya Nair",
    "Intake Officer": "Ishaan Patel",
    Auditor: "Rohan Das",
    Admin: "System Administrator",
  };
  return {
    id:
      role === "Case Officer"
        ? "meera"
        : role.toLowerCase().replaceAll(" ", "-"),
    name: names[role],
    role,
    bureau: "Approval",
  };
}
export function createSeed(now = new Date()): DemoState {
  const anchor = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)}T09:00:00+05:30`,
  );
  const day = (offset: number) =>
    new Date(anchor.getTime() + offset * 86400000).toISOString();
  const stories = [
    [
      "Unapproved intake expansion",
      "Sahyadri Institute of Technology",
      "Pune",
      "Approval",
      "meera",
      "High",
      "IN_PROGRESS",
      "Approval compliance",
    ],
    [
      "Faculty records require verification",
      "Sahyadri Institute of Technology",
      "Pune",
      "Academic",
      "dev",
      "High",
      "IN_PROGRESS",
      "Faculty welfare",
    ],
    [
      "Mandatory closure report missing",
      "Riverstone Technical College",
      "Nashik",
      "Approval",
      "meera",
      "High",
      "RESOLUTION_REVIEW",
      "Infrastructure",
    ],
    [
      "Scholarship disbursement delay",
      "Aranya College of Engineering",
      "Indore",
      "Administration",
      "kabir",
      "Medium",
      "ASSIGNED",
      "Student welfare",
    ],
    [
      "Laboratory safety inspection",
      "Nilgiri Polytechnic Institute",
      "Mysuru",
      "Quality Assurance",
      "nisha",
      "High",
      "IN_PROGRESS",
      "Infrastructure",
    ],
    [
      "Fee refund documentation",
      "Lotus Technical Academy",
      "Jaipur",
      "Approval",
      "meera",
      "Medium",
      "RESOLUTION_REVIEW",
      "Student welfare",
    ],
    [
      "Accreditation record correction",
      "Western Valley Institute",
      "Surat",
      "Quality Assurance",
      "nisha",
      "Low",
      "DISPOSED",
      "Accreditation",
    ],
    [
      "Examination grievance review",
      "Aranya College of Engineering",
      "Indore",
      "Academic",
      "dev",
      "Medium",
      "TRIAGED",
      "Academic standards",
    ],
    [
      "Accessibility audit follow-up",
      "Cedar School of Technology",
      "Bhopal",
      "Approval",
      "meera",
      "Low",
      "DISPOSED",
      "Infrastructure",
    ],
    [
      "Faculty appointment clarification",
      "Lotus Technical Academy",
      "Jaipur",
      "Academic",
      "dev",
      "Low",
      "DISPOSED",
      "Faculty welfare",
    ],
    [
      "Approval letter inconsistency",
      "Eastern Ridge College",
      "Nagpur",
      "Approval",
      "meera",
      "Medium",
      "REGISTERED",
      "Approval compliance",
    ],
    [
      "Institution response awaited",
      "Cedar School of Technology",
      "Bhopal",
      "Administration",
      "kabir",
      "Medium",
      "ON_HOLD",
      "Student welfare",
    ],
    [
      "Workshop equipment verification",
      "Nilgiri Polytechnic Institute",
      "Mysuru",
      "Quality Assurance",
      "nisha",
      "Low",
      "DISPOSED",
      "Infrastructure",
    ],
    [
      "Annual disclosure follow-up",
      "Western Valley Institute",
      "Surat",
      "Approval",
      "meera",
      "Low",
      "DISPOSED",
      "Approval compliance",
    ],
    [
      "Academic calendar discrepancy",
      "Eastern Ridge College",
      "Nagpur",
      "Academic",
      "dev",
      "Medium",
      "ASSIGNED",
      "Academic standards",
    ],
    [
      "Fee committee response verified",
      "Riverstone Technical College",
      "Nashik",
      "Administration",
      "kabir",
      "Low",
      "DISPOSED",
      "Student welfare",
    ],
  ];
  const cases: Case[] = stories.map((r, i) => ({
    id: `SYN-${String(2026)}-${String(1041 + i)}`,
    subject: r[0],
    institution: r[1],
    city: r[2],
    bureau: r[3],
    officer: r[4],
    priority: r[5] as Case["priority"],
    status: r[6] as Case["status"],
    category: r[7],
    participants: i < 2 ? ["Approval", "Academic"] : [r[3]],
    description: `A fictional submission concerning ${r[0].toLowerCase()} at ${r[1]}. The assigned Bureau is verifying the institution response against the submitted records. Any policy or deadline shown in this workspace is a synthetic demonstration rule, not an official determination.`,
    receivedAt: day(-28 + i),
    updatedAt: day(-i % 5),
    dueAt: day(i < 3 ? i + 1 : i === 4 ? -2 : (i % 10) + 3),
    disposedAt: r[6] === "DISPOSED" ? day(-i % 7) : undefined,
    previousStatus: r[6] === "ON_HOLD" ? "IN_PROGRESS" : undefined,
    version: 1,
    cycle: 1,
    contributionApproved: i !== 0,
    communicationSent: i !== 0,
    evidence: [
      {
        id: `EV-${i + 1}`,
        name: i === 1 ? "Faculty declaration.txt" : "Institution response.txt",
        version: 1,
        source: "Fictional institution submission",
        at: day(-3),
        mandatory: false,
        body:
          i === 1
            ? "Faculty declaration, main campus, current academic year: 24 full-time faculty."
            : "Fictional institution response retained for human verification. This is a generated sample document.",
        hash: `DEMO-METADATA-${i + 1}`,
      },
      ...(i !== 2
        ? [
            {
              id: `EV-${i + 1}-R`,
              name: "Verified investigation report.txt",
              version: 1,
              source: "Demo investigating officer",
              at: day(-1),
              mandatory: true,
              body:
                i === 1
                  ? "Inspection report, main campus, same academic year: 16 full-time faculty observed. Attendance requires verification."
                  : "Fictional signed investigation summary. Required checks were recorded for demonstration purposes.",
              hash: `DEMO-REPORT-${i + 1}`,
            },
          ]
        : []),
    ],
    notes: [],
  }));
  const taskTitles = [
    "Verify intake approval records",
    "Review faculty declaration",
    "Obtain mandatory closure report",
    "Reconcile scholarship ledger",
    "Complete laboratory inspection",
    "Approve refund investigation",
    "Validate accreditation response",
    "Prepare examination brief",
    "Archive accessibility evidence",
    "Confirm appointment records",
    "Classify approval letter",
    "Request institution clarification",
    "Review workshop photographs",
    "Record disclosure finding",
    "Schedule academic review",
    "Send closure communication",
  ];
  const tasks: Task[] = cases.map((c, i) => ({
    id: `WI-${201 + i}`,
    caseId: c.id,
    title: taskTitles[i],
    bureau: c.bureau,
    assignee: c.officer,
    status:
      c.status === "DISPOSED" || i === 5 || i === 2
        ? "Done"
        : i % 4 === 0
          ? "In Progress"
          : i % 4 === 1
            ? "In Review"
            : "To Do",
    priority: c.priority,
    dueAt: c.dueAt,
    category: c.category,
    version: 1,
  }));
  tasks.push({
    id: "WI-220",
    caseId: cases[0].id,
    title: "Coordinate joint Bureau review",
    bureau: "Academic",
    assignee: "dev",
    status: "To Do",
    priority: "High",
    dueAt: day(2),
    category: "Coordination",
    version: 1,
  });
  return {
    schemaVersion: 1,
    revision: 0,
    seedDate: day(0),
    cases,
    tasks,
    findings: [
      {
        id: "AI-001",
        type: "Related cases",
        title: "Two submissions, one institutional context",
        caseIds: [cases[0].id, cases[1].id],
        explanation:
          "The same fictional institution appears in both complaints, but one concerns intake approval and the other faculty records. Retain distinct cases; a RELATED_TO link may help coordination.",
        sources: [
          "SYN-2026-1041 · original submission §1",
          "SYN-2026-1042 · original submission §1",
        ],
        confidence: "Strong contextual match · uncalibrated",
        severity: "Medium",
        state: "Pending review",
        ruleVersion: "Demo matching rules v1.0",
      },
      {
        id: "AI-002",
        type: "Conflict Sentinel",
        title: "Overlapping inspection and approval review",
        caseIds: [cases[0].id, cases[1].id],
        explanation:
          "Synthetic rule DEMO-R01 flags an approval expansion review scheduled before completion of the faculty verification it relies on. This is an advisory coordination concern; no real regulatory conflict has been determined.",
        sources: [
          "DEMO-ACT-01 · approval review",
          "DEMO-ACT-02 · faculty inspection",
          "Synthetic DEMO-R01 v1 · sequencing §2",
        ],
        confidence: "Deterministic rule match · requires human review",
        severity: "High",
        state: "Pending review",
        ruleVersion: "Synthetic DEMO-R01 v1.0",
      },
      {
        id: "AI-003",
        type: "Evidence contradiction",
        title: "Faculty count differs across two sources",
        caseIds: [cases[1].id],
        explanation:
          "Both sources refer to the main campus and the same academic year. The declaration lists 24 full-time faculty; the inspection records 16. Attendance and appointment scope need human verification before deciding whether this is a contradiction.",
        sources: [
          "EV-2 v1 · faculty declaration · paragraph 1: “24 full-time faculty”",
          "EV-2-R v1 · inspection report · paragraph 1: “16 full-time faculty”",
        ],
        confidence: "Source-aligned rule match · truth not established",
        severity: "High",
        state: "Pending review",
        ruleVersion: "Demo claim comparison v1.0",
      },
      {
        id: "AI-004",
        type: "Triage insight",
        title: "Approval letter needs manual classification",
        caseIds: [cases[10].id],
        explanation:
          "The letter references multiple review periods. Verify the relevant academic year and campus before selecting a category.",
        sources: ["SYN-2026-1051 · original submission §1"],
        confidence: "Insufficient context",
        severity: "Low",
        state: "Pending review",
        ruleVersion: "Demo triage rules v1.0",
      },
    ],
    submissions: [
      {
        id: "IN-001",
        messageId: "demo-mail-001",
        subject: "प्रवेश क्षमतेबाबत तक्रार",
        institution: cases[0].institution,
        language: "Marathi",
        body: "संस्थेने मंजूर प्रवेश क्षमतेपेक्षा अधिक विद्यार्थ्यांना प्रवेश दिल्याची तक्रार आहे. कृपया नोंदी तपासाव्यात.",
        translation:
          "The institution is alleged to have admitted students beyond its approved capacity. Please verify the records. [Precomputed fictional translation v1]",
        receivedAt: day(0),
        state: "Draft",
        attachment: "Intake declaration · 1 attachment · metadata only",
        verified: false,
      },
      {
        id: "IN-002",
        messageId: "demo-mail-002",
        subject: "छात्रवृत्ति भुगतान में देरी",
        institution: cases[3].institution,
        language: "Hindi",
        body: "छात्रवृत्ति के भुगतान में देरी हो रही है। संस्थान से भुगतान का विवरण मांगा जाए।",
        translation:
          "Scholarship payment has been delayed. Please request payment details from the institution. [Precomputed fictional translation v1]",
        receivedAt: day(-1),
        state: "Draft",
        attachment: "Payment statement · 1 attachment · metadata only",
        verified: false,
      },
      {
        id: "IN-003",
        messageId: "demo-mail-003",
        subject: "Clarification on laboratory equipment",
        institution: cases[4].institution,
        language: "English",
        body: "The main campus laboratory equipment inventory may be incomplete. Please compare it with the inspection inventory.",
        translation: "Original is already English.",
        receivedAt: day(-1),
        state: "Draft",
        attachment: "Inventory list · 1 attachment · metadata only",
        verified: false,
      },
    ],
    relationships: [
      {
        id: "REL-1",
        source: cases[0].id,
        target: cases[1].id,
        type: "COORDINATES_WITH",
        rationale:
          "Shared campus, independently investigated issues; fictional supervisor-confirmed coordination.",
        actor: "Ananya Sharma",
        at: day(-1),
      },
      {
        id: "REL-2",
        source: cases[2].id,
        target: cases[4].id,
        type: "DEPENDS_ON",
        rationale:
          "Laboratory verification must finish before infrastructure case disposal.",
        actor: "Priya Nair",
        at: day(-1),
      },
    ],
    audit: cases
      .slice(0, 6)
      .map((c, i) => ({
        id: `AUD-${i}`,
        action:
          i === 2
            ? "Resolution review requested"
            : "Case investigation updated",
        target: c.id,
        actor:
          officers.find((o) => o.id === c.officer)?.name ?? "Ananya Sharma",
        at: day(-i % 3),
        detail: "Fictional seeded activity; no live government records.",
      })),
    transfers: [],
    accessRequests: [],
    settings: {
      name: "Ananya Sharma",
      email: "ananya.sharma@example.test",
      digest: true,
      deadlines: true,
      reducedMotion: false,
      compact: false,
    },
    readNotifications: [],
  };
}
