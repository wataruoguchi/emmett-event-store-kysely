/**
 * Tenant Service Adapter - Adapts the Tenant module's port to Cart module's needs
 * This demonstrates inter-module communication through ports
 */

import type { TenantPort } from "../../../../tenant/tenant.module.js";
import type { TenantServicePort } from "../../../application/ports/outbound/tenant-service.port.js";

/**
 * Creates an adapter that wraps the Tenant module's port
 * This allows the Cart module to depend on its own interface rather than Tenant's directly
 */
export function createTenantServiceAdapter(
  tenantPort: TenantPort,
): TenantServicePort {
  return {
    findById: async (tenantId: string) => {
      return await tenantPort.findById(tenantId);
    },
  };
}
