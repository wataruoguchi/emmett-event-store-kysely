import type { Context } from "hono";
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export interface AppContext {
  requestId: string;
  userId: string;
  tenantId: string;
}

const als = new AsyncLocalStorage<AppContext>();

export function createContextMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const tenantId = c.req.param("tenantId") ?? "default_partition";
    const appContext = {
      requestId: crypto.randomUUID(),
      userId: "mock-user-id", // TODO: This is coming from the request.
      tenantId,
    };
    await als.run(appContext, () => next());
  };
}

export function getContext(): AppContext {
  return (
    als.getStore() ?? {
      requestId: crypto.randomUUID(),
      userId: "system",
      tenantId: "default_partition",
    }
  );
}
