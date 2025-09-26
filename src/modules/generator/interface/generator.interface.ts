import { Hono } from "hono";
import { eventStore } from "../../shared/event-sourcing/event-store.js";
import { getDb } from "../../shared/infra/db.js";
import { findTenantByIdService } from "../../tenant/service/tenant.service.js";
import { createGeneratorRepository } from "../repository/generator.repo.js";
import { generatorEventHandler } from "../service/event-handler.js";
import { createGeneratorService } from "../service/generator.service.js";

const service = createGeneratorService({
  handler: generatorEventHandler({ eventStore }),
  repository: createGeneratorRepository(getDb()),
  findTenantByIdService,
});

const app = new Hono();
app.get("/api/tenants/:tenantId/generators", async (c) => {
  const tenantId = c.req.param("tenantId");

  try {
    const result = await service.getAll({ tenantId });
    return c.json(result);
  } catch (error) {
    console.log({ error });
    return c.json({
      message: "Ugh!",
    });
  }
});

app.get("/api/tenants/:tenantId/generators/:id", async (c) => {
  const tenantId = c.req.param("tenantId");
  const id = c.req.param("id");
  try {
    const result = await service.get({ tenantId, generatorId: id });
    return c.json(result);
  } catch (error) {
    console.log({ error });
    return c.json({
      message: "Ugh!",
    });
  }
});

app.post("/api/tenants/:tenantId/generators", async (c) => {
  const tenantId = c.req.param("tenantId");
  const data = await c.req.json();

  try {
    const result = await service.create({ ...data, tenantId });
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
    return c.json({
      message: "Ugh!",
    });
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
      ? await service.delete({ tenantId, generatorId: id })
      : await service.update({ ...data, tenantId, generatorId: id });
    logResult(result);
    return c.json(
      {
        message: isDeleted ? "Deleted!" : "Updated!",
      },
      201,
    );
  } catch (error) {
    console.log({ error });
    return c.json({
      message: "Ugh!",
    });
  }
});

export { app as generatorInterface };

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
