/**
 * Outbound Port - Defines what the Generator module needs from the Tenant module
 * This ensures proper module boundaries - Generator depends on Tenant's public interface
 */

import type { TenantEntity } from "../../../../tenant/domain/tenant.entity.js";

export interface TenantServicePort {
  findById(tenantId: string): Promise<TenantEntity>;
}
