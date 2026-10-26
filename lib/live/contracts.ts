import { z } from "zod";

// A separate read contract preserves deployed meanings; it is never cast to DemoState.
export const liveStatuses = [
  "NEW",
  "ASSIGNED",
  "UNDER_REVIEW",
  "AWAITING_INFORMATION",
  "ACTION_INITIATED",
  "ESCALATED",
  "DISPOSED",
  "REOPENED",
] as const;
export const livePriorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const liveRoles = [
  "SYSTEM_ADMIN",
  "SENIOR_MANAGEMENT",
  "BUREAU_HEAD",
  "CASE_OFFICER",
  "REVIEWER",
  "AUDITOR",
] as const;
export const liveStatusLabels: Record<(typeof liveStatuses)[number], string> = {
  NEW: "Registered · legacy New",
  ASSIGNED: "Assigned",
  UNDER_REVIEW: "Under review",
  AWAITING_INFORMATION: "Awaiting information",
  ACTION_INITIATED: "Action initiated",
  ESCALATED: "Escalated",
  DISPOSED: "Disposed",
  REOPENED: "Reopened",
};
export const livePriorityLabels = {
  LOW: "Low",
  NORMAL: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
} as const;
export const liveRoleLabels = {
  SYSTEM_ADMIN: "System Administrator",
  SENIOR_MANAGEMENT: "Supervisory Authority",
  BUREAU_HEAD: "Bureau Head",
  CASE_OFFICER: "Case Officer",
  REVIEWER: "Reviewer",
  AUDITOR: "Auditor",
} as const;

export const reconciliation = {
  caseStates: {
    DRAFT: {
      canonical: null,
      decision: "Excluded from the registered-case list",
    },
    NEW: {
      canonical: "REGISTERED",
      decision: "Read label only; no persisted rename",
    },
    ASSIGNED: { canonical: "ASSIGNED", decision: "Same state" },
    UNDER_REVIEW: {
      canonical: null,
      decision: "Preserve raw state; investigation/review semantics unresolved",
    },
    AWAITING_INFORMATION: {
      canonical: null,
      decision: "Preserve raw state; not an approved ON_HOLD mapping",
    },
    ACTION_INITIATED: {
      canonical: null,
      decision: "Preserve raw state; not interchangeable with IN_PROGRESS",
    },
    ESCALATED: {
      canonical: null,
      decision: "Preserve raw state; PRD needs escalation mapping",
    },
    DISPOSED: {
      canonical: "DISPOSED",
      decision: "Read only; closure guarantees still blocked",
    },
    REOPENED: {
      canonical: "REOPENED",
      decision: "Read only; review-cycle history still blocked",
    },
  },
  taskStates: {
    OPEN: "To Do",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Done",
    BLOCKED: null,
    CANCELLED: null,
  },
  priorities: livePriorityLabels,
  roles: liveRoleLabels,
} as const;

export const caseQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    status: z.enum(liveStatuses).optional(),
    priority: z.enum(livePriorities).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    sort: z
      .enum(["received_desc", "received_asc", "updated_desc"])
      .default("received_desc"),
  })
  .strict();
export type CaseQuery = z.infer<typeof caseQuerySchema>;
export function parseCaseQuery(params: URLSearchParams): CaseQuery {
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error("Duplicate query parameters");
  return caseQuerySchema.parse(Object.fromEntries(entries));
}

export const identitySchema = z
  .object({
    internalUserId: z.uuid(),
    displayName: z.string().min(1),
    roleCodes: z.array(z.enum(liveRoles)),
    readOnly: z.literal(true),
  })
  .strict();
const bigintText = z.string().regex(/^[1-9]\d*$/);
export const liveCaseSchema = z
  .object({
    id: z.uuid(),
    caseNumber: bigintText,
    subject: z.string().min(1),
    statusCode: z.enum(liveStatuses),
    priorityCode: z.enum(livePriorities),
    institution: z.string(),
    city: z.string().nullable(),
    bureau: z.string(),
    category: z.string(),
    officerId: z.uuid().nullable(),
    receivedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    version: bigintText,
    dueAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export const casePageSchema = z
  .object({
    items: z.array(liveCaseSchema).max(50),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    readOnly: z.literal(true),
  })
  .strict();
export type LiveIdentity = z.infer<typeof identitySchema>;
export type LiveCase = z.infer<typeof liveCaseSchema>;
export type LiveCasePage = z.infer<typeof casePageSchema>;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
// Deliberately narrow generated-client surface: no operational tables or write RPCs.
export type Phase1Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      synapse_phase2_revoke_session: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      synapse_phase1_me: { Args: Record<PropertyKey, never>; Returns: Json };
      synapse_phase1_cases: {
        Args: {
          p_search?: string;
          p_status?: string | null;
          p_priority?: string | null;
          p_page?: number;
          p_page_size?: number;
          p_sort?: string;
        };
        Returns: Json;
      };
    };
  };
};
