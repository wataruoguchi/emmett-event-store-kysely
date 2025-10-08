import type { EventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { Context, Effect, Layer, Schema } from "effect";
import { getContext } from "../../shared/hono/context-middleware.js";
import type { DatabaseService } from "../../shared/infra/db.js";
import type { LoggerService } from "../../shared/infra/logger.js";
import {
  CartEntitySchema,
  CartItemSchema,
  type CartEntity,
} from "../domain/cart.entity.js";
import {
  CartInvalidInputError,
  CartNotFoundError,
  type TenantNotFoundError,
} from "../errors.js";
import {
  CartRepositoryLayer,
  CartRepositoryService,
  DatabaseError,
} from "../repository/cart.repo.js";
import { cartEventHandler } from "./event-sourcing/cart.event-handler.js";

// Service tag
export class CartService extends Context.Tag("CartService")<
  CartService,
  CartServiceInterface
>() {}

export type CartServiceInterface = {
  create: (input: {
    tenantId: string;
    currency: string;
  }) => Effect.Effect<
    CartEntity,
    CartInvalidInputError | TenantNotFoundError | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  addItem: (input: {
    tenantId: string;
    cartId: string;
    item: unknown;
  }) => Effect.Effect<
    CartEntity,
    | CartInvalidInputError
    | TenantNotFoundError
    | CartNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  removeItem: (input: {
    tenantId: string;
    cartId: string;
    sku: string;
    quantity: number;
  }) => Effect.Effect<
    CartEntity,
    | CartInvalidInputError
    | TenantNotFoundError
    | CartNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  empty: (input: {
    tenantId: string;
    cartId: string;
  }) => Effect.Effect<
    CartEntity,
    | CartInvalidInputError
    | TenantNotFoundError
    | CartNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  checkout: (input: {
    tenantId: string;
    cartId: string;
    orderId: string;
    total: number;
  }) => Effect.Effect<
    CartEntity,
    | CartInvalidInputError
    | TenantNotFoundError
    | CartNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  cancel: (input: {
    tenantId: string;
    cartId: string;
    reason: string;
  }) => Effect.Effect<
    CartEntity,
    | CartInvalidInputError
    | TenantNotFoundError
    | CartNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  get: (input: {
    tenantId: string;
    cartId: string;
  }) => Effect.Effect<
    CartEntity,
    | CartInvalidInputError
    | TenantNotFoundError
    | CartNotFoundError
    | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
  getAll: (input: {
    tenantId: string;
  }) => Effect.Effect<
    CartEntity[],
    CartInvalidInputError | TenantNotFoundError | DatabaseError,
    DatabaseService | LoggerService | CartRepositoryService
  >;
};

// Service implementation
const createCartServiceImpl = (
  eventStore: EventStore,
): CartServiceInterface => ({
  create: (input: { tenantId: string; currency: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      const cartId = crypto.randomUUID();
      const cartData = {
        cartId,
        items: [],
        isCheckedOut: false,
        isCancelled: false,
        ...input,
      };

      const cart = yield* Schema.decodeUnknown(CartEntitySchema)(cartData).pipe(
        Effect.mapError(
          (error) => new CartInvalidInputError(`Invalid cart data: ${error}`),
        ),
      );

      // Use event handler for cart creation
      const handler = cartEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.create(cartId, {
            tenantId: input.tenantId,
            cartId,
            currency: input.currency,
          }),
        catch: (error) => new DatabaseError(`Failed to create cart: ${error}`),
      });

      return cart;
    }),

  addItem: (input: { tenantId: string; cartId: string; item: unknown }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the item using CartItemSchema
      const validatedItem = yield* Schema.decodeUnknown(CartItemSchema)(
        input.item,
      ).pipe(
        Effect.mapError(
          (error) => new CartInvalidInputError(`Invalid item data: ${error}`),
        ),
      );

      // Use event handler for adding items
      const handler = cartEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.addItem(input.cartId, {
            tenantId: input.tenantId,
            item: validatedItem,
          }),
        catch: (error) =>
          new DatabaseError(`Failed to add item to cart: ${error}`),
      });

      // Return the updated cart from the repository
      const repository = yield* CartRepositoryService;
      const cart = yield* repository.findById(input.tenantId, input.cartId);

      if (!cart) {
        return yield* Effect.fail(new CartNotFoundError("Cart not found"));
      }

      return cart;
    }),

  removeItem: (input: {
    tenantId: string;
    cartId: string;
    sku: string;
    quantity: number;
  }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the remove item input
      const RemoveItemSchema = Schema.Struct({
        tenantId: Schema.String,
        cartId: Schema.String,
        sku: Schema.String,
        quantity: Schema.Number.pipe(Schema.positive()),
      });

      const validatedInput = yield* Schema.decodeUnknown(RemoveItemSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new CartInvalidInputError(`Invalid remove item data: ${error}`),
        ),
      );

      // Use event handler for removing items
      const handler = cartEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.removeItem(validatedInput.cartId, {
            tenantId: validatedInput.tenantId,
            sku: validatedInput.sku,
            quantity: validatedInput.quantity,
          }),
        catch: (error) =>
          new DatabaseError(`Failed to remove item from cart: ${error}`),
      });

      // Return the updated cart from the repository
      const repository = yield* CartRepositoryService;
      const cart = yield* repository.findById(input.tenantId, input.cartId);

      if (!cart) {
        return yield* Effect.fail(new CartNotFoundError("Cart not found"));
      }

      return cart;
    }),

  empty: (input: { tenantId: string; cartId: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the empty cart input
      const EmptyCartSchema = Schema.Struct({
        tenantId: Schema.String,
        cartId: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(EmptyCartSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new CartInvalidInputError(`Invalid empty cart data: ${error}`),
        ),
      );

      // Use event handler for emptying cart
      const handler = cartEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.empty(validatedInput.cartId, {
            tenantId: validatedInput.tenantId,
          }),
        catch: (error) => new DatabaseError(`Failed to empty cart: ${error}`),
      });

      // Return the updated cart from the repository
      const repository = yield* CartRepositoryService;
      const cart = yield* repository.findById(input.tenantId, input.cartId);

      if (!cart) {
        return yield* Effect.fail(new CartNotFoundError("Cart not found"));
      }

      return cart;
    }),

  checkout: (input: {
    tenantId: string;
    cartId: string;
    orderId: string;
    total: number;
  }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the checkout input
      const CheckoutSchema = Schema.Struct({
        tenantId: Schema.String,
        cartId: Schema.String,
        orderId: Schema.String,
        total: Schema.Number.pipe(Schema.nonNegative()),
      });

      const validatedInput = yield* Schema.decodeUnknown(CheckoutSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new CartInvalidInputError(`Invalid checkout data: ${error}`),
        ),
      );

      // Use event handler for checkout
      const handler = cartEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.checkout(validatedInput.cartId, {
            tenantId: validatedInput.tenantId,
            orderId: validatedInput.orderId,
            total: validatedInput.total,
          }),
        catch: (error) =>
          new DatabaseError(`Failed to checkout cart: ${error}`),
      });

      // Return the updated cart from the repository
      const repository = yield* CartRepositoryService;
      const cart = yield* repository.findById(input.tenantId, input.cartId);

      if (!cart) {
        return yield* Effect.fail(new CartNotFoundError("Cart not found"));
      }

      return cart;
    }),

  cancel: (input: { tenantId: string; cartId: string; reason: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the cancel input
      const CancelSchema = Schema.Struct({
        tenantId: Schema.String,
        cartId: Schema.String,
        reason: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(CancelSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) => new CartInvalidInputError(`Invalid cancel data: ${error}`),
        ),
      );

      // Use event handler for cancellation
      const handler = cartEventHandler({ eventStore, getContext });
      yield* Effect.tryPromise({
        try: () =>
          handler.cancel(validatedInput.cartId, {
            tenantId: validatedInput.tenantId,
            reason: validatedInput.reason,
          }),
        catch: (error) => new DatabaseError(`Failed to cancel cart: ${error}`),
      });

      // Return the updated cart from the repository
      const repository = yield* CartRepositoryService;
      const cart = yield* repository.findById(input.tenantId, input.cartId);

      if (!cart) {
        return yield* Effect.fail(new CartNotFoundError("Cart not found"));
      }

      return cart;
    }),

  get: (input: { tenantId: string; cartId: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the get input
      const GetCartSchema = Schema.Struct({
        tenantId: Schema.String,
        cartId: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(GetCartSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new CartInvalidInputError(`Invalid get cart data: ${error}`),
        ),
      );

      const repository = yield* CartRepositoryService;
      const cart = yield* repository.findById(
        validatedInput.tenantId,
        validatedInput.cartId,
      );

      if (!cart) {
        return yield* Effect.fail(new CartNotFoundError("Cart not found"));
      }

      return cart;
    }),

  getAll: (input: { tenantId: string }) =>
    Effect.gen(function* () {
      if (!input || typeof input !== "object") {
        return yield* Effect.fail(
          new CartInvalidInputError("Input must be an object"),
        );
      }

      // Validate the getAll input
      const GetAllCartsSchema = Schema.Struct({
        tenantId: Schema.String,
      });

      const validatedInput = yield* Schema.decodeUnknown(GetAllCartsSchema)(
        input,
      ).pipe(
        Effect.mapError(
          (error) =>
            new CartInvalidInputError(`Invalid getAll carts data: ${error}`),
        ),
      );

      const repository = yield* CartRepositoryService;
      return yield* repository.findByTenantId(validatedInput.tenantId);
    }),
});

// Layer for the service
export const CartServiceLayer = (eventStore: EventStore) =>
  Layer.effect(
    CartService,
    Effect.succeed(createCartServiceImpl(eventStore)).pipe(
      Effect.provide(CartRepositoryLayer),
    ),
  );
