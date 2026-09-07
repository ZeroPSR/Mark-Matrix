/**
 * Apply any not-yet-applied migration files to a Supabase Postgres instance
 * via the direct connection string in .keys/supabase.json.
 *
 * Tracks applied migrations in a `schema_migrations` table (created on
 * first run) — like supabase db push but without the CLI.
 *
 *   pnpm exec tsx scripts/apply-migrations.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });

const keysPath = join(process.cwd(), ".keys", "supabase.json");
const keys = JSON.parse(readFileSync(keysPath, "utf-8")) as { direct: string };
const directUrl: string = keys["direct"];
if (!directUrl) throw new Error("no direct URL in .keys/supabase.json");

const migrationsDir = join(process.cwd(), "supabase", "migrations");

async function main(): Promise<void> {
  const client = new Client({ connectionString: directUrl });
  await client.connect();

  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  // Bootstrap: if the DB is already in a known-applied state (e.g. the
  // `batches` table from the first migration exists) but schema_migrations is
  // empty, seed every existing migration file as already applied so we don't
  // re-run DDL that would fail on duplicate types/tables.
  const { rows: applied } = await client.query<{ version: string }>(
    "select version from public.schema_migrations order by version",
  );
  const appliedSet = new Set(applied.map((r) => r.version));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (applied.length === 0) {
    const { rows: existingTables } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'batches'",
    );
    if (existingTables.length > 0) {
      console.log("DB appears to be pre-existing — seeding schema_migrations with all current files except the newest two.");
      // Heuristic: the two newest files in this PR are the ones we actually
      // want to apply (the attendance migration and the faculty-enrollments
      // read policy). Everything older is already in the DB.
      const toSeed = files.slice(0, -2);
      for (const f of toSeed) {
        await client.query("insert into public.schema_migrations (version) values ($1) on conflict do nothing", [f]);
        appliedSet.add(f);
      }
    }
  }

  let appliedCount = 0;
  for (const f of files) {
    if (appliedSet.has(f)) continue;
    const sql = readFileSync(join(migrationsDir, f), "utf-8");
    process.stdout.write(`applying ${f}… `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (version) values ($1)", [f]);
      await client.query("commit");
      process.stdout.write("ok\n");
      appliedCount += 1;
    } catch (e) {
      await client.query("rollback");
      process.stdout.write("FAILED\n");
      throw e;
    }
  }
  console.log(`done. ${appliedCount} migration(s) applied.`);
  await client.end();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
