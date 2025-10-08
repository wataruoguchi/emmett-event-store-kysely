import { Effect, Layer, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { GeneratorEntitySchema } from "../domain/generator.entity.js";
import {
  GeneratorInvalidInputError,
  GeneratorNotFoundError,
} from "../errors.js";
import { DatabaseError } from "../repository/generator.repo.js";

describe("Generator Module Unit Tests", () => {
  describe("Effect Schema Validation", () => {
    it("should validate correct generator data", () => {
      const validGenerator = {
        tenantId: "tenant1",
        generatorId: "550e8400-e29b-41d4-a716-446655440000", // Valid UUID
        name: "Generator 1",
        address: "123 Main St",
        generatorType: "commercial",
        notes: "Test generator",
        isDeleted: false,
      };

      const result = Effect.runSync(
        Schema.decodeUnknown(GeneratorEntitySchema)(validGenerator),
      );

      expect(result).toEqual(validGenerator);
    });

    it("should reject invalid generator data", () => {
      const invalidGenerator = {
        tenantId: "tenant1",
        generatorId: "not-a-uuid", // Invalid: not a UUID
        name: "Generator 1",
      };

      const result = Effect.runSyncExit(
        Schema.decodeUnknown(GeneratorEntitySchema)(invalidGenerator),
      );

      expect(result._tag).toBe("Failure");
    });

    it("should validate generator type enum", () => {
      const validTypes = [
        "commercial",
        "residential",
        "industrial",
        "agricultural",
        "other",
      ];

      validTypes.forEach((type) => {
        const generator = {
          tenantId: "tenant1",
          generatorId: "550e8400-e29b-41d4-a716-446655440000",
          name: "Generator 1",
          generatorType: type,
        };

        const result = Effect.runSyncExit(
          Schema.decodeUnknown(GeneratorEntitySchema)(generator),
        );

        expect(result._tag).toBe("Success");
      });
    });

    it("should reject invalid generator type", () => {
      const invalidGenerator = {
        tenantId: "tenant1",
        generatorId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Generator 1",
        generatorType: "invalid-type",
      };

      const result = Effect.runSyncExit(
        Schema.decodeUnknown(GeneratorEntitySchema)(invalidGenerator),
      );

      expect(result._tag).toBe("Failure");
    });
  });

  describe("Effect Error Handling", () => {
    it("should handle GeneratorNotFoundError properly", () => {
      const program = Effect.fail(
        new GeneratorNotFoundError("Generator not found"),
      );

      const result = Effect.runSyncExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(GeneratorNotFoundError);
          expect(result.cause.error.message).toBe("Generator not found");
        }
      }
    });

    it("should handle GeneratorInvalidInputError properly", () => {
      const program = Effect.fail(
        new GeneratorInvalidInputError("Invalid input"),
      );

      const result = Effect.runSyncExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(GeneratorInvalidInputError);
          expect(result.cause.error.message).toBe("Invalid input");
        }
      }
    });

    it("should handle DatabaseError properly", () => {
      const program = Effect.fail(
        new DatabaseError("Database connection failed"),
      );

      const result = Effect.runSyncExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(DatabaseError);
          expect(result.cause.error.message).toBe("Database connection failed");
        }
      }
    });
  });

  describe("Effect Schema Transformations", () => {
    it("should transform generator data with Schema", () => {
      const inputData = {
        tenantId: "tenant1",
        generatorId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Generator 1",
        address: "123 Main St",
        generatorType: "commercial",
        notes: "Test generator",
        isDeleted: false,
      };

      const program = Effect.gen(function* () {
        const validated = yield* Schema.decodeUnknown(GeneratorEntitySchema)(
          inputData,
        );
        return {
          ...validated,
          displayName: `${validated.name} (${validated.generatorType})`,
          isActive: !validated.isDeleted,
        };
      });

      const result = Effect.runSync(program);

      expect(result.displayName).toBe("Generator 1 (commercial)");
      expect(result.isActive).toBe(true);
    });
  });

  describe("Effect Error Recovery", () => {
    it("should recover from errors with fallback", () => {
      const program = Effect.gen(function* () {
        const result = yield* Effect.fail(
          new GeneratorNotFoundError("Generator not found"),
        ).pipe(
          Effect.catchAll(() =>
            Effect.succeed({ name: "Default Generator", isActive: false }),
          ),
        );
        return result;
      });

      const result = Effect.runSync(program);

      expect(result).toEqual({ name: "Default Generator", isActive: false });
    });

    it("should handle specific error types", () => {
      const program = Effect.gen(function* () {
        const result = yield* Effect.fail(
          new GeneratorNotFoundError("Not found"),
        ).pipe(
          Effect.catchAll((error) => {
            if (error instanceof GeneratorNotFoundError) {
              return Effect.succeed("generator not found");
            }
            return Effect.succeed("other error");
          }),
        );
        return result;
      });

      const result = Effect.runSync(program);

      expect(result).toBe("generator not found");
    });
  });

  describe("Effect Async Operations", () => {
    it("should handle async operations with proper error handling", async () => {
      const mockAsyncOperation = vi
        .fn()
        .mockResolvedValue({ generatorId: "gen1", name: "Generator 1" });

      const program = Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => mockAsyncOperation(),
          catch: (error) =>
            new DatabaseError(`Database operation failed: ${error}`),
        });
        return result;
      });

      const result = await Effect.runPromise(program);

      expect(result).toEqual({ generatorId: "gen1", name: "Generator 1" });
      expect(mockAsyncOperation).toHaveBeenCalledTimes(1);
    });

    it("should handle async operation failures", async () => {
      const mockAsyncOperation = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));

      const program = Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => mockAsyncOperation(),
          catch: (error) =>
            new DatabaseError(`Database operation failed: ${error}`),
        });
        return result;
      });

      const result = await Effect.runPromiseExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(DatabaseError);
        }
      }
    });
  });

  describe("Effect Service Tag", () => {
    it("should create and use service tags", () => {
      class GeneratorService extends Effect.Tag("GeneratorService")<
        GeneratorService,
        {
          getGenerator: (
            id: string,
          ) => Effect.Effect<{ id: string }, GeneratorNotFoundError>;
        }
      >() {}

      const generatorServiceImpl = {
        getGenerator: (id: string) => Effect.succeed({ id }),
      };

      const serviceLayer = Layer.succeed(
        GeneratorService,
        generatorServiceImpl,
      );

      const program = Effect.gen(function* () {
        const service = yield* GeneratorService;
        return yield* service.getGenerator("gen1");
      });

      const result = Effect.runSync(program.pipe(Effect.provide(serviceLayer)));

      expect(result).toEqual({ id: "gen1" });
    });
  });
});
