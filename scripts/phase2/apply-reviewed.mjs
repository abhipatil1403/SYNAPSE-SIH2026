import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { operatorContext, safeMain } from "./operator.mjs";
import { inspectSecurity } from "./security.mjs";
// Explicit operator alternative when connector is unavailable, not an automatic permission fallback.
safeMain(async () => {
  if (!process.argv.includes("--apply-reviewed"))
    throw Error(
      "Read the Phase 2 review and explicitly select --apply-reviewed.",
    );
  const { db } = await operatorContext();
  try {
    const inspection = await inspectSecurity(db);
    if (inspection.checks.some((c) => c.status !== "pass"))
      throw Error("Current read RPC security drift blocks migration.");
    const files = (await readdir("supabase/migrations"))
      .filter((f) => f.includes("_phase2_") && f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const name = file.slice(15, -4),
        version = file.slice(0, 14),
        source = await readFile(`supabase/migrations/${file}`, "utf8");
      const existing = (
        await db.query(
          "SELECT statements FROM supabase_migrations.schema_migrations WHERE name=$1",
          [name],
        )
      ).rows;
      if (existing.length) {
        if (
          existing.length !== 1 ||
          existing[0].statements.join("").replaceAll("\r\n", "\n").trim() !==
            source.replaceAll("\r\n", "\n").trim()
        )
          throw Error(
            "Migration history differs; never repair or overwrite it automatically.",
          );
        continue;
      }
      const hash = createHash("sha256").update(source).digest("hex");
      const review = JSON.parse(
        await readFile("docs/phase2/migration-review.json", "utf8"),
      );
      if (
        review.file !== file ||
        review.sha256 !== hash ||
        review.localAuthorizationPassed !== true
      )
        throw Error("Reviewed migration hash/test evidence does not match.");
      await db.query("BEGIN");
      try {
        await db.query(source);
        await db.query(
          "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)",
          [version, name, [source.trim()]],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
      console.log(
        `Applied reviewed migration ${version} with a matching history record. Read gates were not changed.`,
      );
    }
  } finally {
    await db.end();
  }
});
