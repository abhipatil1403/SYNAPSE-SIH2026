import "server-only";
import { Phase1Error } from "./service";

export function phase1Config(options: { requirePreview?: boolean } = {}) {
  if (
    options.requirePreview !== false &&
    process.env.SYNAPSE_PHASE1_READ_ENABLED !== "true"
  )
    throw new Phase1Error(
      503,
      "preview_locked",
      "The read-only preview is awaiting security approval.",
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const appOrigin = process.env.SYNAPSE_APP_ORIGIN ?? "http://localhost:3000";
  try {
    if (!url || !key?.startsWith("sb_publishable_"))
      throw new Error("Missing client configuration");
    const project = new URL(url),
      origin = new URL(appOrigin);
    if (process.env.SYNAPSE_GATEWAY_DATABASE_URL && project.hostname !== "xjnukuerzlrxjjqwmgkn.supabase.co")
      throw new Error("Gateway and Auth project must match");
    if (
      project.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(project.hostname)
    )
      throw new Error("HTTPS required");
    if (
      origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname)
    )
      throw new Error("HTTPS required");
    if (
      project.username ||
      project.password ||
      project.search ||
      project.hash ||
      project.pathname !== "/" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Invalid origin");
    return {
      url: project.origin,
      key,
      appOrigin: origin.origin,
      secureCookies: origin.protocol === "https:",
      allowedAuthIds: (process.env.SYNAPSE_PREVIEW_AUTH_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    };
  } catch {
    throw new Phase1Error(
      503,
      "configuration_unavailable",
      "The read-only service is not configured.",
    );
  }
}
