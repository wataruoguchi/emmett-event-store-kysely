/**
 * Generator HTTP Controller - Inbound adapter for HTTP requests
 * Translates HTTP requests to use case calls
 */

import { Hono } from "hono";
import { createContextMiddleware } from "../../../../../modules/shared/hono/context-middleware.js";
import type { Logger } from "../../../../../modules/shared/infra/logger.js";
import type { GeneratorPort } from "../../../application/ports/inbound/generator.port.js";

export function createGeneratorController({
  generatorPort,
  logger,
}: {
  generatorPort: GeneratorPort;
  logger: Logger;
}) {
  const app = new Hono();
  app.use(createContextMiddleware());

  app.get("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");

    try {
      logger.info({ tenantId }, "getAllGenerators");
      const result = await generatorPort.findAllByTenant({ tenantId });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getAllGenerators");
      return c.json({ message: "Failed to get generators" }, 400);
    }
  });

  app.get("/api/tenants/:tenantId/generators/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    logger.info({ tenantId, id }, "getGeneratorById");
    try {
      const result = await generatorPort.findById({
        tenantId,
        generatorId: id,
      });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getGeneratorById");
      return c.json({ message: "Generator not found" }, 404);
    }
  });

  app.post("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");
    const data = await c.req.json();
    logger.info({ tenantId, data }, "createGenerator");

    try {
      const result = await generatorPort.create({ ...data, tenantId });
      return c.json(
        {
          message: "Created!",
          generatorId: result.generatorId,
        },
        201,
      );
    } catch (error) {
      logger.error({ error }, "createGenerator");
      return c.json({ message: "Failed to create generator" }, 400);
    }
  });

  app.put("/api/tenants/:tenantId/generators/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    const { isDeleted, ...data } = (await c.req.json()) as {
      isDeleted: boolean;
      data: unknown;
    };
    logger.info({ tenantId, id, data }, "updateGenerator");

    try {
      if (isDeleted) {
        await generatorPort.delete({ tenantId, generatorId: id });
        return c.json({ message: "Deleted!" }, 201);
      } else {
        // Spread data and ensure required fields are present
        await generatorPort.update({
          tenantId,
          generatorId: id,
          ...(data as any),
        });
        return c.json({ message: "Updated!" }, 201);
      }
    } catch (error) {
      logger.error({ error }, "updateGenerator");
      return c.json({ message: "Failed to update generator" }, 400);
    }
  });

  return app;
}
