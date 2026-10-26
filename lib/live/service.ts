import {
  casePageSchema,
  caseQuerySchema,
  identitySchema,
  type CaseQuery,
} from "./contracts";

export class Phase1Error extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface ReadOnlyTransport {
  verifiedAuthUser: () => Promise<{ id: string } | null>;
  identity: () => Promise<unknown>;
  cases: (query: CaseQuery) => Promise<unknown>;
}
export async function readIdentity(transport: ReadOnlyTransport) {
  const user = await transport.verifiedAuthUser();
  if (!user?.id)
    throw new Phase1Error(
      401,
      "authentication_required",
      "Sign in to the read-only preview.",
    );
  const identity = identitySchema.safeParse(await transport.identity());
  if (!identity.success)
    throw new Phase1Error(
      503,
      "contract_mismatch",
      "The verified identity contract is unavailable.",
    );
  return identity.data;
}
export async function readCaseList(
  transport: ReadOnlyTransport,
  query: CaseQuery,
) {
  const validatedQuery = caseQuerySchema.parse(query);
  const identity = await readIdentity(transport);
  const page = casePageSchema.safeParse(await transport.cases(validatedQuery));
  if (
    !page.success ||
    page.data.page !== validatedQuery.page ||
    page.data.pageSize !== validatedQuery.pageSize ||
    page.data.items.length > validatedQuery.pageSize ||
    page.data.total < page.data.items.length
  ) {
    throw new Phase1Error(
      503,
      "contract_mismatch",
      "The verified case-list contract is unavailable.",
    );
  }
  return { identity, ...page.data };
}
export function databaseError(code: string | undefined): Phase1Error {
  if (code === "28000" || code === "PGRST301" || code === "PGRST303")
    return new Phase1Error(
      401,
      "authentication_required",
      "Sign in again to continue.",
    );
  if (code === "42501")
    return new Phase1Error(
      403,
      "account_not_enabled",
      "Your account is not enabled for this preview.",
    );
  if (code === "55000")
    return new Phase1Error(
      503,
      "preview_locked",
      "The read-only preview is awaiting security approval.",
    );
  if (code === "22023")
    return new Phase1Error(
      400,
      "invalid_query",
      "Check the case filters and try again.",
    );
  return new Phase1Error(
    503,
    "data_unavailable",
    "The read-only service is temporarily unavailable.",
  );
}
