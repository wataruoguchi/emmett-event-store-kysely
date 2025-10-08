import type { EventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { Context, Effect, Layer, Schema } from "effect";
import { getContext } from "../../shared/hono/context-middleware.js";
import type { DatabaseService } from "../../shared/infra/db.js";
import type { LoggerService } from "../../shared/infra/logger.js";
import {
  GeneratorEntitySchema,
  type GeneratorEntity,
} from "../domain/generator.entity.js";
import {
  GeneratorInvalidInputError,
  GeneratorNotFoundError,
  type GeneratorTenantNotFoundError,
} from "../errors.js";
import {
  DatabaseError,
  GeneratorRepositoryLayer,
  GeneratorRepositoryService,
} from "../repository/generator.repo.js";
import { generatorEventHandler } from "./event-sourcing/generator.event-handler.js";

// Service tag
export class GeneratorService extends Context.Tag("GeneratorService")<
  GeneratorService,
  GeneratorServiceInterface
>() {}

export type GeneratorServiceInterface = {
  create: (input: {
    tenantId: string;
    name: string;
    address?: string;
    generatorType?: string;
    notes?: string;
  }) => Effect.Effect<
    GeneratorEntity,
    GeneratorInvalidInputError | GeneratorTenantNotFoundError | DatabaseError,
    DatabaseService | LoggerService | GeneratorRepositoryService
  >;
  update: (input: {
    tenantId: string;
    generatorId: string;
    name: string;
    address?: string;
    generatorType?: string;
    notes?: string;
  }) => Effect.Effect<
    GeneratorEntity,
    | GeneratorInvalidInputError
    | GeneratorTenantNotFoundError
    | GeneratorNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | GeneratorRepositoryService
  >;
  delete: (input: {
    tenantId: string;
    generatorId: string;
  }) => Effect.Effect<
    GeneratorEntity,
    | GeneratorInvalidInputError
    | GeneratorTenantNotFoundError
    | GeneratorNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | GeneratorRepositoryService
  >;
  get: (input: {
    tenantId: string;
    generatorId: string;
  }) => Effect.Effect<
    GeneratorEntity,
    | GeneratorInvalidInputError
    | GeneratorTenantNotFoundError
    | GeneratorNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | GeneratorRepositoryService
  >;
  getAll: (input: {
    tenantId: string;
  }) => Effect.Effect<
    GeneratorEntity[],
    GeneratorInvalidInputError | GeneratorTenantNotFoundError | DatabaseError,
    DatabaseService | LoggerService | GeneratorRepositoryService
  >;
};

// Service implementation
const createGeneratorServiceImpl = (
  eventStore: EventStore,
): GeneratorServiceInterface => ({
  create: (input: {
    tenantId: string;
    name: string;
    address?: string;
    generatorType?: string;
    notes?: string;
  }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new GeneratorInvalidInputError("Input must be an object"),
        );
      }

      const generatorId = crypto.randomUUID();
      const generatorData = {
        tenantId: input.tenantId,
        generatorId,
        name: input.name,
        address: input.address,
        generatorType: input.generatorType,
        notes: input.notes,
      };

      const generator = yield* Schema.decodeUnknown(GeneratorEntitySchema)(
        generatorData,
      ).pipe(
        Effect.mapError(
          (error) =>
            new GeneratorInvalidInputError(`Invalid generator data: ${error}`),
        ),
      );

      // Use event handler for generator creation
      const handler = generatorEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () => handler.create(generatorId, generator),
        catch: (error) =>
          new DatabaseError(`Failed to create generator: ${error}`),
      });

      return generator;
    }),

  update: (input: {
    tenantId: string;
    generatorId: string;
    name: string;
    address?: string;
    generatorType?: string;
    notes?: string;
  }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new GeneratorInvalidInputError("Input must be an object"),
        );
      }

      const generator = yield* Schema.decodeUnknown(GeneratorEntitySchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new GeneratorInvalidInputError(`Invalid generator data: ${error}`),
        ),
      );

      // Check if generator exists
      const repository = yield* GeneratorRepositoryService;
      const existingGenerator = yield* repository.findById(
        input.tenantId,
        input.generatorId,
      );

      if (!existingGenerator) {
        return yield* Effect.fail(
          new GeneratorNotFoundError("Generator not found"),
        );
      }

      // Use event handler for generator update
      const handler = generatorEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () => handler.update(input.generatorId, generator),
        catch: (error) =>
          new DatabaseError(`Failed to update generator: ${error}`),
      });

      return generator;
    }),

  delete: (input: { tenantId: string; generatorId: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new GeneratorInvalidInputError("Input must be an object"),
        );
      }

      // Validate the delete input
      const DeleteGeneratorSchema = Schema.Struct({
        tenantId: Schema.String,
        generatorId: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(DeleteGeneratorSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new GeneratorInvalidInputError(
              `Invalid delete generator data: ${error}`,
            ),
        ),
      );

      // Check if generator exists
      const repository = yield* GeneratorRepositoryService;
      const existingGenerator = yield* repository.findById(
        validatedInput.tenantId,
        validatedInput.generatorId,
      );

      if (!existingGenerator) {
        return yield* Effect.fail(
          new GeneratorNotFoundError("Generator not found"),
        );
      }

      // Use event handler for generator deletion
      const handler = generatorEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.delete(validatedInput.generatorId, {
            tenantId: validatedInput.tenantId,
            generatorId: validatedInput.generatorId,
          }),
        catch: (error) =>
          new DatabaseError(`Failed to delete generator: ${error}`),
      });

      return existingGenerator;
    }),

  get: (input: { tenantId: string; generatorId: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new GeneratorInvalidInputError("Input must be an object"),
        );
      }

      // Validate the get input
      const GetGeneratorSchema = Schema.Struct({
        tenantId: Schema.String,
        generatorId: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(GetGeneratorSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new GeneratorInvalidInputError(
              `Invalid get generator data: ${error}`,
            ),
        ),
      );

      const repository = yield* GeneratorRepositoryService;
      const generator = yield* repository.findById(
        validatedInput.tenantId,
        validatedInput.generatorId,
      );

      if (!generator) {
        return yield* Effect.fail(
          new GeneratorNotFoundError("Generator not found"),
        );
      }

      return generator;
    }),

  getAll: (input: { tenantId: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new GeneratorInvalidInputError("Input must be an object"),
        );
      }

      // Validate the getAll input
      const GetAllGeneratorsSchema = Schema.Struct({
        tenantId: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(
        GetAllGeneratorsSchema,
      )(input).pipe(
        Effect.mapError(
          (error) =>
            new GeneratorInvalidInputError(
              `Invalid getAll generators data: ${error}`,
            ),
        ),
      );

      const repository = yield* GeneratorRepositoryService;
      return yield* repository.findByTenantId(validatedInput.tenantId);
    }),
});

// Layer for the service
export const GeneratorServiceLayer = (eventStore: EventStore) =>
  Layer.effect(
    GeneratorService,
    Effect.succeed(createGeneratorServiceImpl(eventStore)).pipe(
      Effect.provide(GeneratorRepositoryLayer),
    ),
  );
