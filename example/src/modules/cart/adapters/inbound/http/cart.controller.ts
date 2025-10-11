/**
 * Cart HTTP Controller - Inbound adapter for HTTP requests
 * Translates HTTP requests to use case calls
 */

import { Hono } from "hono";
import { createContextMiddleware } from "../../../../../modules/shared/hono/context-middleware.js";
import type { Logger } from "../../../../../modules/shared/infra/logger.js";
import type { CartPort } from "../../../application/ports/inbound/cart.port.js";

export function createCartController({
  cartPort,
  logger,
}: {
  cartPort: CartPort;
  logger: Logger;
}) {
  const app = new Hono();
  app.use(createContextMiddleware());

  app.get("/api/tenants/:tenantId/carts", async (c) => {
    const tenantId = c.req.param("tenantId");
    try {
      const result = await cartPort.findAllByTenant({ tenantId });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getAllCarts");
      return c.json({ message: "Failed to get carts" }, 400);
    }
  });

  app.get("/api/tenants/:tenantId/carts/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    try {
      const result = await cartPort.findById({ tenantId, cartId: id });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getCartById");
      return c.json({ message: "Cart not found" }, 404);
    }
  });

  app.post("/api/tenants/:tenantId/carts", async (c) => {
    const tenantId = c.req.param("tenantId");
    const data = await c.req.json();
    try {
      const result = await cartPort.create({ ...data, tenantId });
      return c.json({ message: "Created!", cartId: result.cartId }, 201);
    } catch (error) {
      logger.error({ error }, "createCart");
      return c.json({ message: "Failed to create cart" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/items", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const body = await c.req.json();
    const { action } = body as { action: "add" | "remove" };
    try {
      if (action === "add") {
        await cartPort.addItem({ tenantId, cartId: id, item: body.item });
      } else {
        await cartPort.removeItem({
          tenantId,
          cartId: id,
          sku: body.sku,
          quantity: body.quantity,
        });
      }
      return c.json({ message: "OK" }, 201);
    } catch (error) {
      logger.error({ error }, "updateCartItems");
      return c.json({ message: "Failed to update cart items" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/empty", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    try {
      await cartPort.empty({ tenantId, cartId: id });
      return c.json({ message: "Emptied" }, 201);
    } catch (error) {
      logger.error({ error }, "emptyCart");
      return c.json({ message: "Failed to empty cart" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/checkout", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    try {
      await cartPort.checkout({ tenantId, cartId: id });
      return c.json({ message: "Checked out" }, 201);
    } catch (error) {
      logger.error({ error }, "checkoutCart");
      return c.json({ message: "Failed to checkout cart" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/cancel", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const body = await c.req.json();
    try {
      await cartPort.cancel({ tenantId, cartId: id, reason: body.reason });
      return c.json({ message: "Cancelled" }, 201);
    } catch (error) {
      logger.error({ error }, "cancelCart");
      return c.json({ message: "Failed to cancel cart" }, 400);
    }
  });

  return app;
}
