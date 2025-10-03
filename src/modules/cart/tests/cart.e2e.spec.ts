//
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import z from "zod";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import { seedTestDb } from "../../../dev-tools/database/seed-test-db.js";
import { createEventStore } from "../../shared/event-sourcing/event-store.js";
import { createProjectionRunner } from "../../shared/event-sourcing/projections/runner.js";
import { createProjectionRegistry } from "../../shared/event-sourcing/projections/types.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import { createTenantService } from "../../tenant/tenant.index.js";
import { createCartApp, createCartService } from "../cart.index.js";
import { cartsProjection } from "../service/event-sourcing/cart.read-model.js";

describe("Cart Integration", () => {
  const TEST_DB_NAME = "cart_e2e_test";
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  } as Pick<Logger, "info" | "error"> as Logger;

  let app: Hono;
  let db: DatabaseExecutor;
  let tenantId: string;
  let project: (opts?: { batchSize?: number }) => Promise<void>;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_NAME);
    app = createCartApp({
      cartService: createCartService(
        { tenantService: createTenantService({ db, logger }) },
        { db, logger },
      ),
      logger,
    });
    tenantId = (await seedTestDb(db).createTenant()).id;

    const { readStream } = createEventStore({ db, logger });
    const registry = createProjectionRegistry(cartsProjection());
    const runner = createProjectionRunner({ db, readStream, registry });
    project = async ({ batchSize = 500 } = {}) => {
      const streams = await db
        .selectFrom("streams")
        .select(["stream_id"])
        .where("is_archived", "=", false)
        .where("partition", "=", tenantId)
        .where("stream_type", "=", "cart")
        .execute();
      for (const s of streams) {
        const streamId = s.stream_id as string;
        const subscriptionId = `carts-read-model:${streamId}`;
        await runner.projectEvents(subscriptionId, streamId, {
          partition: tenantId,
          batchSize,
        });
      }
    };
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("should create a cart", async () => {
    const data = generateCartData();
    const response = await app.request(`/api/tenants/${tenantId}/carts`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    expect(response.status).toBe(201);
  });

  describe("should add and remove items", () => {
    let cartId: string;
    beforeAll(async () => {
      const resp = await app.request(`/api/tenants/${tenantId}/carts`, {
        method: "POST",
        body: JSON.stringify(generateCartData()),
      });
      const json = await resp.json();
      cartId = json.cartId;
      // ensure stream exists and is visible to read model
      await project();
    });

    it("adds an item", async () => {
      expect(z.uuid().safeParse(cartId).success).toBe(true);
      const response = await app.request(
        `/api/tenants/${tenantId}/carts/${cartId}/items`,
        {
          method: "PUT",
          body: JSON.stringify({ action: "add", item: generateItem() }),
        },
      );
      expect(response.status).toBe(201);
    });

    it("removes an item", async () => {
      await app.request(`/api/tenants/${tenantId}/carts/${cartId}/items`, {
        method: "PUT",
        body: JSON.stringify({ action: "add", item: generateItem() }),
      });
      await project();
      const response = await app.request(
        `/api/tenants/${tenantId}/carts/${cartId}/items`,
        {
          method: "PUT",
          body: JSON.stringify({
            action: "remove",
            sku: "SKU-123",
            quantity: 1,
          }),
        },
      );
      expect(response.status).toBe(201);
    });
  });

  describe("should checkout and cancel", () => {
    let cartId: string;
    beforeAll(async () => {
      const resp = await app.request(`/api/tenants/${tenantId}/carts`, {
        method: "POST",
        body: JSON.stringify(generateCartData()),
      });
      const json = await resp.json();
      cartId = json.cartId;
      await app.request(`/api/tenants/${tenantId}/carts/${cartId}/items`, {
        method: "PUT",
        body: JSON.stringify({ action: "add", item: generateItem() }),
      });
      await project();
    });

    it("checks out", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/carts/${cartId}/checkout`,
        {
          method: "PUT",
          body: JSON.stringify({ orderId: crypto.randomUUID(), total: 25 }),
        },
      );
      expect(response.status).toBe(201);
    });

    it("cancels", async () => {
      const resp = await app.request(`/api/tenants/${tenantId}/carts`, {
        method: "POST",
        body: JSON.stringify(generateCartData()),
      });
      const json = await resp.json();
      const anotherCart = json.cartId;
      await project();
      const response = await app.request(
        `/api/tenants/${tenantId}/carts/${anotherCart}/cancel`,
        {
          method: "PUT",
          body: JSON.stringify({ reason: "Customer requested" }),
        },
      );
      expect(response.status).toBe(201);
    });
  });

  describe("should read a cart via read model", () => {
    let cartId: string;
    beforeAll(async () => {
      const resp = await app.request(`/api/tenants/${tenantId}/carts`, {
        method: "POST",
        body: JSON.stringify(generateCartData()),
      });
      const json = await resp.json();
      cartId = json.cartId;
      await app.request(`/api/tenants/${tenantId}/carts/${cartId}/items`, {
        method: "PUT",
        body: JSON.stringify({ action: "add", item: generateItem() }),
      });
      await project();
    });

    it("returns the cart from read model", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/carts/${cartId}`,
        {
          method: "GET",
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.cart_id).toEqual(cartId);
    });
  });

  describe("shopping cart scenario", () => {
    /**
     * +---------------------+---------------------------------------------------------------------------------------------------------------------------------------+
     * | message_type        | message_data                                                                                                                          |
     * |---------------------+---------------------------------------------------------------------------------------------------------------------------------------|
     * | CartCreated         | {"cartId": "74623d38-58a7-4fc7-8bc8-8950cfb2cc92", "currency": "USD", "tenantId": "d71abd02-923c-4b37-8213-466f75171cff"}             |
     * | ItemAddedToCart     | {"item": {"sku": "SKU-123", "name": "Item 123", "quantity": 2, "unitPrice": 25}, "tenantId": "d71abd02-923c-4b37-8213-466f75171cff"}  |
     * | ItemAddedToCart     | {"item": {"sku": "SKU-456", "name": "Item 456", "quantity": 1, "unitPrice": 15}, "tenantId": "d71abd02-923c-4b37-8213-466f75171cff"}  |
     * | ItemRemovedFromCart | {"sku": "SKU-123", "quantity": 1, "tenantId": "d71abd02-923c-4b37-8213-466f75171cff"}                                                 |
     * | CartCheckedOut      | {"total": 40, "orderId": "17f16c18-1449-493b-b6db-db1036cb8367", "tenantId": "d71abd02-923c-4b37-8213-466f75171cff"}                  |
     * +---------------------+---------------------------------------------------------------------------------------------------------------------------------------+
     *
     * +----------+--------------------------------------------------------------------------------------------------------------------------------------------------+----------------+
     * | currency | items_json                                                                                                                                       | is_checked_out |
     * |----------+--------------------------------------------------------------------------------------------------------------------------------------------------+----------------|
     * | USD      | [{"sku": "SKU-123", "name": "Item 123", "quantity": 1, "unitPrice": 25}, {"sku": "SKU-456", "name": "Item 456", "quantity": 1, "unitPrice": 15}] | True           |
     * +----------+--------------------------------------------------------------------------------------------------------------------------------------------------+----------------+
     */
    it("projects the expected read model after item ops and checkout", async () => {
      // 1) Create cart
      const resp = await app.request(`/api/tenants/${tenantId}/carts`, {
        method: "POST",
        body: JSON.stringify(generateCartData()),
      });
      const { cartId } = (await resp.json()) as { cartId: string };
      expect(z.uuid().safeParse(cartId).success).toBe(true);
      await project();

      // 2) Add SKU-123 x2 @ $25
      await app.request(`/api/tenants/${tenantId}/carts/${cartId}/items`, {
        method: "PUT",
        body: JSON.stringify({
          action: "add",
          item: {
            sku: "SKU-123",
            name: "Item 123",
            unitPrice: 25,
            quantity: 2,
          },
        }),
      });

      // 3) Add SKU-456 x1 @ $15
      await app.request(`/api/tenants/${tenantId}/carts/${cartId}/items`, {
        method: "PUT",
        body: JSON.stringify({
          action: "add",
          item: {
            sku: "SKU-456",
            name: "Item 456",
            unitPrice: 15,
            quantity: 1,
          },
        }),
      });

      await project();

      // 4) Remove SKU-123 x1
      await app.request(`/api/tenants/${tenantId}/carts/${cartId}/items`, {
        method: "PUT",
        body: JSON.stringify({ action: "remove", sku: "SKU-123", quantity: 1 }),
      });

      await project();

      // 5) Checkout
      const checkout = await app.request(
        `/api/tenants/${tenantId}/carts/${cartId}/checkout`,
        {
          method: "PUT",
          body: JSON.stringify({ orderId: crypto.randomUUID(), total: 40 }),
        },
      );
      expect(checkout.status).toBe(201);

      await project();

      // Verify read model directly from DB to avoid driver JSON nuances
      const row = await db
        .selectFrom("carts")
        .select([
          "cart_id",
          "currency",
          "items_json",
          "is_checked_out",
          "is_cancelled",
        ])
        .where("tenant_id", "=", tenantId)
        .where("cart_id", "=", cartId)
        .executeTakeFirstOrThrow();

      const items = row.items_json as {
        items: Array<{
          sku: string;
          unitPrice: number;
          quantity: number;
        }>;
        orderId: string;
        total: number;
      };

      const sku123 = items.items.find((i) => i.sku === "SKU-123");
      const sku456 = items.items.find((i) => i.sku === "SKU-456");
      expect(sku123?.quantity).toBe(1);
      expect(sku123?.unitPrice).toBe(25);
      expect(sku456?.quantity).toBe(1);
      expect(sku456?.unitPrice).toBe(15);
      expect(items.orderId).toBeDefined();
      expect(items.total).toBe(40);
      expect(row.currency).toBe("USD");
      expect(row.is_checked_out).toBe(true);
      expect(row.is_cancelled).toBe(false);
    });
  });
});

function generateCartData() {
  return {
    currency: "USD",
  };
}

function generateItem() {
  return {
    sku: "SKU-123",
    name: "Test Item",
    unitPrice: 25,
    quantity: 1,
  };
}
