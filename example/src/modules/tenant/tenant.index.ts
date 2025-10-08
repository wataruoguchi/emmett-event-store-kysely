/**
 * Each module has one index.ts file. Everything in the module is exported from here.
 */
export {
  createTenantServiceAdapter,
  type TenantServiceAdapter,
} from "./adapter/tenant-service-adapter.js";
export { createTenantApp } from "./interface/tenant.interface.js";
