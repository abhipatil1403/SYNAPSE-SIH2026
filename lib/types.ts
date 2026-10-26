export const roles = [
  "Supervisor",
  "Case Officer",
  "Bureau Head",
  "Intake Officer",
  "Auditor",
  "Admin",
] as const;
export type Role = (typeof roles)[number];
export const statuses = [
  "REGISTERED",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLUTION_REVIEW",
  "DISPOSED",
  "ON_HOLD",
  "REOPENED",
] as const;
export type CaseStatus = (typeof statuses)[number];
export type Priority = "High" | "Medium" | "Low";
export type TaskStatus = "To Do" | "In Progress" | "In Review" | "Done";
export interface Actor {
  id: string;
  name: string;
  role: Role;
  bureau: string;
  grants?: { caseId: string; scope: AccessScope }[];
}
export type AccessScope = "DETAILS" | "DOCUMENTS" | "COORDINATE";
export interface AccessRequest {
  id: string;
  caseId: string;
  requesterId: string;
  requesterName: string;
  scope: AccessScope;
  purpose: string;
  expiresAt: string;
  state: "Requested" | "Approved" | "Rejected";
  reviewer?: string;
  decisionReason?: string;
}
export interface Case {
  id: string;
  subject: string;
  institution: string;
  city: string;
  bureau: string;
  officer: string;
  participants: string[];
  category: string;
  priority: Priority;
  status: CaseStatus;
  description: string;
  receivedAt: string;
  updatedAt: string;
  dueAt: string;
  disposedAt?: string;
  previousStatus?: CaseStatus;
  version: number;
  cycle: number;
  evidence: Evidence[];
  notes: { text: string; actor: string; at: string }[];
  contributionApproved: boolean;
  communicationSent: boolean;
}
export interface Evidence {
  id: string;
  name: string;
  version: number;
  source: string;
  at: string;
  mandatory: boolean;
  body: string;
  hash: string;
}
export interface Task {
  id: string;
  caseId: string;
  title: string;
  bureau: string;
  assignee: string;
  status: TaskStatus;
  priority: Priority;
  dueAt: string;
  category: string;
  version: number;
}
export type FindingType =
  | "Related cases"
  | "Conflict Sentinel"
  | "Evidence contradiction"
  | "Triage insight";
export interface Finding {
  id: string;
  type: FindingType;
  title: string;
  caseIds: string[];
  explanation: string;
  sources: string[];
  confidence: string;
  severity: Priority;
  state: "Pending review" | "Confirmed" | "Dismissed" | "Needs information";
  ruleVersion: string;
  reviewer?: string;
  reason?: string;
  reviewedAt?: string;
}
export interface Submission {
  id: string;
  messageId: string;
  subject: string;
  institution: string;
  language: "English" | "Hindi" | "Marathi";
  body: string;
  translation: string;
  receivedAt: string;
  state: "Draft" | "Registered" | "Associated" | "Rejected";
  caseId?: string;
  reason?: string;
  attachment: string;
  verified: boolean;
}
export const linkTypes = [
  "RELATED_TO",
  "DUPLICATE_OF",
  "DEPENDS_ON",
  "COORDINATES_WITH",
] as const;
export type LinkType = (typeof linkTypes)[number];
export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: LinkType;
  rationale: string;
  actor: string;
  at: string;
}
export interface AuditEvent {
  id: string;
  action: string;
  target: string;
  actor: string;
  at: string;
  detail: string;
}
export interface Transfer {
  id: string;
  caseId: string;
  from: string;
  to: string;
  reason: string;
  status: "Requested" | "Approved" | "Rejected";
  actor: string;
}
export interface Settings {
  name: string;
  email: string;
  digest: boolean;
  deadlines: boolean;
  reducedMotion: boolean;
  compact: boolean;
}
export interface DemoState {
  schemaVersion: 1;
  revision: number;
  seedDate: string;
  cases: Case[];
  tasks: Task[];
  findings: Finding[];
  submissions: Submission[];
  relationships: Relationship[];
  audit: AuditEvent[];
  transfers: Transfer[];
  accessRequests: AccessRequest[];
  settings: Settings;
  readNotifications: string[];
}
export interface GateItem {
  label: string;
  pass: boolean;
  detail: string;
}
export interface GateEvaluation {
  result: "PASS" | "BLOCKED";
  caseVersion: number;
  revision: number;
  policy: string;
  items: GateItem[];
}
