/**
 * Tenant Module - Composition root
 * Wires together all the dependencies following hexagonal architecture
 */

import type { DatabaseExecutor } from "../shared/infra/db.js";
import type { Logger } from "../shared/infra/logger.js";
import { createTenantController } from "./adapters/inbound/http/tenant.controller.js";
import { createTenantRepository } from "./adapters/outbound/persistence/tenant.repository.js";
import type { TenantPort } from "./application/ports/inbound/tenant.port.js";
import { createTenantService } from "./application/services/tenant.service.js";

/**
 * Creates the Tenant Port (application service)
 * This is what other modules should depend on
 */
export function createTenantModule({
  db,
  logger,
}: {
  db: DatabaseExecutor;
  logger: Logger;
}): TenantPort {
  const repository = createTenantRepository({ db, logger });
  return createTenantService({ repository });
}

/**
 * Creates the Tenant HTTP Controller
 * This is for HTTP routing and should be mounted in the main app
 */
export function createTenantHttpAdapter({
  tenantPort,
  logger,
}: {
  tenantPort: TenantPort;
  logger: Logger;
}) {
  return createTenantController({ tenantPort, logger });
}

// Re-export the port interface for other modules to use
export type { TenantPort } from "./application/ports/inbound/tenant.port.js";
