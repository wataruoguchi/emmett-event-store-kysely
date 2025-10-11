/**
 * Inbound Port - Defines what the Generator module offers to the outside world
 * This is the contract that external modules should depend on
 */

import type { GeneratorEntity } from "../../../domain/generator.entity.js";

export interface GeneratorPort {
  // Commands (write operations)
  create(
    input: Omit<GeneratorEntity, "generatorId">,
  ): Promise<{ generatorId: string }>;

  update(input: GeneratorEntity): Promise<void>;

  delete(input: { tenantId: string; generatorId: string }): Promise<void>;

  // Queries (read operations)
  findById(input: {
    tenantId: string;
    generatorId: string;
  }): Promise<GeneratorEntity>;

  findAllByTenant(input: { tenantId: string }): Promise<GeneratorEntity[]>;
}
