import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  createGeneratorApp,
  createGeneratorService,
} from "./modules/generator/generator.index.js";
import { getDb } from "./modules/shared/infra/db.js";
import {
  createTenantApp,
  createTenantService,
} from "./modules/tenant/tenant.index.js";

const app = new Hono();
const db = getDb();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

const tenantService = createTenantService({ db });
app.route("", createTenantApp({ tenantService }));
app.route(
  "",
  createGeneratorApp({
    generatorService: createGeneratorService({ tenantService }, { db }),
  }),
);

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
