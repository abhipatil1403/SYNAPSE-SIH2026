import { test } from "node:test";
import assert from "node:assert/strict";
import { platformFixture, principal, fixtureId as id, now } from "./fixtures/platform";
import { authorizedSnapshot } from "../lib/platform/selectors";
import { caseGraph } from "../lib/platform/graph";
import { MemoryTransactionStore, PlatformEngine } from "../lib/platform/engine";
import { randomUUID } from "node:crypto";
test("graph projection never infers same-issue from institution context or exposes an unauthorized endpoint", () => {
  const state = platformFixture(); state.relationships.push({ id: id(500), sourceId: id(21), targetId: id(22), type: "DEPENDS_ON", status: "CONFIRMED", reason: "Scoped source", reviewerId: id(3) });
  const graph = caseGraph(authorizedSnapshot(state, principal(), now));
  assert.equal(graph.nodes.filter((n) => n.kind === "CASE").length, 2);
  assert.ok(!JSON.stringify(graph).includes(id(22))); assert.ok(!graph.edges.some((e) => e.type === "SAME_ISSUE"));
  assert.equal(graph.edges.filter((e) => e.type === "SAME_INSTITUTION_CONTEXT").length, 2);
  assert.equal(caseGraph(authorizedSnapshot(state, principal(), now), "no match").nodes.length, 0);
});
test("linked-case notifications require current visibility of both endpoints and remain idempotent", async () => {
  const state = platformFixture(); state.relationships.push({ id: id(501), sourceId: id(21), targetId: id(23), type: "DEPENDS_ON", status: "CONFIRMED", reason: "Local test", reviewerId: id(3) });
  const engine = new PlatformEngine(new MemoryTransactionStore(state), () => now);
  const input = { idempotencyKey: randomUUID(), command: { type: "case.transition", caseId: id(21), expectedVersion: "1", status: "ASSIGNED", reason: "Begin authorized review" } };
  await engine.execute(principal(), input); await engine.execute(principal(), input);
  const snapshot = await engine.snapshot(principal()); assert.equal(snapshot.notifications.filter((n) => n.caseId === id(23)).length, 1);
});
