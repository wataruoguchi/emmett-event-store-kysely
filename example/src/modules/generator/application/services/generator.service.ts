/**
 * Generator Application Service - Implements the inbound port (use cases)
 * Contains the application logic and orchestrates domain operations
 */

import { GeneratorEntitySchema } from "../../domain/generator.entity.js";
import {
  GeneratorInvalidInputError,
  GeneratorNotFoundError,
  GeneratorTenantNotFoundError,
} from "../../errors.js";
import type { GeneratorEventHandler } from "../event-sourcing/generator.event-handler.js";
import type { GeneratorPort } from "../ports/inbound/generator.port.js";
import type { GeneratorRepositoryPort } from "../ports/outbound/generator-repository.port.js";
import type { TenantServicePort } from "../ports/outbound/tenant-service.port.js";

type Dependencies = {
  eventHandler: GeneratorEventHandler;
  repository: GeneratorRepositoryPort;
  tenantService: TenantServicePort;
};

/**
 * The write services should not check whether the generator exists in the read model.
 * They should not depend on the read model.
 * We use assertions in `createDecide` in `generator.event-handler.ts` to ensure
 * that the generator exists in the write model.
 */
export function createGeneratorService(deps: Dependencies): GeneratorPort {
  return {
    create: createCreateGeneratorUseCase(deps),
    update: createUpdateGeneratorUseCase(deps),
    delete: createDeleteGeneratorUseCase(deps),
    findById: createGetGeneratorUseCase(deps),
    findAllByTenant: createGetGeneratorsUseCase(deps),
  };
}

function createCreateGeneratorUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    // All the validation should be done before calling the handler.
    if (!input || typeof input !== "object") {
      throw new GeneratorInvalidInputError("Input must be an object");
    }
    const generatorId = crypto.randomUUID();
    const generator = GeneratorEntitySchema.parse({
      ...input,
      generatorId,
    });

    // Verify tenant exists
    const tenant = await tenantService.findById(generator.tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }

    await eventHandler.create(generator.generatorId, generator);
    return { generatorId };
  };
}

function createUpdateGeneratorUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async (input: unknown) => {
    const generator = GeneratorEntitySchema.parse(input);

    const tenant = await tenantService.findById(generator.tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }

    await eventHandler.update(generator.generatorId, generator);
  };
}

function createDeleteGeneratorUseCase({
  eventHandler,
  tenantService,
}: Pick<Dependencies, "eventHandler" | "tenantService">) {
  return async ({
    tenantId,
    generatorId,
  }: {
    tenantId: string;
    generatorId: string;
  }) => {
    if (!generatorId || typeof generatorId !== "string") {
      throw new GeneratorInvalidInputError("Input must be a string");
    }

    const tenant = await tenantService.findById(tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }

    await eventHandler.delete(generatorId, { tenantId, generatorId });
  };
}

function createGetGeneratorUseCase({
  repository,
  tenantService,
}: Pick<Dependencies, "repository" | "tenantService">) {
  return async ({
    tenantId,
    generatorId,
  }: {
    tenantId: string;
    generatorId: string;
  }) => {
    const tenant = await tenantService.findById(tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }

    const generator = await repository.findById(tenantId, generatorId);
    if (!generator) {
      throw new GeneratorNotFoundError("Generator not found");
    }

    // Map read model to domain entity
    return {
      tenantId: generator.tenant_id,
      generatorId: generator.generator_id,
      name: generator.name,
      address: generator.address ?? undefined,
      generatorType: generator.generator_type as any,
      notes: generator.notes ?? undefined,
    };
  };
}

function createGetGeneratorsUseCase({
  repository,
  tenantService,
}: Pick<Dependencies, "repository" | "tenantService">) {
  return async ({ tenantId }: { tenantId: string }) => {
    const tenant = await tenantService.findById(tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }

    const generators = await repository.findByTenantId(tenantId);

    // Map read models to domain entities
    return generators.map((generator) => ({
      tenantId: generator.tenant_id,
      generatorId: generator.generator_id,
      name: generator.name,
      address: generator.address ?? undefined,
      generatorType: generator.generator_type as any,
      notes: generator.notes ?? undefined,
    }));
  };
}
