/**
 * Inbound Port - Defines what the Tenant module offers to the outside world
 * This is the contract that external modules should depend on
 */

import type { TenantEntity } from "../../../domain/tenant.entity.js";

export interface TenantPort {
  /**
   * Find a tenant by its ID
   * @throws TenantNotFoundError if tenant doesn't exist
   */
  findById(tenantId: string): Promise<TenantEntity>;

  /**
   * Get all tenants
   */
  findAll(): Promise<TenantEntity[]>;

  /**
   * Create a new tenant
   * @throws TenantInvalidInputError if input is invalid
   */
  create(input: { tenantId: string; name: string }): Promise<TenantEntity>;
}
