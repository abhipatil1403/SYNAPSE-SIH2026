import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const literal = (s) =>
  s === null
    ? "NULL"
    : typeof s === "boolean"
      ? String(s)
      : typeof s === "number"
        ? String(s)
        : "'" + String(s).replaceAll("'", "''") + "'";
const schema = "synapse";
export function renderBaseline(b) {
  const sql = [
    "-- Captured application-schema baseline. Restore ONLY into an empty disposable database.",
    "-- Never apply this file to the deployed project or register it as a new deployed migration.",
    "-- Managed auth/storage schemas and operational records are intentionally excluded.",
    "BEGIN;",
    "SET check_function_bodies = off;",
    "DO $$ BEGIN IF EXISTS (SELECT FROM pg_namespace WHERE nspname='synapse') THEN RAISE EXCEPTION 'Baseline restore requires an absent synapse schema; nothing was reset'; END IF; END $$;",
  ];
  for (const r of b.roles)
    sql.push(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${literal(r.name)}) THEN CREATE ROLE ${quote(r.name)} NOLOGIN NOBYPASSRLS; END IF; END $$;`,
    );
  sql.push(`CREATE SCHEMA ${quote(schema)};`);
  for (const s of b.sequences ?? [])
    if (!s.identity)
      sql.push(
        `CREATE SEQUENCE ${quote(schema)}.${quote(s.name)} AS ${s.type} INCREMENT ${s.increment} MINVALUE ${s.min} MAXVALUE ${s.max} START ${s.start} CACHE ${s.cache} ${s.cycle ? "CYCLE" : "NO CYCLE"};`,
      );
  for (const t of b.tables) {
    const cols = t.columns.map((c) => {
      let col = `${quote(c.name)} ${c.type}`;
      if (c.collation) col += ` COLLATE ${c.collation}`;
      if (c.identity) {
        const seq = b.sequences.find(
          (s) => s.owned_by === `${schema}.${t.name}.${c.name}`,
        );
        col += ` GENERATED ${c.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`;
        if (seq)
          col += ` (INCREMENT ${seq.increment} MINVALUE ${seq.min} MAXVALUE ${seq.max} START ${seq.start} CACHE ${seq.cache} ${seq.cycle ? "CYCLE" : "NO CYCLE"})`;
      } else if (c.generated)
        col += ` GENERATED ALWAYS AS (${c.expression}) STORED`;
      else if (c.expression) col += ` DEFAULT ${c.expression}`;
      if (c.not_null) col += " NOT NULL";
      return "  " + col;
    });
    sql.push(
      `CREATE TABLE ${quote(schema)}.${quote(t.name)} (\n${cols.join(",\n")}\n);`,
    );
  }
  // Referenced unique keys must exist before adding any foreign keys.
  for (const c of [...b.constraints].sort(
    (a, z) => Number(a.type === "f") - Number(z.type === "f"),
  ))
    sql.push(
      `ALTER TABLE ${c.table} ADD CONSTRAINT ${quote(c.name)} ${c.definition};`,
    );
  for (const i of b.indexes ?? []) sql.push(i.definition + ";");
  for (const f of b.functions)
    sql.push(f.definition.trim().replace(/;?$/, ";"));
  for (const v of b.views ?? [])
    sql.push(
      `CREATE VIEW ${quote(schema)}.${quote(v.name)}${v.options?.length ? ` WITH (${v.options.join(", ")})` : ""} AS ${v.definition.trim().replace(/;$/, "")};`,
    );
  for (const t of b.triggers) {
    sql.push(t.definition + ";");
    if (t.enabled === "D")
      sql.push(
        `ALTER TABLE ${quote(schema)}.${quote(t.table)} DISABLE TRIGGER ${quote(t.name)};`,
      );
    if (t.enabled === "A" || t.enabled === "R")
      sql.push(
        `ALTER TABLE ${quote(schema)}.${quote(t.table)} ENABLE ${t.enabled === "A" ? "ALWAYS" : "REPLICA"} TRIGGER ${quote(t.name)};`,
      );
  }
  for (const p of b.policies)
    sql.push(
      `CREATE POLICY ${quote(p.policyname)} ON ${quote(schema)}.${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map((r) => (r === "public" ? "PUBLIC" : quote(r))).join(", ")}${p.qual ? ` USING (${p.qual})` : ""}${p.with_check ? ` WITH CHECK (${p.with_check})` : ""};`,
    );
  for (const t of b.tables) {
    if (t.rls)
      sql.push(
        `ALTER TABLE ${quote(schema)}.${quote(t.name)} ENABLE ROW LEVEL SECURITY;`,
      );
    if (t.force_rls)
      sql.push(
        `ALTER TABLE ${quote(schema)}.${quote(t.name)} FORCE ROW LEVEL SECURITY;`,
      );
  }
  // New Postgres functions otherwise inherit PUBLIC EXECUTE, unlike this deployed schema.
  sql.push(
    `REVOKE ALL ON SCHEMA ${quote(schema)} FROM PUBLIC;`,
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${quote(schema)} FROM PUBLIC;`,
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${quote(schema)} FROM PUBLIC;`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${quote(schema)} FROM PUBLIC;`,
  );
  for (const g of b.grants)
    if (g.grantee !== "postgres")
      sql.push(
        `GRANT ${g.privilege} ON ${g.kind.toUpperCase()} ${g.object} TO ${g.grantee === "PUBLIC" ? "PUBLIC" : quote(g.grantee)}${g.grantable ? " WITH GRANT OPTION" : ""};`,
      );
  if (b.default_acls?.length)
    throw new Error(
      "Nonempty default ACLs require explicit rendering; refusing incomplete baseline.",
    );
  for (const [table, rows] of Object.entries(b.reference_data))
    for (const row of rows ?? [])
      sql.push(
        `INSERT INTO ${quote(schema)}.${quote(table)} (${Object.keys(row).map(quote).join(", ")}) VALUES (${Object.values(row).map(literal).join(", ")});`,
      );
  sql.push("COMMIT;", "");
  return sql.join("\n\n");
}

