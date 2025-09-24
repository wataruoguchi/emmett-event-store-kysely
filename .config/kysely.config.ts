import { PostgresDialect } from "kysely";
import { defineConfig } from "kysely-ctl";
import path from "node:path";
import { Pool } from "pg";

const ROOT = process.cwd();
export const MIGRATIONS_DIR = path.resolve(ROOT, "database/migrations");

export default defineConfig({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  }),
  migrations: {
    migrationFolder: MIGRATIONS_DIR,
  },
  //   plugins: [],
  //   seeds: {
  //     seedFolder: "seeds",
  //   }
});
