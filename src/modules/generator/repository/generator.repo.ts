import type { DatabaseExecutor } from "../../shared/infra/db.js";

export type GeneratorRepository = ReturnType<typeof createGeneratorRepository>;
export function createGeneratorRepository(db: DatabaseExecutor) {
  return {
    async findById(tenantId: string, generatorId: string) {
      // TODO: We need to materialize our data into read models.
      return await db
        .selectFrom("generators")
        .where("generator_id", "=", generatorId)
        .where("tenant_id", "=", tenantId)
        .select([
          "tenant_id",
          "generator_id",
          "name",
          "address",
          "generator_type",
          "notes",
          "is_deleted",
          "created",
          "updated",
        ])
        .executeTakeFirst();
    },
    async findByTenantId(tenantId: string) {
      return await db
        .selectFrom("generators")
        .where("tenant_id", "=", tenantId)
        .select([
          "tenant_id",
          "generator_id",
          "name",
          "address",
          "generator_type",
          "notes",
          "is_deleted",
          "created",
          "updated",
        ])
        .execute();
    },
  };
}
