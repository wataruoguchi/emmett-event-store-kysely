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

type GetGenerator = ReturnType<typeof createGetGeneratorService>;
export type GeneratorService = ReturnType<typeof createGeneratorServiceFactory>;
/**
 * Create a generator service. This file has all the business logic for the generator service.
 */
export function createGeneratorServiceFactory(deps: Dependencies) {
  const get: GetGenerator = createGetGeneratorService(deps);

  return {
    create: createCreateGeneratorService(deps),
    update: createUpdateGeneratorService({ get }, deps),
    delete: createDeleteGeneratorService({ get }, deps),
    get,
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

function createUpdateGeneratorService(
  { get }: { get: GetGenerator },
  {
    handler,
    findTenantByIdService,
  }: Pick<Dependencies, "handler" | "findTenantByIdService">,
) {
  return async (input: unknown) => {
    const generator = GeneratorEntitySchema.parse(input);
    const tenant = await findTenantByIdService(generator.tenantId);
    if (!tenant) {
      throw new GeneratorTenantNotFoundError("Tenant not found");
    }
    const existingGenerator = await get({
      tenantId: generator.tenantId,
      generatorId: generator.generatorId,
    });
    if (!existingGenerator) {
      throw new GeneratorNotFoundError("Generator not found");
    }
    return await handler.update(generator.generatorId, generator);
  };
}

function createDeleteGeneratorService(
  { get }: { get: GetGenerator },
  { handler, findTenantByIdService }: Dependencies,
) {
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
    const existingGenerator = await get({
      tenantId: tenantId,
      generatorId: generatorId,
    });
    if (!existingGenerator) {
      throw new GeneratorNotFoundError("Generator not found");
    }
    return await handler.delete(generatorId, { tenantId, generatorId }); // TODO: Review the interface
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
