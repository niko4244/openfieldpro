import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as coreSchema from "./schema.js";
import * as servicePlanSchema from "./service-plans.js";
import * as diagnosticSchema from "./diagnostics.js";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is required for schema parity checks");

const expectedTypeToUdt: Record<string, string> = {
  boolean: "bool",
  integer: "int4",
  "timestamp with time zone": "timestamptz",
  "text[]": "_text",
};

const sql = postgres(url, { max: 1 });
try {
  const actual = await sql<{ table_name: string; column_name: string; udt_name: string }[]>`
    select table_name, column_name, udt_name
    from information_schema.columns
    where table_schema = 'public'
  `;
  const actualColumns = new Map(actual.map((row) => [`${row.table_name}.${row.column_name}`, row.udt_name]));
  const schema = { ...coreSchema, ...servicePlanSchema, ...diagnosticSchema };
  const tables = Object.values(schema).filter((value): value is PgTable => is(value, PgTable));
  const problems: string[] = [];

  for (const table of tables) {
    const tableName = getTableName(table);
    for (const column of Object.values(getTableColumns(table))) {
      const key = `${tableName}.${column.name}`;
      const actualType = actualColumns.get(key);
      if (!actualType) {
        problems.push(`missing ${key}`);
        continue;
      }
      const expectedSqlType = column.getSQLType();
      const expectedType = expectedTypeToUdt[expectedSqlType] ?? expectedSqlType;
      if (actualType !== expectedType) problems.push(`${key} is ${actualType}; expected ${expectedType}`);
    }
  }

  if (problems.length) throw new Error(`Database schema does not match the application:\n${problems.join("\n")}`);
  console.log(`Database schema parity verified for ${tables.length} tables.`);
} finally {
  await sql.end();
}
