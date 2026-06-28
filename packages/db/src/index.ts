// Drizzle client singleton. Import `db` and `schema` everywhere.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5432/ofp";

// One connection pool per process. Raise the connection cap and add read replicas
// only when production concurrency requires it.
const client = postgres(url, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
export * from "./schema.js";
