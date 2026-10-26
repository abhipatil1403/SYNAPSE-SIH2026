import { readFile, readdir, stat } from "node:fs/promises";
import { approvedPlan, safeMain, writeReport, projectRef } from "./operator.mjs";
import { loadVault } from "./vault.mjs";

// Only aggregate results are emitted. Never print a matched value or file excerpt.
safeMain(async () => {
  const { plan } = await approvedPlan();
  const vault = await loadVault(`.local/phase2/${plan.runId}.vault`);
  const secrets = [process.env.SUPABASE_SECRET_KEY, process.env.DATABASE_URL,
    ...vault.accounts.map((a) => a.password), vault.expiryProbe?.token].filter(Boolean).map((s) => Buffer.from(s));
  const emails = vault.accounts.map((a) => Buffer.from(a.email));
  let filesChecked = 0, secretMatches = 0, approvedEmailMatches = 0;
  const paths = ["app", "components", "lib", "docs", "scripts", "tests", ".next/static", ".next/server"];
  async function check(file) {
    const bytes = await readFile(file); filesChecked++;
    if (secrets.some((s) => bytes.includes(s))) secretMatches++;
    if (emails.some((s) => bytes.includes(s))) approvedEmailMatches++;
  }
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(dir + "/" + entry.name);
      else await check(dir + "/" + entry.name);
    }
  }
  for (const dir of paths) try { await walk(dir); } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const entry of await readdir(".", { withFileTypes: true }))
    if (entry.isFile() && /\.(log|md|ts|json)$/.test(entry.name)) await check(entry.name);
  let gitRepositoryPresent = true;
  try { await stat(".git"); } catch { gitRepositoryPresent = false; }
  const ignores = await readFile(".gitignore", "utf8");
  const report = { version: 1, projectRef, checkedAt: new Date().toISOString(), filesChecked, secretMatches, approvedEmailMatches,
    scanned: "Source, docs, tests, scripts, root logs/configs, .next/static and .next/server; excludes private env/vault, node_modules and build cache",
    gitRepositoryPresent, gitHistoryAudit: gitRepositoryPresent ? "NOT VERIFIED: run an authorized history scanner separately" : "NOT VERIFIED: this workspace has no .git metadata",
    ignoreRulesCoverPrivateFiles: ignores.includes(".env*") && ignores.includes(".local/") && ignores.includes("*.log"),
    hostedLogAudit: "NOT VERIFIED: connector permission denied; local output/artifacts were scanned",
    valuesPrinted: false };
  await writeReport("artifact-secret-scan.json", report);
  console.log(`Files scanned: ${filesChecked}; actual operator/password/original-token matches: ${secretMatches}; approved-email matches: ${approvedEmailMatches}. Values were not printed.`);
  if (secretMatches || approvedEmailMatches) process.exitCode = 1;
});
