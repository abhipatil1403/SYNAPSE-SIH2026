import { test } from "node:test";
import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatewayCa } from "../lib/auth/gateway-ca";

const ca = rootCertificates[0]; // Public bundled Node trust certificate, no key.
test("gateway accepts multiline and escaped-newline inline public CA certificates", () => {
  assert.equal(gatewayCa({ SYNAPSE_GATEWAY_CA_PEM: ca }), ca.trim());
  assert.equal(gatewayCa({ SYNAPSE_GATEWAY_CA_PEM: ca.replaceAll("\n", "\\n") }), ca);
});
test("gateway keeps file-based CA support and prefers configured inline CA", () => {
  const dir = mkdtempSync(join(tmpdir(), "synapse-ca-"));
  try {
    const file = join(dir, "root.crt");
    writeFileSync(file, ca);
    assert.equal(gatewayCa({ SYNAPSE_GATEWAY_CA_FILE: file }), ca);
    assert.equal(gatewayCa({ SYNAPSE_GATEWAY_CA_PEM: ca, SYNAPSE_GATEWAY_CA_FILE: join(dir, "absent") }), ca.trim());
    assert.throws(() => gatewayCa({ SYNAPSE_GATEWAY_CA_PEM: "invalid-inline", SYNAPSE_GATEWAY_CA_FILE: file }), /^Error: GATEWAY_CA_INVALID$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("missing or malformed CA fails closed without disclosing input", () => {
  assert.throws(() => gatewayCa({}), /^Error: GATEWAY_CA_REQUIRED$/);
  for (const value of ["private-sentinel", "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----", "-----BEGIN PRIVATE KEY-----\nprivate-sentinel"])
    assert.throws(() => gatewayCa({ SYNAPSE_GATEWAY_CA_PEM: value }), /^Error: GATEWAY_CA_INVALID$/);
  assert.throws(() => gatewayCa({ SYNAPSE_GATEWAY_CA_FILE: join(tmpdir(), "nonexistent-synapse-ca-file") }), /^Error: GATEWAY_CA_INVALID$/);
});
