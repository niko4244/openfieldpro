// Drizzle client singleton. Import `db` and `schema` everywhere.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5433/ofp";

// One connection pool per process. ponytail: max 10 is plenty for Phase 1;
// raise (and add a read replica URL) when concurrency actually demands it.
const client = postgres(url, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
export * from "./schema.js";
