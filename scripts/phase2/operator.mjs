import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validatePlan } from "./plan.mjs";
import { databaseTlsOptions } from "./database-tls.mjs";
export const projectRef = "xjnukuerzlrxjjqwmgkn";
export async function operatorContext({ authAdmin = false } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    !url ||
    new URL(url).hostname !== `${projectRef}.supabase.co` ||
    !key?.startsWith("sb_publishable_")
  )
    throw Error("Expected verified SYNAPSE publishable configuration.");
  if (!process.env.DATABASE_URL)
    throw Error("DATABASE_URL is missing from operator configuration.");
  if (authAdmin && !process.env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_"))
    throw Error(
      "SUPABASE_SECRET_KEY is missing. Only the operator Auth API uses it.",
    );
  const db = new pg.Client({
    ...(await databaseTlsOptions(process.env.DATABASE_URL, projectRef, process.env.SUPABASE_DB_CA_FILE)),
    statement_timeout: 20000,
  });
  await db.connect();
  const userClient = () =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const admin = authAdmin
    ? createClient(url, process.env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth.admin
    : null;
  return { db, admin, url, key, userClient };
}
export async function approvedPlan() {
  const plan = validatePlan(
    JSON.parse(
      (await readFile(".local/phase2/approved-accounts.json", "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    ),
  );
  return {
    plan,
    digest: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}
export async function writeReport(file, value) {
  await mkdir("docs/phase2", { recursive: true });
  await writeFile(`docs/phase2/${file}`, JSON.stringify(value, null, 2) + "\n");
}
export function safeMain(main) {
  main().catch((error) => {
    const code=typeof error?.code==='string'&&/^[A-Z0-9_]{2,48}$/.test(error.code)?error.code:'UNCLASSIFIED';
    console.error(`Sanitized operator failure code: ${code}`);
    console.error(
      error?.message?.startsWith("DATABASE_URL") ||
        error?.message?.startsWith("SUPABASE_SECRET_KEY") ||
        error?.message?.startsWith("Expected verified")
        ? error.message
        : "Operator step failed. No passwords, tokens or database URL were printed. Inspect the sanitized report or run the documented prerequisites.",
    );
    process.exitCode = 1;
  });
}
