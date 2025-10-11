/**
 * Cart Module Public API
 * Exports the module's public interface following hexagonal architecture
 */
export {
  cartsSnapshotProjection,
  createCartHttpAdapter,
  createCartModule,
  createCartsConsumer,
  type CartPort,
} from "./cart.module.js";
