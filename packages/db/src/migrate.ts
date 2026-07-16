import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (process.env.ALLOW_SCHEMA_PUSH !== "true") {
  throw new Error("Refusing migration: set ALLOW_SCHEMA_PUSH=true only after reviewing committed migrations");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = postgres(databaseUrl, { max: 1 });
try {
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Committed database migrations applied successfully.");
} finally {
  await client.end();
}
