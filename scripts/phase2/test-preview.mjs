import { spawn } from "node:child_process";
import { approvedPlan, safeMain } from "./operator.mjs";
import { loadVault } from "./vault.mjs";

safeMain(async () => {
  if (!process.argv.includes("--controlled-read")) throw Error("Explicit controlled test selection is required.");
  const { plan, digest } = await approvedPlan();
  const vault = await loadVault(`.local/phase2/${plan.runId}.vault`);
  if (vault.approvalDigest !== digest || vault.accounts.length !== 2)
    throw Error("Exactly two approved provisioned accounts are required.");
  const origin = "http://127.0.0.1:3001";
  try {
    await fetch(origin, { signal: AbortSignal.timeout(1000) });
    throw Error("Controlled test port is already occupied; do not reuse an unknown process.");
  } catch (error) { if (error.message?.startsWith("Controlled")) throw error; }
  const webEnv = { ...process.env, SYNAPSE_PHASE1_READ_ENABLED: "true",
    SYNAPSE_PREVIEW_AUTH_IDS: vault.accounts.map((a) => a.authUserId).join(","),
    SYNAPSE_APP_ORIGIN: origin, NEXT_PUBLIC_APP_MODE: "demo" };
  for (const key of ["SUPABASE_SECRET_KEY", "DATABASE_URL", "SUPABASE_DB_CA_FILE"])
    delete webEnv[key];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"],
    { env: webEnv, stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
  const timeout = setTimeout(() => server.kill(), 10 * 60 * 1000);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null) throw Error("Controlled preview process exited before readiness.");
      try { ready = (await fetch(origin + "/live-preview", { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw Error("Controlled preview did not start.");
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["scripts/phase2/verify-http.mjs", "--controlled-read"], {
        env: { ...process.env, SYNAPSE_PHASE2_TEST_ORIGIN: origin }, windowsHide: true, stdio: "inherit" });
      child.on("error", reject); child.on("exit", resolve);
    });
    if (result !== 0) throw Error("Actual authenticated HTTP/browser verification failed.");
  } finally {
    clearTimeout(timeout);
    server.kill();
    console.log("Controlled loopback preview stopped. Global Demo Mode configuration was not changed.");
  }
});
