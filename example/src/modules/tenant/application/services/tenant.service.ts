/**
 * Tenant Application Service - Implements the inbound port (use cases)
 * Contains the application logic and orchestrates domain operations
 */

import { TenantEntitySchema } from "../../domain/tenant.entity.js";
import { TenantInvalidInputError, TenantNotFoundError } from "../../errors.js";
import type { TenantPort } from "../ports/inbound/tenant.port.js";
import type { TenantRepositoryPort } from "../ports/outbound/tenant-repository.port.js";

type Dependencies = {
  repository: TenantRepositoryPort;
};

export function createTenantService(deps: Dependencies): TenantPort {
  return {
    findById: createFindTenantByIdUseCase(deps),
    findAll: createFindAllTenantsUseCase(deps),
    create: createCreateTenantUseCase(deps),
  };
}

function createFindTenantByIdUseCase(deps: Dependencies) {
  return async (tenantId: string) => {
    const tenant = await deps.repository.findById(tenantId);
    if (!tenant) {
      const tenantByTenantId = await deps.repository.findByTenantId(tenantId);
      if (!tenantByTenantId) {
        throw new TenantNotFoundError(`Tenant not found: ${tenantId}`);
      }
      return tenantByTenantId;
    }
    return tenant;
  };
}

function createFindAllTenantsUseCase(deps: Dependencies) {
  return async () => {
    return await deps.repository.findAll();
  };
}

function createCreateTenantUseCase(deps: Dependencies) {
  return async (input: { tenantId: string; name: string }) => {
    if (!input || typeof input !== "object") {
      throw new TenantInvalidInputError("Input must be an object");
    }
    const tenant = TenantEntitySchema.parse({
      ...input,
      id: crypto.randomUUID(),
    });
    return await deps.repository.create(tenant);
  };
}
