import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  createGeneratorApp,
  createGeneratorService,
} from "./modules/generator/generator.index.js";
import { getDb } from "./modules/shared/infra/db.js";
import { logger } from "./modules/shared/infra/logger.js";
import {
  createTenantApp,
  createTenantService,
} from "./modules/tenant/tenant.index.js";

const app = new Hono();
const db = getDb();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

const tenantService = createTenantService({ db, logger });
/**
 * Tenant module starts here
 */
app.route("", createTenantApp({ tenantService, logger }));

/**
 * Generator module starts here
 */
app.route(
  "",
  createGeneratorApp({
    generatorService: createGeneratorService({ tenantService }, { db, logger }),
    logger,
  }),
);

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT),
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);
