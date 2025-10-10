import type { TenantService } from "../../tenant/tenant.index.js";
import { GeneratorEntitySchema } from "../domain/generator.entity.js";
import {
  GeneratorInvalidInputError,
  GeneratorNotFoundError,
  GeneratorTenantNotFoundError,
} from "../errors.js";
import type { GeneratorRepository } from "../repository/generator.repo.js";
import type { GeneratorEventHandler } from "./event-sourcing/generator.event-handler.js";

type Dependencies = {
  handler: GeneratorEventHandler;
  repository: GeneratorRepository;
  findTenantByIdService: TenantService["get"];
};

export type GeneratorService = ReturnType<typeof createGeneratorServiceFactory>;
/**
 * Create a generator service. This file has all the business logic for the generator service.
 */
/**
 * The Writes services should not check whether the generator exists in the read model.
 * They should not depend on the read model.
 *
 * We use assertions in `createDecide` in `cart.event-handler.ts` to ensure that the cart exists in the write model.
 */
export function createGeneratorServiceFactory(deps: Dependencies) {
  return {
    create: createCreateGeneratorService(deps),
    update: createUpdateGeneratorService(deps),
    delete: createDeleteGeneratorService(deps),
    get: createGetGeneratorService(deps),
    getAll: createGetGeneratorsService(deps),
  };
}

function createCreateGeneratorService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    // All the validation should be done before calling the handler.
    if (!input || typeof input !== "object") {
      throw new GeneratorInvalidInputError("Input must be an object");
    }
    const generator = GeneratorEntitySchema.parse({
      ...input,
      generatorId: crypto.randomUUID(),
    });
    const tenant = await findTenantByIdService(generator.tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    return await handler.create(generator.generatorId, generator);
  };
}

function createUpdateGeneratorService({
  handler,
  findTenantByIdService,
}: Pick<Dependencies, "handler" | "findTenantByIdService">) {
  return async (input: unknown) => {
    const generator = GeneratorEntitySchema.parse(input);
    const tenant = await findTenantByIdService(generator.tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    return await handler.update(generator.generatorId, generator);
  };
}

function createDeleteGeneratorService({
  handler,
  findTenantByIdService,
}: Dependencies) {
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
    const tenant = await findTenantByIdService(tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    return await handler.delete(generatorId, { tenantId, generatorId });
  };
}

function createGetGeneratorService({
  repository,
  findTenantByIdService,
}: Pick<Dependencies, "repository" | "findTenantByIdService">) {
  return async ({
    tenantId,
    generatorId,
  }: {
    tenantId: string;
    generatorId: string;
  }) => {
    const tenant = await findTenantByIdService(tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    const generator = await repository.findById(tenantId, generatorId);
    if (!generator) {
      throw new GeneratorNotFoundError("Generator not found");
    }
    return generator;
  };
}

function createGetGeneratorsService({
  repository,
  findTenantByIdService,
}: Pick<Dependencies, "repository" | "findTenantByIdService">) {
  return async ({ tenantId }: { tenantId: string }) => {
    const tenant = await findTenantByIdService(tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    return await repository.findByTenantId(tenantId);
  };
}
