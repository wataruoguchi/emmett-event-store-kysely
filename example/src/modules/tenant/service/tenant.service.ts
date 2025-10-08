import { Context, Effect, Layer, Schema } from "effect";
import type { DatabaseService } from "../../shared/infra/db.js";
import type { LoggerService } from "../../shared/infra/logger.js";
import {
  TenantEntitySchema,
  type TenantEntity,
} from "../domain/tenant.entity.js";
import { TenantInvalidInputError, TenantNotFoundError } from "../errors.js";
import {
  TenantRepositoryLayer,
  TenantRepositoryService,
  type DatabaseError,
} from "../repository/tenant.repo.js";

// Service tag
export class TenantService extends Context.Tag("TenantService")<
  TenantService,
  TenantServiceInterface
>() {}

export type TenantServiceInterface = {
  get: (
    tenantId: string,
  ) => Effect.Effect<
    TenantEntity,
    TenantNotFoundError | DatabaseError,
    DatabaseService | LoggerService | TenantRepositoryService
  >;
  getAll: () => Effect.Effect<
    TenantEntity[],
    DatabaseError,
    DatabaseService | LoggerService | TenantRepositoryService
  >;
  create: (input: {
    tenantId: string;
    name: string;
  }) => Effect.Effect<
    TenantEntity,
    TenantInvalidInputError | DatabaseError,
    DatabaseService | LoggerService | TenantRepositoryService
  >;
};

// Service implementation
const createTenantServiceImpl = (): TenantServiceInterface => ({
  get: (tenantId: string) =>
    Effect.gen(function* () {
      const repository = yield* TenantRepositoryService;

      const tenant = yield* repository.findById(tenantId);
      if (tenant) {
        return tenant;
      }

      const tenantByTenantId = yield* repository.findByTenantId(tenantId);
      if (tenantByTenantId) {
        return tenantByTenantId;
      }

      return yield* Effect.fail(
        new TenantNotFoundError(`Tenant not found: ${tenantId}`),
      );
    }),

  getAll: () =>
    Effect.gen(function* () {
      const repository = yield* TenantRepositoryService;
      return yield* repository.findAll();
    }),

  create: (input: { tenantId: string; name: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new TenantInvalidInputError("Input must be an object"),
        );
      }

      const tenantData = {
        ...input,
        id: crypto.randomUUID(),
      };

      const tenant =
        yield* Schema.decodeUnknown(TenantEntitySchema)(tenantData);
      const repository = yield* TenantRepositoryService;

      return yield* repository.create(tenant);
    }),
});

// Layer for the service
export const TenantServiceLayer = Layer.effect(
  TenantService,
  Effect.succeed(createTenantServiceImpl()).pipe(
    Effect.provide(TenantRepositoryLayer),
  ),
);
