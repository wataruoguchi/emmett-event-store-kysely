/**
 * Tenant Repository Adapter - Implements the outbound repository port
 * This is the persistence adapter using Kysely
 */

import type { DatabaseExecutor } from "../../../../../modules/shared/infra/db.js";
import type { Logger } from "../../../../../modules/shared/infra/logger.js";
import type { TenantRepositoryPort } from "../../../application/ports/outbound/tenant-repository.port.js";
import type { TenantEntity } from "../../../domain/tenant.entity.js";

export function createTenantRepository({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): TenantRepositoryPort {
  return {
    async findById(id: string) {
      logger.info({ id }, "tenant.repository.findById");
      const result = await db
        .selectFrom("tenants")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return result ? mapToEntity(result) : undefined;
    },
    async findByTenantId(tenantId: string) {
      logger.info({ tenantId }, "tenant.repository.findByTenantId");
      const result = await db
        .selectFrom("tenants")
        .where("tenant_id", "=", tenantId)
        .selectAll()
        .executeTakeFirst();
      return result ? mapToEntity(result) : undefined;
    },
    async findAll() {
      logger.info({}, "tenant.repository.findAll");
      const results = await db.selectFrom("tenants").selectAll().execute();
      return results.map(mapToEntity);
    },
    async create(tenant: TenantEntity) {
      logger.info({ tenant }, "tenant.repository.create");
      const result = await db
        .insertInto("tenants")
        .values({
          id: tenant.id,
          tenant_id: tenant.tenantId,
          name: tenant.name,
        })
        .returning(["id", "tenant_id", "name"])
        .executeTakeFirstOrThrow();
      return mapToEntity(result);
    },
  };
}

function mapToEntity(row: {
  id: string;
  tenant_id: string;
  name: string;
}): TenantEntity {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
  };
}
