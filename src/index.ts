import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { generatorInterface } from "./modules/generator/interface/generator.interface.js";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("", generatorInterface);

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
