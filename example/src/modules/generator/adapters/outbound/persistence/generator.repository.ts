/**
 * Generator Repository Adapter - Implements the outbound repository port
 * This is the persistence adapter using Kysely for read model queries
 */

import type { DatabaseExecutor } from "../../../../../modules/shared/infra/db.js";
import type { Logger } from "../../../../../modules/shared/infra/logger.js";
import type {
  GeneratorReadModel,
  GeneratorRepositoryPort,
} from "../../../application/ports/outbound/generator-repository.port.js";

export function createGeneratorRepository({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): GeneratorRepositoryPort {
  return {
    async findById(
      tenantId: string,
      generatorId: string,
    ): Promise<GeneratorReadModel | undefined> {
      logger.info({ tenantId, generatorId }, "generator.repository.findById");
      const result = await db
        .selectFrom("generators")
        .where("tenant_id", "=", tenantId)
        .where("generator_id", "=", generatorId)
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
      return result ? mapToReadModel(result) : undefined;
    },
    async findByTenantId(tenantId: string): Promise<GeneratorReadModel[]> {
      logger.info({ tenantId }, "generator.repository.findByTenantId");
      const results = await db
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
      return results.map(mapToReadModel);
    },
  };
}

function mapToReadModel(row: {
  tenant_id: string;
  generator_id: string;
  name: string | null;
  address: string | null;
  generator_type: string | null;
  notes: string | null;
  is_deleted: boolean | null;
  created: Date;
  updated: Date;
}): GeneratorReadModel {
  return {
    tenant_id: row.tenant_id,
    generator_id: row.generator_id,
    name: row.name ?? "",
    address: row.address,
    generator_type: row.generator_type,
    notes: row.notes,
    is_deleted: row.is_deleted ?? false,
    created: row.created,
    updated: row.updated,
  };
}
