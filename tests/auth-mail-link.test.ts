import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { savedMailLink, followMailLink, applicantOrigin, providerOrigin } from "../scripts/phase6-7/mail-link.mjs";

test("mail-link contract simulation rejects wrong origin, flow type, stale file and unapproved callback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "synapse-mail-contract-")), path = join(directory, "link.txt");
  const valid = providerOrigin + "/auth/v1/verify?type=signup&token=contract-simulation&redirect_to=" + encodeURIComponent(applicantOrigin + "/auth/callback?sb_flow_id=contract-flow");
  try {
    await writeFile(path, valid.replaceAll("&", "&amp;"));
    assert.equal((await savedMailLink(path, new Date(Date.now() - 1000).toISOString(), ["signup"])).origin, providerOrigin);
    await assert.rejects(savedMailLink(path, new Date(Date.now() + 10000).toISOString(), ["signup"]));
    await assert.rejects(savedMailLink(path, "2000-01-01", ["recovery"]));
    for (const invalid of [valid.replace(providerOrigin, "https://attacker.invalid"), valid.replace(encodeURIComponent(applicantOrigin + "/auth/callback?sb_flow_id=contract-flow"), encodeURIComponent("https://attacker.invalid/auth/callback")), valid.replace("type=signup", "type=recovery")]) {
      await writeFile(path, invalid); await assert.rejects(savedMailLink(path, "2000-01-01", ["signup"]));
    }
  } finally { await rm(path, { force: true }); await rmdir(directory); }
});
test("redirect contract simulation stops before requesting an external redirect and propagates safe callback diagnostics", async () => {
  let count = 0;
  const external = { request: { get: async () => { count++; return { status: () => 303, headers: () => ({ location: "https://attacker.invalid/" }) }; } }, storageState: async () => ({ cookies: [] }) };
  await assert.rejects(followMailLink(external, new URL(providerOrigin + "/auth/v1/verify"), "/pending-approval", async () => {})); assert.equal(count, 1);
  const callback = { request: { get: async () => ({ status: () => 303, headers: () => ({ location: applicantOrigin + "/login", "x-synapse-auth-error": "flow_state_expired", "x-synapse-auth-stage": "code_exchange" }) }) }, storageState: async () => ({ cookies: [] }) };
  await assert.rejects(followMailLink(callback, new URL(applicantOrigin + "/auth/callback"), "/pending-approval", async () => {}), (error: unknown) => (error as { callbackStage?: string; callbackCode?: string }).callbackStage === "code_exchange" && (error as { callbackCode?: string }).callbackCode === "flow_state_expired");
});
