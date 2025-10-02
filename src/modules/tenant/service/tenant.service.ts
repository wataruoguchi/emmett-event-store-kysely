import { TenantEntitySchema } from "../domain/tenant.entity.js";
import { TenantInvalidInputError, TenantNotFoundError } from "../errors.js";
import type { TenantRepository } from "../repository/tenant.repo.js";

export type TenantService = ReturnType<typeof createTenantServiceFactory>;

type Dependencies = {
  repository: TenantRepository;
};

/**
 * Create a tenant service. This file has all the business logic for the tenant service.
 */
export function createTenantServiceFactory(deps: Dependencies) {
  return {
    get: createFindTenantByIdService(deps),
    getAll: createFindAllTenantsService(deps),
    create: createCreateTenantService(deps),
  };
}

function createFindTenantByIdService(deps: Dependencies) {
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

function createFindAllTenantsService(deps: Dependencies) {
  return async () => {
    return await deps.repository.findAll();
  };
}

function createCreateTenantService(deps: Dependencies) {
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
