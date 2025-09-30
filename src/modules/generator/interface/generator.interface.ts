import { Hono } from "hono";
import { createEventStore } from "../../shared/event-sourcing/event-store.js";
import {
  createContextMiddleware,
  getContext,
} from "../../shared/hono/context-middleware.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { TenantService } from "../../tenant/tenant.index.js";
import { createGeneratorRepository } from "../repository/generator.repo.js";
import { generatorEventHandler } from "../service/event-sourcing/generator.event-handler.js";
import {
  createGeneratorServiceFactory,
  type GeneratorService,
} from "../service/generator.service.js";

export function createGeneratorService(
  { tenantService }: { tenantService: TenantService },
  { db }: { db: DatabaseExecutor },
): GeneratorService {
  const eventStore = createEventStore({ db });

  return createGeneratorServiceFactory({
    repository: createGeneratorRepository(db),
    findTenantByIdService: tenantService.get,
    handler: generatorEventHandler({
      eventStore,
      getContext,
    }),
  });
}

function createGeneratorApp({
  generatorService,
}: {
  generatorService: GeneratorService;
}) {
  const app = new Hono();
  app.use(createContextMiddleware());
  app.get("/api/tenants/:tenantId/generators", async (c) => {
    const tenantId = c.req.param("tenantId");

    try {
      const result = await generatorService.getAll({ tenantId });
      return c.json(result);
    } catch (error) {
      console.log({ error });
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
    try {
      const result = await generatorService.get({ tenantId, generatorId: id });
      return c.json(result);
    } catch (error) {
      console.log({ error });
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

    try {
      const result = await generatorService.create({ ...data, tenantId });
      logResult(result);
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
      console.log({ error });
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

    try {
      const result = isDeleted
        ? await generatorService.delete({ tenantId, generatorId: id })
        : await generatorService.update({ ...data, tenantId, generatorId: id });
      logResult(result);
      return c.json(
        {
          message: isDeleted ? "Deleted!" : "Updated!",
        },
        201,
      );
    } catch (error) {
      console.log({ error });
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

function logResult(result: unknown) {
  if (typeof result !== "object" || result === null) return;
  if (!("newEvents" in result) || !("newState" in result)) return;
  const { newEvents, newState, ...rest } = result;
  console.log({
    newEvents: JSON.stringify(newEvents),
    newState: JSON.stringify(newState),
    ...rest,
  });
}
