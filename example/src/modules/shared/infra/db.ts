import { Context } from "effect";
import { Kysely, PostgresDialect } from "kysely";
import type { DB as DBType } from "kysely-codegen";
import { Pool } from "pg";

export type DatabaseExecutor = Kysely<DBType>;
const db = new Kysely<DBType>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
});

export function getDb() {
  return db;
}

export class DatabaseError extends Error {
  constructor({ message, cause }: { message: string; cause: unknown }) {
    super(message);
    this.name = "DatabaseError";
    this.cause = cause;
  }
}

export async function dbQuery<A>(run: () => Promise<A>, errorMessage: string) {
  try {
    return await run();
  } catch (error) {
    throw new DatabaseError({ message: errorMessage, cause: error });
  }
}

export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  DatabaseExecutor
>() {}
