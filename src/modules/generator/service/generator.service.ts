import { GeneratorEntitySchema } from "../domain/generator.entity.js";
import {
  GeneratorInvalidInputError,
  GeneratorNotFoundError,
  GeneratorTenantNotFoundError,
} from "../errors.js";
import type { GeneratorRepository } from "../repository/generator.repo.js";
import type { GeneratorEventHandler } from "./event-handler.js";

type Dependencies = {
  handler: GeneratorEventHandler;
  repository: GeneratorRepository;
  findTenantByIdService: (tenantId: string) => Promise<{
    tenantId: string;
    name: string;
  }>;
};

export function createGeneratorService(deps: Dependencies) {
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
  repository,
  findTenantByIdService,
}: Dependencies) {
  return async (input: unknown) => {
    const generator = GeneratorEntitySchema.parse(input);
    const tenant = await findTenantByIdService(generator.tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    const existingGenerator = await repository.findById(
      generator.tenantId,
      generator.generatorId,
    );
    if (!existingGenerator) {
      throw new GeneratorNotFoundError("Generator not found");
    }
    return await handler.update(generator.generatorId, generator);
  };
}

function createDeleteGeneratorService({
  handler,
  repository,
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
    const existingGenerator = await repository.findById(tenantId, generatorId);
    if (!existingGenerator) {
      throw new GeneratorNotFoundError("Generator not found");
    }
    return await handler.delete(generatorId);
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
