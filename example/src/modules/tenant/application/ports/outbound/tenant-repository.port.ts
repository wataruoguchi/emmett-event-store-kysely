/**
 * Outbound Port - Defines what the Tenant module needs from persistence
 * This interface must be implemented by the persistence adapter
 */

import type { TenantEntity } from "../../../domain/tenant.entity.js";

export interface TenantRepositoryPort {
  findById(id: string): Promise<TenantEntity | undefined>;
  findByTenantId(tenantId: string): Promise<TenantEntity | undefined>;
  findAll(): Promise<TenantEntity[]>;
  create(tenant: TenantEntity): Promise<TenantEntity>;
}
