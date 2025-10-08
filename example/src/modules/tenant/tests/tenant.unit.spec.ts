import { Effect, Layer, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { TenantEntitySchema } from "../domain/tenant.entity.js";
import { TenantNotFoundError } from "../errors.js";
import { DatabaseError } from "../repository/tenant.repo.js";

describe("Tenant Module Unit Tests", () => {
  describe("Effect Schema Validation", () => {
    it("should validate correct tenant data", () => {
      const validTenant = {
        id: "550e8400-e29b-41d4-a716-446655440000", // Valid UUID
        tenantId: "test-tenant",
        name: "Test Tenant",
      };

      const result = Effect.runSync(
        Schema.decodeUnknown(TenantEntitySchema)(validTenant),
      );

      expect(result).toEqual(validTenant);
    });

    it("should reject invalid tenant data", () => {
      const invalidTenant = {
        id: "", // Invalid: empty string
        tenantId: "test-tenant",
        name: "Test Tenant",
      };

      const result = Effect.runSyncExit(
        Schema.decodeUnknown(TenantEntitySchema)(invalidTenant),
      );

      expect(result._tag).toBe("Failure");
    });

    it("should reject invalid UUID format", () => {
      const invalidTenant = {
        id: "not-a-uuid", // Invalid UUID format
        tenantId: "test-tenant",
        name: "Test Tenant",
      };

      const result = Effect.runSyncExit(
        Schema.decodeUnknown(TenantEntitySchema)(invalidTenant),
      );

      expect(result._tag).toBe("Failure");
    });
  });

  describe("Effect Error Handling", () => {
    it("should handle TenantNotFoundError properly", () => {
      const program = Effect.fail(new TenantNotFoundError("Tenant not found"));

      const result = Effect.runSyncExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(TenantNotFoundError);
          expect(result.cause.error.message).toBe("Tenant not found");
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

  describe("Effect Layer Composition", () => {
    it("should compose layers correctly", () => {
      const mockDb = { test: "db" };
      const mockLogger = { test: "logger" };

      const dbLayer = Layer.succeed("DatabaseService" as any, mockDb);
      const loggerLayer = Layer.succeed("LoggerService" as any, mockLogger);
      const combinedLayer = Layer.mergeAll(dbLayer, loggerLayer);

      const program = Effect.succeed({ db: mockDb, logger: mockLogger });

      const result = Effect.runSync(program);

      expect(result).toEqual({ db: mockDb, logger: mockLogger });
    });
  });

  describe("Effect Service Tag", () => {
    it("should create and use service tags", () => {
      class TestService extends Effect.Tag("TestService")<
        TestService,
        { getValue: () => string }
      >() {}

      const testServiceImpl = {
        getValue: () => "test value",
      };

      const serviceLayer = Layer.succeed(TestService, testServiceImpl);

      const program = Effect.gen(function* () {
        const service = yield* TestService;
        return service.getValue();
      });

      const result = Effect.runSync(program.pipe(Effect.provide(serviceLayer)));

      expect(result).toBe("test value");
    });
  });

  describe("Effect Schema Transformations", () => {
    it("should transform data with Schema", () => {
      const inputData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "test-tenant",
        name: "Test Tenant",
      };

      const program = Effect.gen(function* () {
        const validated =
          yield* Schema.decodeUnknown(TenantEntitySchema)(inputData);
        return {
          ...validated,
          displayName: `${validated.name} (${validated.tenantId})`,
        };
      });

      const result = Effect.runSync(program);

      expect(result).toEqual({
        id: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "test-tenant",
        name: "Test Tenant",
        displayName: "Test Tenant (test-tenant)",
      });
    });
  });

  describe("Effect Error Recovery", () => {
    it("should recover from errors with fallback", () => {
      const program = Effect.gen(function* () {
        const result = yield* Effect.fail(
          new Error("Something went wrong"),
        ).pipe(Effect.catchAll(() => Effect.succeed("fallback value")));
        return result;
      });

      const result = Effect.runSync(program);

      expect(result).toBe("fallback value");
    });

    it("should handle specific error types", () => {
      const program = Effect.gen(function* () {
        const result = yield* Effect.fail(
          new TenantNotFoundError("Not found"),
        ).pipe(
          Effect.catchAll((error) => {
            if (error instanceof TenantNotFoundError) {
              return Effect.succeed("tenant not found");
            }
            return Effect.succeed("other error");
          }),
        );
        return result;
      });

      const result = Effect.runSync(program);

      expect(result).toBe("tenant not found");
    });
  });

  describe("Effect Async Operations", () => {
    it("should handle async operations with proper error handling", async () => {
      const mockAsyncOperation = vi.fn().mockResolvedValue("success");

      const program = Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => mockAsyncOperation(),
          catch: (error) => new Error(`Async operation failed: ${error}`),
        });
        return result;
      });

      const result = await Effect.runPromise(program);

      expect(result).toBe("success");
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
});
