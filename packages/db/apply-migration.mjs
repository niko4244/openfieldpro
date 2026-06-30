// Apply pending Drizzle migrations against DATABASE_URL.
// Usage: DATABASE_URL=postgres://... node apply-migration.mjs
// (or rely on the .env fallback below).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const dbUrl = process.env.DATABASE_URL || "postgres://ofp:ofp@localhost:5433/ofp";

const client = postgres(dbUrl, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Applying migrations from ./drizzle against", dbUrl);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
