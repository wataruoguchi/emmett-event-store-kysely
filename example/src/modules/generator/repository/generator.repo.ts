import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";

export type GeneratorRepository = ReturnType<typeof createGeneratorRepository>;
/**
 * Create a generator repository. This file has all the database logic for the generator repository.
 */
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
      /**
       * "generators" table is a Read Model for the generator aggregate.
       * Read model is a table that is populated by the event stream. It doesn't get updated in real-time.
       */
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
