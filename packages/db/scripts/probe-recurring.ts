// One-shot probe — connect to a Postgres URL, dump recurring_jobs column
// roster, and the contents of any ofp_applied_migrations bookkeeping.
// Usage: DATABASE_URL=... tsx scripts/probe-recurring.ts

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const sql = postgres(url, { max: 1 });

const cols = await sql<{ column_name: string; data_type: string }[]>`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'recurring_jobs'
  ORDER BY ordinal_position
`;
console.log(`--- ${url} recurring_jobs ---`);
console.table(cols);

try {
  const applied = await sql<{ name: string; applied_at: Date }[]>`
    SELECT name, applied_at FROM ofp_applied_migrations ORDER BY name
  `;
  console.log("bookkeeping:");
  for (const r of applied) console.log(`  ${r.name}  ${r.applied_at.toISOString()}`);
} catch {
  console.log("(no ofp_applied_migrations table)");
}

await sql.end();
