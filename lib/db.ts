import postgres, { type Sql } from "postgres";

let sql: Sql | undefined;

export function getSql() {
  if (sql) {
    return sql;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Attn database access.");
  }

  sql = postgres(databaseUrl, {
    prepare: false
  });

  return sql;
}

export async function checkDatabaseConnection() {
  await getSql()`select 1`;
}
