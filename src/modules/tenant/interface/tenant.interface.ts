import { Hono } from "hono";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import { createTenantRepository } from "../repository/tenant.repo.js";
import {
  createTenantServiceFactory,
  type TenantService,
} from "../service/tenant.service.js";

export function createTenantService({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): TenantService {
  return createTenantServiceFactory({
    repository: createTenantRepository({ db, logger }),
  });
}

function createTenantApp({
  tenantService,
  logger,
}: {
  tenantService: TenantService;
  logger: Logger;
}) {
  const app = new Hono();
  app.get("/api/tenants", async (c) => {
    const result = await tenantService.getAll();
    try {
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getAllTenants");
      return c.json(
        {
          message: "Ugh!",
        },
        400,
      );
    }
  });

  app.get("/api/tenants/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await tenantService.get(id);
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getTenantById");
      return c.json(
        {
          message: "Ugh!",
        },
        400,
      );
    }
  });

  app.post("/api/tenants", async (c) => {
    const data = await c.req.json();
    try {
      const result = await tenantService.create(data);
      return c.json(result, 201);
    } catch (error) {
      logger.error({ error }, "createTenant");
      return c.json(
        {
          message: "Ugh!",
        },
        400,
      );
    }
  });
  return app;
}
export { createTenantApp };
