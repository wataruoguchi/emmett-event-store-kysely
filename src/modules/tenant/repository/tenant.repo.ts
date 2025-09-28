import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { TenantEntity } from "../domain/tenant.entity.js";

export type TenantRepository = ReturnType<typeof createTenantRepository>;
export function createTenantRepository(db: DatabaseExecutor) {
  return {
    async findById(id: string) {
      return db
        .selectFrom("tenants")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
    },
    async findByTenantId(tenantId: string) {
      return db
        .selectFrom("tenants")
        .where("tenant_id", "=", tenantId)
        .selectAll()
        .executeTakeFirst();
    },
    async findAll() {
      return db.selectFrom("tenants").selectAll().execute();
    },
    async create(tenant: TenantEntity) {
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
