/**
 * Generator Module Public API
 * Exports the module's public interface following hexagonal architecture
 */
export {
  createGeneratorHttpAdapter,
  createGeneratorModule,
  createGeneratorsConsumer,
  generatorsSnapshotProjection,
  type GeneratorPort,
} from "./generator.module.js";
