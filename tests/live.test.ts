import { test } from "node:test";
import assert from "node:assert/strict";
import {
  casePageSchema,
  parseCaseQuery,
  reconciliation,
} from "../lib/live/contracts";
import {
  readCaseList,
  readIdentity,
  databaseError,
  type ReadOnlyTransport,
} from "../lib/live/service";
import { smallJson, requireSameOrigin } from "../lib/live/request";

const identity = {
  internalUserId: "b25fe7e1-25c6-45d9-9045-7f81bc405a10",
  displayName: "Approved test user",
  roleCodes: ["CASE_OFFICER"],
  readOnly: true,
};
const record = {
  id: "b25fe7e1-25c6-45d9-9045-7f81bc405a11",
  caseNumber: "9007199254740993",
  subject: "Authorized complaint",
  statusCode: "NEW",
  priorityCode: "URGENT",
  institution: "Approved institution",
  city: null,
  bureau: "Assigned Bureau",
  category: "Compliance",
  officerId: null,
  receivedAt: "2026-10-26T09:00:00+00:00",
  updatedAt: "2026-10-26T09:00:00+00:00",
  version: "9007199254740993",
  dueAt: null,
};
const query = parseCaseQuery(new URLSearchParams());
const transport = (
  overrides: Partial<ReadOnlyTransport> = {},
): ReadOnlyTransport => ({
  verifiedAuthUser: async () => ({
    id: "b25fe7e1-25c6-45d9-9045-7f81bc405a12",
  }),
  identity: async () => identity,
  cases: async () => ({
    items: [record],
    page: 1,
    pageSize: 20,
    total: 1,
    readOnly: true,
  }),
  ...overrides,
});

test("live query rejects actor/role injection, repeated parameters, unsupported states and unsafe ranges", () => {
  for (const value of [
    "actor=admin",
    "role=Supervisor",
    "bureau=All",
    "status=RESOLUTION_REVIEW",
    "page=0",
    "pageSize=1000",
    "page=1&page=2",
    "sort=arbitrary",
    "q=" + "x".repeat(101),
  ])
    assert.throws(() => parseCaseQuery(new URLSearchParams(value)));
  assert.equal(
    parseCaseQuery(
      new URLSearchParams("status=UNDER_REVIEW&priority=URGENT&page=2"),
    ).page,
    2,
  );
});
test("live record contract preserves bigint precision, urgent priority, legacy states and null SLA", () => {
  const page = casePageSchema.parse({
    items: [record],
    page: 1,
    pageSize: 20,
    total: 1,
    readOnly: true,
  });
  assert.equal(page.items[0].caseNumber, "9007199254740993");
  assert.equal(page.items[0].version, "9007199254740993");
  assert.equal(page.items[0].priorityCode, "URGENT");
  assert.equal(page.items[0].dueAt, null);
  assert.equal(reconciliation.caseStates.UNDER_REVIEW.canonical, null);
  assert.equal(reconciliation.taskStates.BLOCKED, null);
});
test("unverified or missing Auth session never reaches a database read", async () => {
  let touched = false;
  await assert.rejects(
    readCaseList(
      transport({
        verifiedAuthUser: async () => null,
        identity: async () => {
          touched = true;
          return identity;
        },
        cases: async () => {
          touched = true;
          return {};
        },
      }),
      query,
    ),
    (e) => e instanceof Error && "status" in e && e.status === 401,
  );
  assert.equal(touched, false);
});
test("trusted identity is required before case-list RPC and unknown fields fail closed", async () => {
  let touched = false;
  await assert.rejects(
    readCaseList(
      transport({
        identity: async () => ({ ...identity, grants: ["all"] }),
        cases: async () => {
          touched = true;
          return {};
        },
      }),
      query,
    ),
    /identity contract/,
  );
  assert.equal(touched, false);
  await assert.rejects(
    readIdentity(
      transport({
        identity: async () => ({ ...identity, roleCodes: ["Supervisor"] }),
      }),
    ),
    /identity contract/,
  );
});
test("read-only case service validates authorization payload and pagination before delivery", async () => {
  const result = await readCaseList(transport(), query);
  assert.equal(result.identity.displayName, identity.displayName);
  assert.equal(result.items[0].caseNumber, record.caseNumber);
  for (const broken of [
    {
      items: [{ ...record, evidence: "secret" }],
      page: 1,
      pageSize: 20,
      total: 1,
      readOnly: true,
    },
    { items: [record], page: 1, pageSize: 20, total: 0, readOnly: true },
    { items: [record], page: 2, pageSize: 20, total: 1, readOnly: true },
    { items: [record], page: 1, pageSize: 20, total: 1, readOnly: false },
  ])
    await assert.rejects(
      readCaseList(transport({ cases: async () => broken }), query),
      /case-list contract/,
    );
});
test("request-scoped transports never share another identity's case payload", async () => {
  const a = transport(),
    b = transport({
      identity: async () => ({ ...identity, displayName: "Second account" }),
      cases: async () => ({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        readOnly: true,
      }),
    });
  const [first, second] = await Promise.all([
    readCaseList(a, query),
    readCaseList(b, query),
  ]);
  assert.equal(first.items.length, 1);
  assert.equal(second.items.length, 0);
  assert.equal(second.identity.displayName, "Second account");
});
test("database errors expose stable safe categories without SQL details", () => {
  assert.equal(databaseError("42501").status, 403);
  assert.equal(databaseError("28000").status, 401);
  assert.equal(databaseError("55000").code, "preview_locked");
  assert.equal(databaseError("22023").status, 400);
  assert.equal(databaseError("unexpected").status, 503);
  assert.doesNotMatch(
    databaseError("unexpected").message,
    /postgres|synapse\./,
  );
});
test("sign-in JSON reader enforces content type, byte limit and well-formed JSON", async () => {
  const request = (body: string, contentType = "application/json") =>
    new Request("http://localhost/sign-in", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
  assert.deepEqual(
    await smallJson(request('{"email":"test@example.invalid"}')),
    { email: "test@example.invalid" },
  );
  await assert.rejects(
    smallJson(request("{}", "text/plain")),
    (e) => e instanceof Error && "status" in e && e.status === 415,
  );
  await assert.rejects(
    smallJson(request('{"value":"' + "é".repeat(2200) + '"}')),
    (e) => e instanceof Error && "status" in e && e.status === 413,
  );
  await assert.rejects(
    smallJson(request("{invalid")),
    (e) => e instanceof Error && "status" in e && e.status === 400,
  );
});
test("Auth POST origin checks reject missing, cross-site and lookalike origins", () => {
  const origin = "http://localhost:3000";
  assert.doesNotThrow(() =>
    requireSameOrigin(
      new Request(origin, { headers: { Origin: origin } }),
      origin,
    ),
  );
  const variants: Record<string, string>[] = [
    {},
    { Origin: "http://localhost:3000.attacker.invalid" },
    { Origin: "http://localhost:3001" },
    { Origin: origin, "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of variants) {
    assert.throws(
      () => requireSameOrigin(new Request(origin, { headers }), origin),
      (error) =>
        error instanceof Error && "status" in error && error.status === 403,
    );
  }
});
