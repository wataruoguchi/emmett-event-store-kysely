import { faker } from "@faker-js/faker";
import type { DatabaseExecutor } from "../../modules/shared/infra/db.js";
import { createTenantService } from "../../modules/tenant/tenant.index.js";
export function seedTestDb(db: DatabaseExecutor) {
  const tenantService = createTenantService({ db });

  return {
    async createTenant(_name?: string) {
      const name = _name || faker.company.name();
      const tenantId = name.toLowerCase().replace(/ /g, "_");
      return await tenantService.create({
        tenantId,
        name,
      });
    },
  };
}
