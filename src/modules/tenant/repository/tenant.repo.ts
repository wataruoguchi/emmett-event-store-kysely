import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import type { TenantEntity } from "../domain/tenant.entity.js";

export type TenantRepository = ReturnType<typeof createTenantRepository>;
export function createTenantRepository({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  return {
    async findById(id: string) {
      logger.info({ id }, "findById");
      return db
        .selectFrom("tenants")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
    },
    async findByTenantId(tenantId: string) {
      logger.info({ tenantId }, "findByTenantId");
      return db
        .selectFrom("tenants")
        .where("tenant_id", "=", tenantId)
        .selectAll()
        .executeTakeFirst();
    },
    async findAll() {
      logger.info({}, "findAll");
      return db.selectFrom("tenants").selectAll().execute();
    },
    async create(tenant: TenantEntity) {
      logger.info({ tenant }, "create");
      return await db
        .insertInto("tenants")
        .values({
          id: tenant.id,
          tenant_id: tenant.tenantId,
          name: tenant.name,
        })
        .returning(["id", "tenant_id"])
        .executeTakeFirstOrThrow();
    },
  };
}
