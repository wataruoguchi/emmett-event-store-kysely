// biome-ignore assist/source/organizeImports: The editor does not behave correctly with this import
import type { Migration, MigrationProvider } from "kysely";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MIGRATIONS_DIR } from "../../../.config/kysely.config.js";

// https://github.com/kysely-org/kysely/issues/277
export class ESMFileMigrationProvider implements MigrationProvider {
  constructor(private overridePath?: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};
    const basePath = this.overridePath ?? MIGRATIONS_DIR;
    const resolvedPath = path.resolve(basePath);

    const files = await fs.readdir(resolvedPath);
    if (files?.length === 0) {
      throw new Error(`No migrations found in ${resolvedPath}`);
    }
    for (const fileName of files) {
      const filePath = path.join(resolvedPath, fileName);
      const moduleUrl = pathToFileURL(filePath).href;
      const migration = await import(moduleUrl);
      const migrationKey = fileName.substring(0, fileName.lastIndexOf("."));

      migrations[migrationKey] = migration;
    }

    return migrations;
  }
}
