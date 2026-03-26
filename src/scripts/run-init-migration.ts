import { readFile } from "node:fs/promises";

type SqlClient = Bun.SQL;

function splitSqlStatements(source: string) {
  return source
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function logInfo(message: string, payload?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", message, ...payload }));
}

function logError(message: string, payload?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", message, ...payload }));
}

function isIgnorableMigrationError(error: any) {
  const code = error?.code;
  return code === "42710" || code === "42P07";
}

async function executeStatements(sql: SqlClient, statements: string[]) {
  for (const statement of statements) {
    try {
      await sql.unsafe(statement);
    } catch (error: any) {
      if (isIgnorableMigrationError(error)) {
        logInfo("init_migration_statement_skipped", {
          code: error.code,
          statement: statement.slice(0, 120),
        });
        continue;
      }

      throw error;
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for migrate service");
  }

  const sql = new Bun.SQL(databaseUrl);

  try {
    const existingUserTable = await sql<
      { table_name: string | null }[]
    >`SELECT to_regclass('public."User"')::text AS table_name`;

    if (existingUserTable[0]?.table_name) {
      logInfo("init_migration_skipped", { table: existingUserTable[0].table_name });
      process.exit(0);
    }

    const migrationSql = await readFile(
      new URL("../../prisma/migrations/0001_init/migration.sql", import.meta.url),
      "utf8",
    );

    const statements = splitSqlStatements(migrationSql);
    await executeStatements(sql, statements);

    logInfo("init_migration_applied", { statements: statements.length });
    process.exit(0);
  } finally {
    const sqlClient = sql as any;
    if (typeof sqlClient.close === "function") {
      await sqlClient.close().catch(() => null);
    } else if (typeof sqlClient.end === "function") {
      await sqlClient.end().catch(() => null);
    }
  }
}

main().catch((error: any) => {
  logError("init_migration_failed", {
    code: error?.code,
    message: error?.message,
  });
  process.exit(1);
});
