import { Context, Effect, Layer } from "effect";
import { DatabaseService } from "../../shared/infra/db.js";
import { LoggerService } from "../../shared/infra/logger.js";
import type { CartEntity } from "../domain/cart.entity.js";

// Repository service tag
export class CartRepositoryService extends Context.Tag("CartRepositoryService")<
  CartRepositoryService,
  CartRepository
>() {}

export type CartRepository = {
  findById: (
    tenantId: string,
    cartId: string,
  ) => Effect.Effect<
    CartEntity | null,
    DatabaseError,
    DatabaseService | LoggerService
  >;
  findByTenantId: (
    tenantId: string,
  ) => Effect.Effect<
    CartEntity[],
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
const createCartRepositoryImpl = (): CartRepository => ({
  findById: (tenantId: string, cartId: string) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ tenantId, cartId }, "cart.findById");

      const result = yield* Effect.tryPromise({
        try: () =>
          db
            .selectFrom("carts")
            .where("tenant_id", "=", tenantId)
            .where("cart_id", "=", cartId)
            .select([
              "tenant_id",
              "cart_id",
              "currency",
              "items_json",
              "is_checked_out",
              "is_cancelled",
              "created",
              "updated",
            ])
            .executeTakeFirst(),
        catch: (error) =>
          new DatabaseError(
            `Failed to find cart by id: ${tenantId}/${cartId}`,
            error,
          ),
      });

      return result
        ? {
            tenantId: result.tenant_id,
            cartId: result.cart_id,
            currency: result.currency,
            items:
              typeof result.items_json === "string"
                ? JSON.parse(result.items_json)
                : result.items_json,
            isCheckedOut: result.is_checked_out,
            isCancelled: result.is_cancelled,
          }
        : null;
    }),

  findByTenantId: (tenantId: string) =>
    Effect.gen(function* () {
      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      logger.info({ tenantId }, "cart.findByTenantId");

      const results = yield* Effect.tryPromise({
        try: () =>
          db
            .selectFrom("carts")
            .where("tenant_id", "=", tenantId)
            .select([
              "tenant_id",
              "cart_id",
              "currency",
              "items_json",
              "is_checked_out",
              "is_cancelled",
              "created",
              "updated",
            ])
            .execute(),
        catch: (error) =>
          new DatabaseError(
            `Failed to find carts by tenant id: ${tenantId}`,
            error,
          ),
      });

      return results.map((result) => ({
        tenantId: result.tenant_id,
        cartId: result.cart_id,
        currency: result.currency,
        items:
          typeof result.items_json === "string"
            ? JSON.parse(result.items_json)
            : result.items_json,
        isCheckedOut: result.is_checked_out,
        isCancelled: result.is_cancelled,
      }));
    }),
});

// Layer for the repository
export const CartRepositoryLayer = Layer.succeed(
  CartRepositoryService,
  createCartRepositoryImpl(),
);
