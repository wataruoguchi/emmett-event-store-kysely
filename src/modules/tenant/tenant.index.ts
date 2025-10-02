/**
 * Each module has one index.ts file. Everything in the module is exported from here.
 */
export {
  createTenantApp,
  createTenantService,
} from "./interface/tenant.interface.js";
export type { TenantService } from "./service/tenant.service.js";
