import { createEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { Effect, Layer } from "effect";
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
import { CartNotFoundError } from "../errors.js";
import { CartRepositoryLayer, DatabaseError } from "../repository/cart.repo.js";
import { CartService, CartServiceLayer } from "../service/cart.service.js";
import { cartEventHandler } from "../service/event-sourcing/cart.event-handler.js";

// Infrastructure layer for dependencies
const createInfrastructureLayer = (db: DatabaseExecutor, logger: Logger) =>
  Layer.mergeAll(
    Layer.succeed(DatabaseService, db),
    Layer.succeed(LoggerService, logger),
  );

export class CartInvalidInputError extends Error {
  readonly _tag = "CartInvalidInputError";
}

/**
 * Create a cart app using Effect Layer system with event sourcing.
 */
export function createCartApp({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  const app = new Hono();
  app.use(createContextMiddleware());

  // Create event store
  const eventStore = createEventStore({ db, logger });

  // Create the complete layer
  const AppLayer = Layer.mergeAll(
    createInfrastructureLayer(db, logger),
    CartRepositoryLayer,
    CartServiceLayer(eventStore),
  );

  app.get("/api/tenants/:tenantId/carts", async (c) => {
    const tenantId = c.req.param("tenantId");

    const program = Effect.gen(function* () {
      const cartService = yield* CartService;
      return yield* cartService.getAll({ tenantId });
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
      result.map((cart) => ({
        cart_id: cart.cartId,
        items: cart.items,
        currency: cart.currency,
        is_checked_out: cart.isCheckedOut,
        is_cancelled: cart.isCancelled,
      })),
    );
  });

  app.get("/api/tenants/:tenantId/carts/:cartId", async (c) => {
    const tenantId = c.req.param("tenantId");
    const cartId = c.req.param("cartId");

    const program = Effect.gen(function* () {
      const cartService = yield* CartService;
      return yield* cartService.get({ tenantId, cartId });
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(AppLayer),
        Effect.catchAll(
          (
            error,
          ): Effect.Effect<{ error: string; status: ContentfulStatusCode }> => {
            if (error instanceof CartNotFoundError) {
              return Effect.succeed({ error: "Cart not found", status: 404 });
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
      cart_id: result.cartId,
      items: result.items,
      currency: result.currency,
      is_checked_out: result.isCheckedOut,
      is_cancelled: result.isCancelled,
    });
  });

  app.post("/api/tenants/:tenantId/carts", async (c) => {
    const tenantId = c.req.param("tenantId");
    const data = await c.req.json();

    // Use event handler for cart creation
    const cartId = crypto.randomUUID();
    await cartEventHandler({ eventStore, getContext }).create(cartId, {
      ...data,
      tenantId,
      cartId,
    });

    return c.json({ message: "Cart created", cart_id: cartId }, 201);
  });

  app.put("/api/tenants/:tenantId/carts/:cartId/items", async (c) => {
    const tenantId = c.req.param("tenantId");
    const cartId = c.req.param("cartId");
    const data = await c.req.json();
    const { action } = data as { action: "add" | "remove" };
    const program = Effect.gen(function* () {
      if (action === "add") {
        return yield* Effect.tryPromise({
          try: () =>
            cartEventHandler({ eventStore, getContext }).addItem(cartId, {
              tenantId,
              item: data.item,
            }),
          catch: (error) => new DatabaseError(`Failed to add item: ${error}`),
        });
      } else if (action === "remove") {
        return yield* Effect.tryPromise({
          try: () =>
            cartEventHandler({ eventStore, getContext }).removeItem(cartId, {
              tenantId,
              sku: data.sku,
              quantity: data.quantity,
            }),
          catch: (error) =>
            new DatabaseError(`Failed to remove item: ${error}`),
        });
      }
      return yield* Effect.fail(new CartInvalidInputError("Invalid action"));
    });

    const result = await Effect.runPromise(
      program.pipe(
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

    if (!!result && "error" in result) {
      return c.json({ message: result.error }, result.status);
    }

    return c.json(
      { message: data.action === "add" ? "Item added" : "Item removed" },
      201,
    );
  });

  app.delete("/api/tenants/:tenantId/carts/:cartId/items", async (c) => {
    const tenantId = c.req.param("tenantId");
    const cartId = c.req.param("cartId");
    const data = await c.req.json();

    // Use event handler for removing items
    await cartEventHandler({
      eventStore,
      getContext,
    }).removeItem(cartId, { tenantId, sku: data.sku, quantity: data.quantity });

    return c.json({ message: "Item removed" }, 201);
  });

  app.post("/api/tenants/:tenantId/carts/:cartId/empty", async (c) => {
    const tenantId = c.req.param("tenantId");
    const cartId = c.req.param("cartId");

    // Use event handler for emptying cart
    await cartEventHandler({ eventStore, getContext }).empty(cartId, {
      tenantId,
    });

    return c.json({ message: "Cart emptied" }, 201);
  });

  app.put("/api/tenants/:tenantId/carts/:cartId/checkout", async (c) => {
    const tenantId = c.req.param("tenantId");
    const cartId = c.req.param("cartId");
    const data = await c.req.json();

    // Use event handler for checkout
    await cartEventHandler({ eventStore, getContext }).checkout(cartId, {
      tenantId,
      orderId: data.orderId,
      total: data.total,
    });

    return c.json({ message: "Cart checked out" }, 201);
  });

  app.put("/api/tenants/:tenantId/carts/:cartId/cancel", async (c) => {
    const tenantId = c.req.param("tenantId");
    const cartId = c.req.param("cartId");
    const data = await c.req.json();

    // Use event handler for cancellation
    await cartEventHandler({ eventStore, getContext }).cancel(cartId, {
      tenantId,
      reason: data.reason,
    });

    return c.json({ message: "Cart cancelled" }, 201);
  });

  return app;
}
