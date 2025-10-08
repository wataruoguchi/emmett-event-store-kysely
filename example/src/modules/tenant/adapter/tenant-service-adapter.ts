import { Effect, Layer } from "effect";
import {
  DatabaseService,
  type DatabaseExecutor,
} from "../../shared/infra/db.js";
import { LoggerService, type Logger } from "../../shared/infra/logger.js";
import { TenantRepositoryLayer } from "../repository/tenant.repo.js";
import {
  TenantService,
  TenantServiceLayer,
} from "../service/tenant.service.js";

/**
 * Adapter that provides the legacy TenantService interface
 * while wrapping the Effect-based implementation underneath.
 * This allows other modules to use the tenant service without
 * needing to know about Effect's implementation details.
 */
export function createTenantServiceAdapter({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  // Create the complete Effect Layer
  const AppLayer = Layer.mergeAll(
    Layer.succeed(DatabaseService, db),
    Layer.succeed(LoggerService, logger),
    TenantRepositoryLayer,
    TenantServiceLayer,
  );

  return {
    /**
     * Get a tenant by ID or tenant_id
     */
    async get(tenantId: string) {
      const program = Effect.gen(function* () {
        const tenantService = yield* TenantService;
        return yield* tenantService.get(tenantId);
      });

      return await Effect.runPromise(program.pipe(Effect.provide(AppLayer)));
    },

    /**
     * Get all tenants
     */
    async getAll() {
      const program = Effect.gen(function* () {
        const tenantService = yield* TenantService;
        return yield* tenantService.getAll();
      });

      return await Effect.runPromise(program.pipe(Effect.provide(AppLayer)));
    },

    /**
     * Create a new tenant
     */
    async create(input: { tenantId: string; name: string }) {
      const program = Effect.gen(function* () {
        const tenantService = yield* TenantService;
        return yield* tenantService.create(input);
      });

      return await Effect.runPromise(program.pipe(Effect.provide(AppLayer)));
    },
  };
}

/**
 * Type that matches the expected TenantService interface
 * for backward compatibility with cart and generator modules
 */
export type TenantServiceAdapter = ReturnType<
  typeof createTenantServiceAdapter
>;
