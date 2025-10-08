import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createCartApp } from "./modules/cart/cart.index.js";
import { createGeneratorApp } from "./modules/generator/generator.index.js";
import { getDb } from "./modules/shared/infra/db.js";
import { logger } from "./modules/shared/infra/logger.js";
import { createTenantApp } from "./modules/tenant/tenant.index.js";

const app = new Hono();
const db = getDb();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

/**
 * Tenant module starts here
 */
app.route("", createTenantApp({ db, logger }));

/**
 * Generator module starts here
 */
app.route("", createGeneratorApp({ db, logger }));

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
