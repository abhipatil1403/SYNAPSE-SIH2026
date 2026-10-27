import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

/** A public trust certificate, supplied inline on hosts without the local file. */
export function gatewayCa(env: Record<string, string | undefined> = process.env) {
  const inline = env.SYNAPSE_GATEWAY_CA_PEM?.trim();
  const file = env.SYNAPSE_GATEWAY_CA_FILE;
  if (!inline && !file) throw new Error("GATEWAY_CA_REQUIRED");
  try {
    const ca = inline ? inline.replace(/\\n/g, "\n") : readFileSync(file!, "utf8");
    if (!ca.trim().startsWith("-----BEGIN CERTIFICATE-----") || ca.includes("PRIVATE KEY"))
      throw new Error("INVALID_CERTIFICATE");
    new X509Certificate(ca);
    return ca;
  } catch {
    // Do not expose certificate/file contents or paths in an error response.
    throw new Error("GATEWAY_CA_INVALID");
  }
}
