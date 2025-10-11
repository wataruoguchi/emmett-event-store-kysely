/**
 * Tenant HTTP Controller - Inbound adapter for HTTP requests
 * Translates HTTP requests to use case calls
 */

import { Hono } from "hono";
import type { Logger } from "../../../../../modules/shared/infra/logger.js";
import type { TenantPort } from "../../../application/ports/inbound/tenant.port.js";

export function createTenantController({
  tenantPort,
  logger,
}: {
  tenantPort: TenantPort;
  logger: Logger;
}) {
  const app = new Hono();

  app.get("/api/tenants", async (c) => {
    try {
      const result = await tenantPort.findAll();
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getAllTenants");
      return c.json({ message: "Failed to get tenants" }, 400);
    }
  });

  app.get("/api/tenants/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await tenantPort.findById(id);
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getTenantById");
      return c.json({ message: "Tenant not found" }, 404);
    }
  });

  app.post("/api/tenants", async (c) => {
    const data = await c.req.json();
    try {
      const result = await tenantPort.create(data);
      return c.json(result, 201);
    } catch (error) {
      logger.error({ error }, "createTenant");
      return c.json({ message: "Failed to create tenant" }, 400);
    }
  });

  return app;
}
