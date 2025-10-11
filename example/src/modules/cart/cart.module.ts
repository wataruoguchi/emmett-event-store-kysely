/**
 * Cart Module - Composition root
 * Wires together all the dependencies following hexagonal architecture
 */

import { getKyselyEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import { getContext } from "../shared/hono/context-middleware.js";
import type { DatabaseExecutor } from "../shared/infra/db.js";
import type { Logger } from "../shared/infra/logger.js";
import type { TenantPort } from "../tenant/tenant.module.js";
import { createCartController } from "./adapters/inbound/http/cart.controller.js";
import { createCartRepository } from "./adapters/outbound/persistence/cart.repository.js";
import { createTenantServiceAdapter } from "./adapters/outbound/services/tenant-service.adapter.js";
import { cartEventHandler } from "./application/event-sourcing/cart.event-handler.js";
import type { CartPort } from "./application/ports/inbound/cart.port.js";
import { createCartService } from "./application/services/cart.service.js";

/**
 * Creates the Cart Port (application service)
 * This is what other modules should depend on
 */
export function createCartModule({
  tenantPort,
  db,
  logger,
}: {
  tenantPort: TenantPort;
  db: DatabaseExecutor;
  logger: Logger;
}): CartPort {
  const eventStore = getKyselyEventStore({ db, logger });
  const repository = createCartRepository({ db, logger });
  const tenantService = createTenantServiceAdapter(tenantPort);
  const eventHandler = cartEventHandler({ eventStore, getContext });

  return createCartService({
    eventHandler,
    repository,
    tenantService,
  });
}

/**
 * Creates the Cart HTTP Controller
 * This is for HTTP routing and should be mounted in the main app
 */
export function createCartHttpAdapter({
  cartPort,
  logger,
}: {
  cartPort: CartPort;
  logger: Logger;
}) {
  return createCartController({ cartPort, logger });
}

// Re-export projection functions for workers
export {
  cartsSnapshotProjection,
  createCartsConsumer,
} from "./application/event-sourcing/cart.read-model.js";
// Re-export the port interface for other modules to use
export type { CartPort } from "./application/ports/inbound/cart.port.js";
