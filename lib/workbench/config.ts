import { z } from "zod";
export function workbenchConfig(env:Record<string,string|undefined> = process.env) {
  if (env.SYNAPSE_WORKBENCH_ENABLED !== "true") return null;
  const url = new URL(env.SYNAPSE_WORKBENCH_DATABASE_URL ?? "");
  if (url.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username !== "synapse_workbench_login" ||
    !/^\/synapse_workbench_[a-f0-9]{12}$/.test(url.pathname) || url.search || !url.password || !z.uuid().safeParse(env.SYNAPSE_WORKBENCH_ID).success)
    throw Error("ISOLATED_WORKBENCH_CONFIGURATION_INVALID");
  return { connectionString: url.href, environmentId: env.SYNAPSE_WORKBENCH_ID! };
}
