import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";

export type GeneratorRepository = ReturnType<typeof createGeneratorRepository>;
export function createGeneratorRepository({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  return {
    async findById(tenantId: string, generatorId: string) {
      logger.info({ tenantId, generatorId }, "findById");

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
      // TODO: This has to be deprecated
      logger.info({ tenantId }, "findByTenantId");

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
