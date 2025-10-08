import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createCartApp } from "./modules/cart/cart.index.js";
import {
  createGeneratorApp,
  createGeneratorService,
} from "./modules/generator/generator.index.js";
import { getDb } from "./modules/shared/infra/db.js";
import { logger } from "./modules/shared/infra/logger.js";
import {
  createTenantApp,
  createTenantServiceAdapter,
} from "./modules/tenant/tenant.index.js";

const app = new Hono();
const db = getDb();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

/**
 * Tenant module starts here
 */
app.route("", createTenantApp({ db, logger }));

// Create tenant service adapter for cart and generator modules
const tenantService = createTenantServiceAdapter({ db, logger });

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

/**
 * Cart module starts here
 */
app.route("", createCartApp({ db, logger }));

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT),
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);
