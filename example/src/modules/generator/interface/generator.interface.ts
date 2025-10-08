import { createEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { Effect, Layer, Schema } from "effect";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  createContextMiddleware,
  getContext,
} from "../../shared/hono/context-middleware.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import { DatabaseService } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import { LoggerService } from "../../shared/infra/logger.js";
import { GeneratorEntitySchema } from "../domain/generator.entity.js";
import { GeneratorNotFoundError } from "../errors.js";
import {
  DatabaseError,
  GeneratorRepositoryLayer,
} from "../repository/generator.repo.js";
import { generatorEventHandler } from "../service/event-sourcing/generator.event-handler.js";
import {
  GeneratorService,
  GeneratorServiceLayer,
} from "../service/generator.service.js";

// Infrastructure layer for dependencies
const createInfrastructureLayer = (db: DatabaseExecutor, logger: Logger) =>
  Layer.mergeAll(
    Layer.succeed(DatabaseService, db),
    Layer.succeed(LoggerService, logger),
  );

/**
 * Create a generator app using Effect Layer system with event sourcing.
 */
export function createGeneratorApp({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  const app = new Hono();

  // Create event store
  const eventStore = createEventStore({ db, logger });

  // Create the complete layer
  const AppLayer = Layer.mergeAll(
    createInfrastructureLayer(db, logger),
    GeneratorRepositoryLayer,
    GeneratorServiceLayer(eventStore), // Pass eventStore to GeneratorServiceLayer
  );

  app.use(createContextMiddleware());

  app.get("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");

    const program = Effect.gen(function* () {
      const generatorService = yield* GeneratorService;
      return yield* generatorService.getAll({ tenantId });
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

    return c.json(
      result.map((generator) => ({
        tenant_id: generator.tenantId,
        generator_id: generator.generatorId,
        name: generator.name,
        address: generator.address,
        generator_type: generator.generatorType,
        notes: generator.notes,
        is_deleted: generator.isDeleted ?? false,
      })),
    );
  });

  app.get("/api/tenants/:tenantId/generators/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");

    const program = Effect.gen(function* () {
      const generatorService = yield* GeneratorService;
      return yield* generatorService.get({ tenantId, generatorId: id });
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(AppLayer),
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> => {
            if (error instanceof GeneratorNotFoundError) {
              return Effect.succeed({
                error: "Generator not found",
                status: 404,
              });
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

    return c.json({
      tenant_id: result.tenantId,
      generator_id: result.generatorId,
      name: result.name,
      address: result.address,
      generator_type: result.generatorType,
      notes: result.notes,
      is_deleted: result.isDeleted ?? false,
    });
  });

  app.post("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");
    const rawData = await c.req.json();
    const generatorId = crypto.randomUUID();

    // Validate POST body with Effect Schema
    const program = Effect.gen(function* () {
      const validatedData = yield* Schema.decodeUnknown(GeneratorEntitySchema)({
        ...rawData,
        generatorId,
        tenantId,
      }).pipe(
        Effect.mapError(
          (error) => new Error(`Invalid generator data: ${error}`),
        ),
      );

      // Use event handler for generator creation
      return yield* Effect.tryPromise({
        try: () =>
          generatorEventHandler({ eventStore, getContext }).create(
            generatorId,
            validatedData,
          ),
        catch: (error) => new Error(`Failed to create generator: ${error}`),
      });
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> =>
            Effect.succeed({ error: error.message, status: 400 }),
        ),
      ),
    );

    if (!!result && "error" in result) {
      return c.json({ message: result.error }, result.status);
    }

    return c.json({ message: "Created!", generator_id: generatorId }, 201);
  });

  app.put("/api/tenants/:tenantId/generators/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const rawData = await c.req.json();

    const GeneratorUpdateSchema = Schema.Struct({
      isDeleted: Schema.optional(Schema.Boolean),
      name: Schema.optional(Schema.String),
      address: Schema.optional(Schema.String),
      generatorType: Schema.optional(Schema.String),
      notes: Schema.optional(Schema.String),
    });

    // Validate PUT body with Effect Schema
    const program = Effect.gen(function* () {
      const validatedData = yield* Schema.decodeUnknown(GeneratorUpdateSchema)(
        rawData,
      ).pipe(
        Effect.mapError(
          (error) => new Error(`Invalid generator data: ${error}`),
        ),
      );

      if (validatedData.isDeleted) {
        // Use event handler for generator deletion
        return yield* Effect.tryPromise({
          try: () =>
            generatorEventHandler({ eventStore, getContext }).delete(id, {
              tenantId,
              generatorId: id,
            }),
          catch: (error) => new Error(`Failed to delete generator: ${error}`),
        });
      } else {
        // Use event handler for generator update - only pass the fields that were provided
        const updateData = {
          tenantId,
          generatorId: id,
          ...(validatedData.name && { name: validatedData.name }),
          ...(validatedData.address !== undefined && {
            address: validatedData.address,
          }),
          ...(validatedData.generatorType && {
            generatorType: validatedData.generatorType,
          }),
          ...(validatedData.notes !== undefined && {
            notes: validatedData.notes,
          }),
        };

        return yield* Effect.tryPromise({
          try: () =>
            generatorEventHandler({ eventStore, getContext }).update(
              id,
              // @ts-expect-error many fields should be optional in the event handler. // TODO: Fix it
              updateData,
            ),
          catch: (error) => new Error(`Failed to update generator: ${error}`),
        });
      }
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> =>
            Effect.succeed({ error: error.message, status: 400 }),
        ),
      ),
    );

    if ("error" in result) {
      return c.json({ message: result.error }, result.status);
    }

    const message = rawData.isDeleted ? "Deleted!" : "Updated!";
    return c.json({ message }, 201);
  });

  return app;
}
