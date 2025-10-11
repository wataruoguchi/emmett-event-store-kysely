import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  createCartHttpAdapter,
  createCartModule,
} from "./modules/cart/cart.index.js";
import {
  createGeneratorHttpAdapter,
  createGeneratorModule,
} from "./modules/generator/generator.index.js";
import { getDb } from "./modules/shared/infra/db.js";
import { logger } from "./modules/shared/infra/logger.js";
import {
  createTenantHttpAdapter,
  createTenantModule,
} from "./modules/tenant/tenant.index.js";

const app = new Hono();
const db = getDb();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

/**
 * Module composition following Hexagonal Architecture
 * Each module exposes its port (application service) and HTTP adapter separately
 * Modules communicate through ports, not directly through repositories
 */

// Create Tenant module (independent, no dependencies on other modules)
const tenantPort = createTenantModule({ db, logger });

// Create Cart module (depends on Tenant port)
const cartPort = createCartModule({ tenantPort, db, logger });

// Create Generator module (depends on Tenant port)
const generatorPort = createGeneratorModule({ tenantPort, db, logger });

// Mount HTTP adapters
app.route("", createTenantHttpAdapter({ tenantPort, logger }));
app.route("", createCartHttpAdapter({ cartPort, logger }));
app.route("", createGeneratorHttpAdapter({ generatorPort, logger }));

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT),
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);
