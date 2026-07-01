// One-shot applier: walks packages/db/drizzle/*.sql in numerical order and
// applies each file to the live Postgres database. Used when drizzle-kit push
// can't be run interactively (e.g. CI or when it gets stuck on postgis system
// tables like `spatial_ref_sys`).
//
// Behaviour:
//   • Splits a file on `--> statement-breakpoint` ONLY when that token is
//     present (0000/0002/0005/0006/0007 use it; 0001/0003/0004 were hand-edited
//     and don't). Never splits on `;` — 0001 contains a PL/pgSQL function with
//     embedded semicolons that semicolon-splitting would break.
//   • Swallows idempotent Postgres errors at both statement- and file-level
//     so a re-run against a partially-migrated DB is a no-op:
//        - 42P07  duplicate_table          (CREATE TABLE)
//        - 42710  duplicate_object          (CREATE INDEX / CREATE TRIGGER / …)
//        - 42701  duplicate_column          (ADD COLUMN without IF NOT EXISTS)
//   • Records each successfully applied filename in `ofp_applied_migrations`.
//
// ponytail: no journal/snapshot integrity check — we trust filename ordering
// and the bookkeeping table. Silent rename detection is impossible without
// Drizzle snapshot diffing. Upgrade path: replace with
// drizzle-orm/postgres-js/migrator after regenerating meta/_journal.json and
// snapshots for any future schema change.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, "..", "drizzle");

const url = process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5433/ofp";
const sql = postgres(url, { max: 1 });

const SAFE_CODES = new Set(["42P07", "42701", "42710"]);
const isSafe = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e &&
  typeof (e as { code: unknown }).code === "string" &&
  SAFE_CODES.has((e as { code: string }).code);

await sql`CREATE TABLE IF NOT EXISTS ofp_applied_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

const appliedRows = await sql<{ name: string }[]>`
  SELECT name FROM ofp_applied_migrations
`;
const applied = new Set(appliedRows.map((r) => r.name));

const files = readdirSync(DRIZZLE_DIR)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();

let failed: string | null = null;
for (const f of files) {
  if (applied.has(f)) {
    console.log(`skip  ${f}`);
    continue;
  }
  const body = readFileSync(join(DRIZZLE_DIR, f), "utf8");
  const hasBreakpoint = body.includes("--> statement-breakpoint");
  const statements = hasBreakpoint
    ? body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [body];

  try {
    await sql.begin(async (tx) => {
      for (const stmt of statements) {
        try {
          // Savepoint around every DDL: a 42P07/42701/42710 only rolls back
          // THIS statement; without it Postgres enters 25P02 (transaction
          // aborted) and every later statement in the same tx is rejected.
          await tx.savepoint((sp) => sp.unsafe(stmt));
        } catch (e) {
          if (isSafe(e)) {
            const code = (e as { code: string }).code;
            console.log(`  ${f}: idempotent skip (${code})`);
            continue;
          }
          throw e;
        }
      }
      await tx`
        INSERT INTO ofp_applied_migrations (name) VALUES (${f})
        ON CONFLICT (name) DO NOTHING
      `;
    });
    console.log(`apply ${f}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`FAIL  ${f}: ${msg}`);
    failed = f;
    break;
  }
}

await sql.end();
if (failed) {
  console.error(`applier halted at ${failed}`);
  process.exit(1);
}
console.log("applier done");
