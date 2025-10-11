/**
 * Tests for the cart consumer
 *
 * These tests demonstrate how to test the consumer-based projection approach.
 * Note the differences from synchronous projection tests:
 * - Need to wait for polling to process events
 * - Need to start/stop the consumer
 * - Tests are slightly slower due to polling intervals
 */

import { getKyselyEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import { seedTestDb } from "../../../dev-tools/database/seed-test-db.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import { createCartsConsumer } from "../cart.index.js";

describe("Cart Consumer Tests", () => {
  const TEST_DB_NAME = "cart_consumer_test";
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  } as Pick<Logger, "info" | "error"> as Logger;

  let db: DatabaseExecutor;
  let tenantId: string;
  let consumer: Awaited<ReturnType<typeof createCartsConsumer>>;
  let consumerName: string;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_NAME);
    tenantId = (await seedTestDb(db).createTenant()).id;

    // Create and start the consumer
    consumerName = `test-carts-consumer-${Date.now()}`;
    consumer = createCartsConsumer({
      db,
      logger,
      partition: tenantId,
      consumerName,
      batchSize: 10,
      pollingInterval: 100, // Fast polling for tests (100ms)
    });

    await consumer.start();
  });

  afterAll(async () => {
    // Always stop the consumer to prevent it from running after tests
    await consumer.stop();
    await db.destroy();
  });

  /**
   * Helper function to wait for the consumer to process events
   * This polls the read model until the expected condition is met
   */
  async function waitForProjection(
    check: () => Promise<boolean>,
    timeoutMs = 2000,
    pollIntervalMs = 50,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await check()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Projection did not complete within ${timeoutMs}ms`);
  }

  it("should project CartCreated event to read model", async () => {
    const eventStore = getKyselyEventStore({ db, logger });
    const cartId = `cart-${Date.now()}`;
    const streamId = cartId;

    // 1. Write event to event store
    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "CartCreated",
          data: {
            eventMeta: {
              tenantId,
              cartId,
            },
            eventData: {
              currency: "USD",
            },
          },
        },
      ],
      {
        partition: tenantId,
        streamType: "cart",
      },
    );

    // 2. Wait for consumer to process the event
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom("carts")
        .selectAll()
        .where("cart_id", "=", cartId)
        .where("partition", "=", tenantId)
        .executeTakeFirst();

      return cart !== undefined;
    });

    // 3. Verify the read model was updated
    const cart = await db
      .selectFrom("carts")
      .selectAll()
      .where("cart_id", "=", cartId)
      .where("partition", "=", tenantId)
      .executeTakeFirst();

    expect(cart).toBeDefined();
    expect(cart?.cart_id).toBe(cartId);
    expect(cart?.tenant_id).toBe(tenantId);
    expect(cart?.currency).toBe("USD");
    expect(cart?.is_checked_out).toBe(false);
    expect(cart?.is_cancelled).toBe(false);
  });

  it("should project ItemAddedToCart event", async () => {
    const eventStore = getKyselyEventStore({ db, logger });
    const cartId = `cart-${Date.now()}`;
    const streamId = cartId;

    // Create cart first
    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "CartCreated",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: { currency: "USD" },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    // Add item
    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "ItemAddedToCart",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: {
              item: {
                sku: "WIDGET-001",
                name: "Widget",
                unitPrice: 10.99,
                quantity: 2,
              },
            },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    // Wait for projection
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom("carts")
        .select("items_json")
        .where("cart_id", "=", cartId)
        .where("partition", "=", tenantId)
        .executeTakeFirst();

      if (!cart) return false;

      const items =
        typeof cart.items_json === "string"
          ? JSON.parse(cart.items_json)
          : cart.items_json;
      return Array.isArray(items) && items.length > 0;
    });

    // Verify
    const cart = await db
      .selectFrom("carts")
      .select("items_json")
      .where("cart_id", "=", cartId)
      .where("partition", "=", tenantId)
      .executeTakeFirst();

    const items =
      typeof cart?.items_json === "string"
        ? JSON.parse(cart?.items_json ?? "[]")
        : cart?.items_json;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sku: "WIDGET-001",
      name: "Widget",
      unitPrice: 10.99,
      quantity: 2,
    });
  });

  it("should handle multiple events in sequence", async () => {
    const eventStore = getKyselyEventStore({ db, logger });
    const cartId = `cart-${Date.now()}`;
    const streamId = cartId;

    // Write multiple events
    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "CartCreated",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: { currency: "USD" },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "ItemAddedToCart",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: {
              item: { sku: "A", name: "Item A", unitPrice: 10, quantity: 1 },
            },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "ItemAddedToCart",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: {
              item: { sku: "B", name: "Item B", unitPrice: 20, quantity: 2 },
            },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "CartCheckedOut",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: { orderId: "ORDER-123", total: 50 },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    // Wait for all projections
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom("carts")
        .selectAll()
        .where("cart_id", "=", cartId)
        .where("partition", "=", tenantId)
        .executeTakeFirst();

      if (!cart) return false;
      if (!cart.is_checked_out) return false;

      const items =
        typeof cart.items_json === "string"
          ? JSON.parse(cart.items_json)
          : cart.items_json;

      // items_json is now just an array, not wrapped in an object
      return Array.isArray(items) && items.length === 2;
    }, 1000); // Longer timeout for multiple events

    // Verify final state
    const cart = await db
      .selectFrom("carts")
      .selectAll()
      .where("cart_id", "=", cartId)
      .where("partition", "=", tenantId)
      .executeTakeFirst();

    expect(cart?.is_checked_out).toBe(true);

    const items =
      typeof cart?.items_json === "string"
        ? JSON.parse(cart?.items_json ?? "[]")
        : cart?.items_json;

    // items_json is now just an array of items (not wrapped with orderId/total)
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ sku: "A", name: "Item A" });
    expect(items[1]).toMatchObject({ sku: "B", name: "Item B" });
  });

  it("should handle events idempotently", async () => {
    const eventStore = getKyselyEventStore({ db, logger });
    const cartId = `cart-${Date.now()}`;
    const streamId = cartId;

    // Write event
    await eventStore.appendToStream(
      streamId,
      [
        {
          type: "CartCreated",
          data: {
            eventMeta: { tenantId, cartId },
            eventData: { currency: "EUR" },
          },
        },
      ],
      { partition: tenantId, streamType: "cart" },
    );

    // Wait for projection
    await waitForProjection(async () => {
      const cart = await db
        .selectFrom("carts")
        .where("cart_id", "=", cartId)
        .where("partition", "=", tenantId)
        .executeTakeFirst();
      return cart !== undefined;
    });

    // Get the cart
    const cart = await db
      .selectFrom("carts")
      .selectAll()
      .where("cart_id", "=", cartId)
      .where("partition", "=", tenantId)
      .executeTakeFirst();

    expect(cart).toBeDefined();
    expect(cart?.currency).toBe("EUR");

    // The consumer should not duplicate or corrupt data
    // by reprocessing the same event multiple times
    const streamPosition = cart?.last_stream_position;
    expect(streamPosition).toBe("1");
  });
});
