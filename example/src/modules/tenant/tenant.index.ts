/**
 * Tenant Module Public API
 * Exports the module's public interface following hexagonal architecture
 */
export {
  createTenantHttpAdapter,
  createTenantModule,
  type TenantPort,
} from "./tenant.module.js";
