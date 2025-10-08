import { Effect, Layer, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { CartEntitySchema, CartItemSchema } from "../domain/cart.entity.js";
import { CartInvalidInputError, CartNotFoundError } from "../errors.js";
import { DatabaseError } from "../repository/cart.repo.js";

describe("Cart Module Unit Tests", () => {
  describe("Effect Schema Validation", () => {
    it("should validate correct cart data", () => {
      const validCart = {
        tenantId: "tenant1",
        cartId: "550e8400-e29b-41d4-a716-446655440000", // Valid UUID
        currency: "USD",
        items: [],
        isCheckedOut: false,
        isCancelled: false,
      };

      const result = Effect.runSync(
        Schema.decodeUnknown(CartEntitySchema)(validCart),
      );

      expect(result).toEqual(validCart);
    });

    it("should validate cart item data", () => {
      const validItem = {
        sku: "item1",
        name: "Item 1",
        unitPrice: 10,
        quantity: 1,
      };

      const result = Effect.runSync(
        Schema.decodeUnknown(CartItemSchema)(validItem),
      );

      expect(result).toEqual(validItem);
    });

    it("should reject invalid cart data", () => {
      const invalidCart = {
        tenantId: "tenant1",
        cartId: "not-a-uuid", // Invalid: not a UUID
        currency: "USD",
        items: [],
        isCheckedOut: false,
        isCancelled: false,
      };

      const result = Effect.runSyncExit(
        Schema.decodeUnknown(CartEntitySchema)(invalidCart),
      );

      expect(result._tag).toBe("Failure");
    });

    it("should reject invalid cart item data", () => {
      const invalidItem = {
        sku: "item1",
        name: "Item 1",
        unitPrice: -10, // Invalid: negative price
        quantity: 1,
      };

      const result = Effect.runSyncExit(
        Schema.decodeUnknown(CartItemSchema)(invalidItem),
      );

      expect(result._tag).toBe("Failure");
    });
  });

  describe("Effect Error Handling", () => {
    it("should handle CartNotFoundError properly", () => {
      const program = Effect.fail(new CartNotFoundError("Cart not found"));

      const result = Effect.runSyncExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(CartNotFoundError);
          expect(result.cause.error.message).toBe("Cart not found");
        }
      }
    });

    it("should handle CartInvalidInputError properly", () => {
      const program = Effect.fail(new CartInvalidInputError("Invalid input"));

      const result = Effect.runSyncExit(program);

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.cause._tag).toBe("Fail");
        if (result.cause._tag === "Fail") {
          expect(result.cause.error).toBeInstanceOf(CartInvalidInputError);
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
    it("should transform cart data with Schema", () => {
      const inputData = {
        tenantId: "tenant1",
        cartId: "550e8400-e29b-41d4-a716-446655440000",
        currency: "USD",
        items: [{ sku: "item1", name: "Item 1", unitPrice: 10, quantity: 1 }],
        isCheckedOut: false,
        isCancelled: false,
      };

      const program = Effect.gen(function* () {
        const validated =
          yield* Schema.decodeUnknown(CartEntitySchema)(inputData);
        return {
          ...validated,
          totalItems: validated.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          totalValue: validated.items.reduce(
            (sum, item) => sum + item.unitPrice * item.quantity,
            0,
          ),
        };
      });

      const result = Effect.runSync(program);

      expect(result.totalItems).toBe(1);
      expect(result.totalValue).toBe(10);
    });
  });

  describe("Effect Error Recovery", () => {
    it("should recover from errors with fallback", () => {
      const program = Effect.gen(function* () {
        const result = yield* Effect.fail(
          new CartNotFoundError("Cart not found"),
        ).pipe(Effect.catchAll(() => Effect.succeed({ items: [], total: 0 })));
        return result;
      });

      const result = Effect.runSync(program);

      expect(result).toEqual({ items: [], total: 0 });
    });

    it("should handle specific error types", () => {
      const program = Effect.gen(function* () {
        const result = yield* Effect.fail(
          new CartNotFoundError("Not found"),
        ).pipe(
          Effect.catchAll((error) => {
            if (error instanceof CartNotFoundError) {
              return Effect.succeed("cart not found");
            }
            return Effect.succeed("other error");
          }),
        );
        return result;
      });

      const result = Effect.runSync(program);

      expect(result).toBe("cart not found");
    });
  });

  describe("Effect Async Operations", () => {
    it("should handle async operations with proper error handling", async () => {
      const mockAsyncOperation = vi
        .fn()
        .mockResolvedValue({ cartId: "cart1", items: [] });

      const program = Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => mockAsyncOperation(),
          catch: (error) =>
            new DatabaseError(`Database operation failed: ${error}`),
        });
        return result;
      });

      const result = await Effect.runPromise(program);

      expect(result).toEqual({ cartId: "cart1", items: [] });
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
      class CartService extends Effect.Tag("CartService")<
        CartService,
        {
          getCart: (
            id: string,
          ) => Effect.Effect<{ id: string }, CartNotFoundError>;
        }
      >() {}

      const cartServiceImpl = {
        getCart: (id: string) => Effect.succeed({ id }),
      };

      const serviceLayer = Layer.succeed(CartService, cartServiceImpl);

      const program = Effect.gen(function* () {
        const service = yield* CartService;
        return yield* service.getCart("cart1");
      });

      const result = Effect.runSync(program.pipe(Effect.provide(serviceLayer)));

      expect(result).toEqual({ id: "cart1" });
    });
  });
});
