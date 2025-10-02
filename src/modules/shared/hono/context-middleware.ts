import type { Context } from "hono";
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export interface AppContext {
  requestId: string;
  userId: string;
  tenantId: string;
}

const als = new AsyncLocalStorage<AppContext>();

/**
 * The context middleware is used to store the request context in the AsyncLocalStorage.
 * Through the AsyncLocalStorage, we can access the context everywhere in the app.
 *
 * In this PoC, we use the context for updating `message.message_metadata` field.
 */
export function createContextMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const tenantId = c.req.param("tenantId") ?? "none";
    const appContext = {
      requestId: crypto.randomUUID(),
      userId: "mock-user-id", // TODO: This is coming from JWT, or a request header like X-User-Id.
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
      tenantId: "none",
    }
  );
}
