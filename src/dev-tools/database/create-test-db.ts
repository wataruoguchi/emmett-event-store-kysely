import { Kysely, Migrator, PostgresDialect, sql } from "kysely";
import type { DB } from "kysely-codegen";
import { Pool } from "pg";
import { ESMFileMigrationProvider } from "./ESMFileMigrationProvider.js";

export async function createTestDb(databaseName: string) {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env.DATABASE_URL,
      }),
    }),
  });

  await sql`DROP DATABASE IF EXISTS ${sql.raw(databaseName)}`.execute(db);
  await sql`CREATE DATABASE ${sql.raw(databaseName)}`.execute(db);

  const connectionString = process.env.DATABASE_URL?.replace(
    /\/[a-zA-Z0-9_]+$/,
    `/${databaseName}`,
  );
  const testDb = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
      }),
    }),
  });

  const migrator = new Migrator({
    db: testDb,
    provider: new ESMFileMigrationProvider(),
  });

  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw new Error(`Error migrating database: ${error}`);
  }

  return testDb;
}
