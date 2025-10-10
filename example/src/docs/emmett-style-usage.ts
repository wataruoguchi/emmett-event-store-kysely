/**
 * Example: Using the new Emmett-style API
 * This demonstrates how to use getKyselyEventStore and createKyselyEventStoreConsumer
 */

import {
  createKyselyEventStoreConsumer,
  getKyselyEventStore,
} from "@wataruoguchi/emmett-event-store-kysely";
import type { DatabaseExecutor } from "../modules/shared/infra/db.js";
import type { Logger } from "../modules/shared/infra/logger.js";

/**
 * Example 1: Basic EventStore usage with Emmett-style API
 */
export function createEmmettStyleCartService({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  // Create event store using the new Emmett-style factory
  const eventStore = getKyselyEventStore({ db, logger });

  return {
    // Example: Create a cart
    async createCart(cartId: string, tenantId: string, currency: string) {
      // Append events directly using the EventStore interface
      const result = await eventStore.appendToStream(
        cartId,
        [
          {
            type: "CartCreated",
            data: { cartId, currency },
          },
        ],
        {
          partition: tenantId,
          streamType: "cart",
        },
      );

      logger.info({ result }, "Cart created");
      return result;
    },

    // Example: Add item to cart
    async addItem(
      cartId: string,
      tenantId: string,
      item: { sku: string; quantity: number; price: number },
    ) {
      // Define cart state type
      type CartState = {
        cartId?: string;
        items: Array<{ sku: string; quantity: number; price: number }>;
      };

      // Define event types
      type CartEvent =
        | { type: "CartCreated"; data: { cartId: string } }
        | {
            type: "ItemAdded";
            data: { sku: string; quantity: number; price: number };
          };

      // First, aggregate the current state
      const { state } = await eventStore.aggregateStream<CartState, CartEvent>(
        cartId,
        {
          evolve: (state: CartState, event: CartEvent) => {
            if (event.type === "CartCreated") {
              return { ...state, cartId: event.data.cartId, items: [] };
            }
            if (event.type === "ItemAdded") {
              return { ...state, items: [...state.items, event.data] };
            }
            return state;
          },
          initialState: () => ({ items: [] }),
          read: { partition: tenantId } as any,
        },
      );

      logger.info({ state }, "Current cart state");

      // Append the new event
      const result = await eventStore.appendToStream(
        cartId,
        [
          {
            type: "ItemAdded",
            data: { cartId, ...item },
          },
        ],
        {
          partition: tenantId,
          streamType: "cart",
        },
      );

      return result;
    },

    // Example: Read all cart events
    async getCartEvents(cartId: string, tenantId: string) {
      const result = await eventStore.readStream(cartId, {
        partition: tenantId,
      } as any);

      logger.info(
        { eventCount: result.events.length },
        "Cart events retrieved",
      );
      return result;
    },

    // Close the event store (cleanup)
    async close() {
      await eventStore.close();
    },
  };
}

/**
 * Example 2: Event Consumer for Read Models
 */
export function createCartReadModelConsumer({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  // Create consumer using the new API
  const consumer = createKyselyEventStoreConsumer({
    db,
    logger,
    consumerName: "cart-read-model",
    batchSize: 50,
    pollingInterval: 1000,
  });

  // Subscribe to cart events
  consumer.subscribe(async (event) => {
    logger.info({ event }, "Processing CartCreated event");

    // Update your read model here
    // For example, insert into a carts table
    // await db.insertInto('carts').values({
    //   cart_id: event.data.cartId,
    //   currency: event.data.currency,
    //   created_at: new Date(),
    // }).execute();
  }, "CartCreated");

  consumer.subscribe(async (event) => {
    logger.info({ event }, "Processing ItemAdded event");

    // Update your read model here
    // For example, insert into a cart_items table
    // await db.insertInto('cart_items').values({
    //   cart_id: event.data.cartId,
    //   sku: event.data.sku,
    //   quantity: event.data.quantity,
    // }).execute();
  }, "ItemAdded");

  // Subscribe to all events for logging/auditing
  consumer.subscribeToAll((event) => {
    logger.debug(
      {
        type: event.type,
        streamName: event.metadata.streamName,
        globalPosition: event.metadata.globalPosition,
      },
      "Event processed",
    );
  });

  return {
    async start() {
      await consumer.start();
      logger.info("Cart read model consumer started");
    },
    async stop() {
      await consumer.stop();
      logger.info("Cart read model consumer stopped");
    },
  };
}

/**
 * Example 3: Comparison - Legacy vs Emmett-style
 */
export function comparisonExample({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  // LEGACY STYLE (still works for backward compatibility)
  // const { readStream, appendToStream, aggregateStream } = createEventStore({ db, logger });
  // await appendToStream("stream-id", events, options);

  // NEW EMMETT-STYLE (recommended)
  const eventStore = getKyselyEventStore({ db, logger });
  // eventStore.appendToStream("stream-id", events, options);
  // eventStore.readStream("stream-id", options);
  // eventStore.aggregateStream("stream-id", options);

  return {
    eventStore,
    // Both approaches work, but Emmett-style gives you:
    // 1. Better type inference
    // 2. Consistency with @event-driven-io/emmett-postgresql
    // 3. Access to withSession for transactions
    // 4. Schema management capabilities
  };
}

/**
 * Example 4: Using withSession for transactions
 */
export async function transactionalExample({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}) {
  const eventStore = getKyselyEventStore({ db, logger });

  // Use withSession to ensure all operations are in a transaction
  await eventStore.withSession(async (session) => {
    const { eventStore: sessionEventStore } = session;

    // All these operations will be committed together or rolled back
    await sessionEventStore.appendToStream("cart-1", [
      { type: "CartCreated", data: { cartId: "cart-1", currency: "USD" } },
    ]);

    await sessionEventStore.appendToStream("cart-2", [
      { type: "CartCreated", data: { cartId: "cart-2", currency: "EUR" } },
    ]);

    logger.info("Both carts created in a single transaction");
  });
}
