import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "../../shared/infra/db.js";
import { LoggerService } from "../../shared/infra/logger.js";
import type { TenantEntity } from "../domain/tenant.entity.js";

// Repository service tag
export class TenantRepositoryService extends Context.Tag(
  "TenantRepositoryService",
)<TenantRepositoryService, TenantRepository>() {}

export type TenantRepository = {
  findById: (
    id: string,
  ) => Effect.Effect<
    TenantEntity | null,
    DatabaseError,
    DatabaseService | LoggerService
  >;
  findByTenantId: (
    tenantId: string,
  ) => Effect.Effect<
    TenantEntity | null,
    DatabaseError,
    DatabaseService | LoggerService
  >;
  findAll: () => Effect.Effect<
    TenantEntity[],
    DatabaseError,
    DatabaseService | LoggerService
  >;
  create: (
    tenant: TenantEntity,
  ) => Effect.Effect<
    TenantEntity,
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
const createTenantRepositoryImpl = (): TenantRepository => ({
  findById: (id: string) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ id }, "findById");

      const result = yield* Effect.tryPromise({
        try: () =>
          db
            .selectFrom("tenants")
            .where("id", "=", id)
            .selectAll()
            .executeTakeFirst(),
        catch: (error) =>
          new DatabaseError(`Failed to find tenant by id: ${id}`, error),
      });

      return result
        ? {
            id: result.id,
            tenantId: result.tenant_id,
            name: result.name,
          }
        : null;
    }),

  findByTenantId: (tenantId: string) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ tenantId }, "findByTenantId");

      const result = yield* Effect.tryPromise({
        try: () =>
          db
            .selectFrom("tenants")
            .where("tenant_id", "=", tenantId)
            .selectAll()
            .executeTakeFirst(),
        catch: (error) =>
          new DatabaseError(
            `Failed to find tenant by tenantId: ${tenantId}`,
            error,
          ),
      });

      return result
        ? {
            id: result.id,
            tenantId: result.tenant_id,
            name: result.name,
          }
        : null;
    }),

  findAll: () =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({}, "findAll");

      const results = yield* Effect.tryPromise({
        try: () => db.selectFrom("tenants").selectAll().execute(),
        catch: (error) =>
          new DatabaseError("Failed to find all tenants", error),
      });

      return results.map((result) => ({
        id: result.id,
        tenantId: result.tenant_id,
        name: result.name,
      }));
    }),

  create: (tenant: TenantEntity) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ tenant }, "create");

      const result = yield* Effect.tryPromise({
        try: () =>
          db
            .insertInto("tenants")
            .values({
              id: tenant.id,
              tenant_id: tenant.tenantId,
              name: tenant.name,
            })
            .returning(["id", "tenant_id", "name"])
            .executeTakeFirstOrThrow(),
        catch: (error) =>
          new DatabaseError(`Failed to create tenant: ${tenant.id}`, error),
      });

      return {
        id: result.id,
        tenantId: result.tenant_id,
        name: result.name,
      };
    }),
});

// Layer for the repository
export const TenantRepositoryLayer = Layer.succeed(
  TenantRepositoryService,
  createTenantRepositoryImpl(),
);
