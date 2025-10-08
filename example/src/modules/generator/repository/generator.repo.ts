import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "../../shared/infra/db.js";
import { LoggerService } from "../../shared/infra/logger.js";
import type { GeneratorEntity } from "../domain/generator.entity.js";

// Repository service tag
export class GeneratorRepositoryService extends Context.Tag(
  "GeneratorRepositoryService",
)<GeneratorRepositoryService, GeneratorRepository>() {}

export type GeneratorRepository = {
  findById: (
    tenantId: string,
    generatorId: string,
  ) => Effect.Effect<
    GeneratorEntity | null,
    DatabaseError,
    DatabaseService | LoggerService
  >;
  findByTenantId: (
    tenantId: string,
  ) => Effect.Effect<
    GeneratorEntity[],
    DatabaseError,
    DatabaseService | LoggerService
  >;
};

// Database error type
export class DatabaseError extends Error {
  readonly _tag = "DatabaseError";
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

// Repository implementation
const createGeneratorRepositoryImpl = (): GeneratorRepository => ({
  findById: (tenantId: string, generatorId: string) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ tenantId, generatorId }, "generator.findById");

      const result = yield* Effect.tryPromise({
        try: () =>
          db
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
            .executeTakeFirst(),
        catch: (error) =>
          new DatabaseError(
            `Failed to find generator by id: ${tenantId}/${generatorId}`,
            error,
          ),
      });

      return result
        ? {
            tenantId: result.tenant_id,
            generatorId: result.generator_id,
            name: result.name,
            address: result.address ?? undefined,
            generatorType: result.generator_type as
              | "commercial"
              | "residential"
              | "industrial"
              | "agricultural"
              | "other"
              | undefined,
            notes: result.notes ?? undefined,
            isDeleted: result.is_deleted,
          }
        : null;
    }),

  findByTenantId: (tenantId: string) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ tenantId }, "generator.findByTenantId");

      const results = yield* Effect.tryPromise({
        try: () =>
          db
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
            .execute(),
        catch: (error) =>
          new DatabaseError(
            `Failed to find generators by tenant id: ${tenantId}`,
            error,
          ),
      });

      return results.map((result) => ({
        tenantId: result.tenant_id,
        generatorId: result.generator_id,
        name: result.name,
        address: result.address ?? undefined,
        generatorType: result.generator_type as
          | "commercial"
          | "residential"
          | "industrial"
          | "agricultural"
          | "other"
          | undefined,
        notes: result.notes ?? undefined,
        isDeleted: result.is_deleted,
      }));
    }),
});

// Layer for the repository
export const GeneratorRepositoryLayer = Layer.succeed(
  GeneratorRepositoryService,
  createGeneratorRepositoryImpl(),
);
