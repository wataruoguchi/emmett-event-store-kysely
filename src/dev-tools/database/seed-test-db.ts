import { faker } from "@faker-js/faker";
import { sql } from "kysely";
import type { DatabaseExecutor } from "../../modules/shared/infra/db.js";
import { createTenantService } from "../../modules/tenant/tenant.index.js";
export function seedTestDb(db: DatabaseExecutor) {
  const tenantService = createTenantService({ db });

  return {
    async createTenant(_name?: string) {
      const name = _name || faker.company.name();
      const tenantId = name.toLowerCase().replace(/ /g, "_");
      const { id } = await tenantService.create({
        tenantId,
        name,
      });
      await createPartitionedTables(db, id);
      return { id, tenantId };
    },
  };
}

// TODO: This needs to be moved/injected into the tenant service.
async function createPartitionedTables(db: DatabaseExecutor, tenantId: string) {
  const ident = tenantId.replace(/[^a-zA-Z0-9_]/g, "_");
  const literal = tenantId.replace(/'/g, "''");
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS streams_${ident} PARTITION OF streams FOR VALUES IN ('${literal}')`,
    )
    .execute(db);
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS messages_${ident} PARTITION OF messages FOR VALUES IN ('${literal}')`,
    )
    .execute(db);
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS subscriptions_${ident} PARTITION OF subscriptions FOR VALUES IN ('${literal}')`,
    )
    .execute(db);
}
