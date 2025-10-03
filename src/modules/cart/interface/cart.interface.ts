import { Hono } from "hono";
import { createEventStore } from "../../shared/event-sourcing/event-store.js";
import {
  createContextMiddleware,
  getContext,
} from "../../shared/hono/context-middleware.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import type { TenantService } from "../../tenant/tenant.index.js";
import { createCartRepository } from "../repository/cart.repo.js";
import {
  createCartServiceFactory,
  type CartService,
} from "../service/cart.service.js";
import { cartEventHandler } from "../service/event-sourcing/cart.event-handler.js";

export function createCartService(
  { tenantService }: { tenantService: TenantService },
  { db, logger }: { db: DatabaseExecutor; logger: Logger },
): CartService {
  const eventStore = createEventStore({ db, logger });
  return createCartServiceFactory({
    repository: createCartRepository({ db, logger }),
    findTenantByIdService: tenantService.get,
    handler: cartEventHandler({ eventStore, getContext }),
  });
}

function createCartApp({
  cartService,
  logger,
}: {
  cartService: CartService;
  logger: Logger;
}) {
  const app = new Hono();
  app.use(createContextMiddleware());

  app.get("/api/tenants/:tenantId/carts", async (c) => {
    const tenantId = c.req.param("tenantId");
    try {
      const result = await cartService.getAll({ tenantId });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getAllCarts");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  app.get("/api/tenants/:tenantId/carts/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    try {
      const result = await cartService.get({ tenantId, cartId: id });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getCartById");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  app.post("/api/tenants/:tenantId/carts", async (c) => {
    const tenantId = c.req.param("tenantId");
    const data = await c.req.json();
    try {
      const result = await cartService.create({ ...data, tenantId });
      const maybeState = (
        result as { newState?: { data?: { cartId?: string }; cartId?: string } }
      ).newState;
      const cartId = maybeState?.data?.cartId ?? maybeState?.cartId;
      return c.json({ message: "Created!", cartId }, 201);
    } catch (error) {
      logger.error({ error }, "createCart");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/items", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const body = await c.req.json();
    const { action } = body as { action: "add" | "remove" };
    try {
      if (action === "add") {
        await cartService.addItem({ tenantId, cartId: id, item: body.item });
      } else {
        await cartService.removeItem({
          tenantId,
          cartId: id,
          sku: body.sku,
          quantity: body.quantity,
        });
      }
      return c.json({ message: "OK" }, 201);
    } catch (error) {
      logger.error({ error }, "updateCartItems");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/empty", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    try {
      await cartService.empty({ tenantId, cartId: id });
      return c.json({ message: "Emptied" }, 201);
    } catch (error) {
      logger.error({ error }, "emptyCart");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/checkout", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const body = await c.req.json();
    try {
      await cartService.checkout({
        tenantId,
        cartId: id,
        orderId: body.orderId,
        total: body.total,
      });
      return c.json({ message: "Checked out" }, 201);
    } catch (error) {
      logger.error({ error }, "checkoutCart");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/carts/:id/cancel", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const body = await c.req.json();
    try {
      await cartService.cancel({ tenantId, cartId: id, reason: body.reason });
      return c.json({ message: "Cancelled" }, 201);
    } catch (error) {
      logger.error({ error }, "cancelCart");
      return c.json({ message: "Ugh!" }, 400);
    }
  });

  return app;
}

export { createCartApp };
