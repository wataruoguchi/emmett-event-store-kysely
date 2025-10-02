import { Hono } from "hono";
import { createEventStore } from "../../shared/event-sourcing/event-store.js";
import {
  createContextMiddleware,
  getContext,
} from "../../shared/hono/context-middleware.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import type { TenantService } from "../../tenant/tenant.index.js";
import { createGeneratorRepository } from "../repository/generator.repo.js";
import { generatorEventHandler } from "../service/event-sourcing/generator.event-handler.js";
import {
  createGeneratorServiceFactory,
  type GeneratorService,
} from "../service/generator.service.js";

/**
 * Like index.ts, this file is the entry point for the generator module.
 */
export function createGeneratorService(
  { tenantService }: { tenantService: TenantService },
  { db, logger }: { db: DatabaseExecutor; logger: Logger },
): GeneratorService {
  const eventStore = createEventStore({ db, logger });

  return createGeneratorServiceFactory({
    repository: createGeneratorRepository({ db, logger }),
    findTenantByIdService: tenantService.get,
    handler: generatorEventHandler({
      eventStore,
      getContext,
    }),
  });
}

/**
 * Create a generator app. This function has all the HTTP logic for the generator app.
 */
function createGeneratorApp({
  generatorService,
  logger,
}: {
  generatorService: GeneratorService;
  logger: Logger;
}) {
  const app = new Hono();
  app.use(createContextMiddleware());
  app.get("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");

    try {
      logger.info({ tenantId }, "getAllGenerators");
      const result = await generatorService.getAll({ tenantId });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getAllGenerators");
      return c.json(
        {
          message: "Ugh!",
        },
        400,
      );
    }
  });

  app.get("/api/tenants/:tenantId/generators/:id", async (c) => {
    const tenantId = c.req.param("tenantId");
    const id = c.req.param("id");
    logger.info({ tenantId, id }, "getGeneratorById");
    try {
      const result = await generatorService.get({ tenantId, generatorId: id });
      return c.json(result);
    } catch (error) {
      logger.error({ error }, "getGeneratorById");
      return c.json(
        {
          message: "Ugh!",
        },
        400,
      );
    }
  });

  app.post("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");
    const data = await c.req.json();
    logger.info({ tenantId, data }, "createGenerator");

    try {
      const result = await generatorService.create({ ...data, tenantId });
      logger.info({ result: createLogBody(result) }, "createGenerator");
      // TODO: Schedule projection for this stream without blocking the response. e.g., using worker
      return c.json(
        {
          message: "Created!",
          ...(result?.newState?.data && {
            generatorId: result?.newState?.data?.generatorId,
          }),
        },
        201,
      );
    } catch (error) {
      logger.error({ error }, "createGenerator");
      return c.json(
        {
          message: "Ugh!",
        },
        400,
      );
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
      const result = isDeleted
        ? await generatorService.delete({ tenantId, generatorId: id })
        : await generatorService.update({ ...data, tenantId, generatorId: id });
      logger.info({ result: createLogBody(result) }, "updateGenerator");
      // TODO: Schedule projection for this stream without blocking the response
      return c.json(
        {
          message: isDeleted ? "Deleted!" : "Updated!",
        },
        201,
      );
    } catch (error) {
      logger.error({ error }, "updateGenerator");
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

export { createGeneratorApp };

function createLogBody(result: unknown) {
  if (typeof result !== "object" || result === null) return;
  if (!("newEvents" in result) || !("newState" in result)) return;
  const { newEvents, newState, ...rest } = result;
  return {
    newEvents: JSON.stringify(newEvents),
    newState: JSON.stringify(newState),
    ...rest,
  };
}
