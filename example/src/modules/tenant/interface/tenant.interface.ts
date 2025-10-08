import { Effect, Layer } from "effect";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  DatabaseService,
  type DatabaseExecutor,
} from "../../shared/infra/db.js";
import { LoggerService, type Logger } from "../../shared/infra/logger.js";
import { TenantInvalidInputError, TenantNotFoundError } from "../errors.js";
import {
  DatabaseError,
  TenantRepositoryLayer,
} from "../repository/tenant.repo.js";
import {
  TenantService,
  TenantServiceLayer,
} from "../service/tenant.service.js";

// Infrastructure layer for dependencies
const createInfrastructureLayer = (db: DatabaseExecutor, logger: Logger) =>
  Layer.mergeAll(
    Layer.succeed(DatabaseService, db),
    Layer.succeed(LoggerService, logger),
  );

/**
 * Create a tenant app using Effect Layer system.
 */
export function createTenantApp({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  const app = new Hono();

  // Create the complete layer
  const AppLayer = Layer.mergeAll(
    createInfrastructureLayer(db, logger),
    TenantRepositoryLayer,
    TenantServiceLayer,
  );

  app.get("/api/tenants", async (c) => {
    const program = Effect.gen(function* () {
      const tenantService = yield* TenantService;
      return yield* tenantService.getAll();
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(AppLayer),
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> => {
            if (error instanceof DatabaseError) {
              return Effect.succeed({ error: "Database error", status: 500 });
            }
            return Effect.succeed({
              error: "Internal server error",
              status: 500,
            });
          },
        ),
      ),
    );

    if ("error" in result) {
      return c.json({ message: result.error }, result.status);
    }

    // Transform TenantEntity to API response format
    const apiResult = result.map((tenant) => ({
      id: tenant.id,
      tenant_id: tenant.tenantId,
      name: tenant.name,
    }));

    return c.json(apiResult);
  });

  app.get("/api/tenants/:id", async (c) => {
    const id = c.req.param("id");

    const program = Effect.gen(function* () {
      const tenantService = yield* TenantService;
      return yield* tenantService.get(id);
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(AppLayer),
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> => {
            if (error instanceof TenantNotFoundError) {
              return Effect.succeed({ error: "Tenant not found", status: 404 });
            }
            if (error instanceof DatabaseError) {
              return Effect.succeed({ error: "Database error", status: 500 });
            }
            return Effect.succeed({
              error: "Internal server error",
              status: 500,
            });
          },
        ),
      ),
    );

    if ("error" in result) {
      return c.json({ message: result.error }, result.status);
    }

    // Transform TenantEntity to API response format
    const apiResult = {
      id: result.id,
      tenant_id: result.tenantId,
      name: result.name,
    };

    return c.json(apiResult);
  });

  app.post("/api/tenants", async (c) => {
    const data = await c.req.json();

    const program = Effect.gen(function* () {
      const tenantService = yield* TenantService;
      return yield* tenantService.create(data);
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(AppLayer),
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> => {
            if (error instanceof TenantInvalidInputError) {
              return Effect.succeed({ error: "Invalid input", status: 400 });
            }
            if (error instanceof DatabaseError) {
              return Effect.succeed({ error: "Database error", status: 500 });
            }
            return Effect.succeed({
              error: "Internal server error",
              status: 500,
            });
          },
        ),
      ),
    );

    if ("error" in result) {
      return c.json({ message: result.error }, result.status);
    }

    // Transform TenantEntity to API response format
    const apiResult = {
      id: result.id,
      tenant_id: result.tenantId,
      name: result.name,
    };

    return c.json(apiResult, 201);
  });

  return app;
}
