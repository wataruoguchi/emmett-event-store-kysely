import type { DB } from "../../shared/infra/db.js";

export type GeneratorRepository = ReturnType<typeof createGeneratorRepository>;
export function createGeneratorRepository(db: DB) {
  return {
    async findById(tenantId: string, generatorId: string) {
      // TODO: We need to materialize our data into read models.
      // const generator = await db
      //   .selectFrom("generators")
      //   .where("generator_id", "=", generatorId)
      //   .selectAll()
      //   .executeTakeFirst();
      // return generator;
      return Promise.resolve({
        tenantId,
        generatorId,
        name: "Generator 1",
        address: "123 Main St",
        generatorType: "Generator Type 1",
        notes: "Notes 1",
      });
    },
    async findByTenantId(tenantId: string) {
      return Promise.resolve([
        {
          tenantId,
          generatorId: "1",
          name: "Generator 1",
          address: "123 Main St",
          generatorType: "Generator Type 1",
          notes: "Notes 1",
        },
        {
          tenantId,
          generatorId: "2",
          name: "Generator 2",
          address: "456 Main St",
          generatorType: "Generator Type 2",
          notes: "Notes 2",
        },
      ]);
    },
  };
}