async function main() {
  const target = "supabase/baseline/deployed-2026-10-26";
  if (process.argv.includes("--capture")) {
    if (!process.env.DATABASE_URL)
      throw new Error(
        "DATABASE_URL required for repeat capture; never pass credentials on command line.",
      );
    const { default: pg } = await import("pg");
    const db = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === "disable"
          ? false
          : { rejectUnauthorized: true },
    });
    await db.connect();
    try {
      await db.query("BEGIN READ ONLY");
      const { rows } = await db.query(
        await readFile("scripts/sql/capture-baseline.sql", "utf8"),
      );
      const output = process.env.SYNAPSE_BASELINE_OUTPUT;
      if (!output)
        throw new Error(
          "SYNAPSE_BASELINE_OUTPUT required; immutable baseline is never overwritten by capture.",
        );
      await mkdir(output, { recursive: true });
      await writeFile(
        `${output}/catalog.json`,
        JSON.stringify(rows[0].baseline, null, 2) + "\n",
        { flag: "wx" },
      );
      await db.query("ROLLBACK");
    } finally {
      await db.end();
    }
    return;
  }
  const source = await readFile(`${target}.catalog.json`, "utf8");
  const b = JSON.parse(source);
  const sql = renderBaseline(b);
  const manifest = {
    project: b.project,
    capturedAt: b.captured_at,
    postgresVersion: b.postgres_version,
    scope:
      "synapse schema and five reference-data tables; not a managed-service or operational-data backup",
    tables: b.tables.length,
    columns: b.tables.reduce((n, t) => n + t.columns.length, 0),
    constraints: b.constraints.length,
    functions: b.functions.length,
    policies: b.policies.length,
    triggers: b.triggers.length,
    views: (b.views ?? []).length,
    catalogSha256: createHash("sha256").update(source).digest("hex"),
    sqlSha256: createHash("sha256").update(sql).digest("hex"),
  };
  if (process.argv.includes("--check")) {
    if (
      (await readFile(`${target}.sql`, "utf8")) !== sql ||
      (await readFile(`${target}.manifest.json`, "utf8")) !==
        JSON.stringify(manifest, null, 2) + "\n"
    )
      throw new Error("Baseline drift or modified generated artifact.");
    console.log("Baseline artifacts match catalog and SHA-256 manifest.");
  } else {
    await writeFile(`${target}.sql`, sql);
    await writeFile(
      `${target}.manifest.json`,
      JSON.stringify(manifest, null, 2) + "\n",
    );
    console.log(
      `Rendered ${manifest.tables} tables, ${manifest.functions} functions, ${manifest.constraints} constraints.`,
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
