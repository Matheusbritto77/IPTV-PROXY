import { readFile } from "node:fs/promises";
import { sql } from "../config/db";
import { logger } from "../config/logger";

function splitSqlStatements(source: string) {
  return source
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  const existingUserTable = await sql<
    { table_name: string | null }[]
  >`SELECT to_regclass('public."User"')::text AS table_name`;

  if (existingUserTable[0]?.table_name) {
    logger.info({ table: existingUserTable[0].table_name }, "init_migration_skipped");
    process.exit(0);
  }

  const migrationSql = await readFile(
    new URL("../../prisma/migrations/0001_init/migration.sql", import.meta.url),
    "utf8",
  );

  const statements = splitSqlStatements(migrationSql);

  for (const statement of statements) {
    await sql.unsafe(statement);
  }

  logger.info({ statements: statements.length }, "init_migration_applied");
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, "init_migration_failed");
  process.exit(1);
});
