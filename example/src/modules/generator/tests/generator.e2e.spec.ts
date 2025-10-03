import { faker } from "@faker-js/faker";
import { createReadStream } from "@wataruoguchi/event-sourcing";
import {
  createProjectionRegistry,
  createProjectionRunner,
} from "@wataruoguchi/event-sourcing/projections";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import z from "zod";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import { seedTestDb } from "../../../dev-tools/database/seed-test-db.js";
import type { DatabaseExecutor } from "../../shared/infra/db.js";
import type { Logger } from "../../shared/infra/logger.js";
import { createTenantService } from "../../tenant/tenant.index.js";
import {
  createGeneratorApp,
  createGeneratorService,
} from "../generator.index.js";
import { generatorsProjection } from "../service/event-sourcing/generator.read-model.js";
import type { GeneratorService } from "../service/generator.service.js";

describe("Generator Integration", () => {
  const TEST_DB_NAME = "generator_e2e_test";
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  let app: Hono;
  let db: DatabaseExecutor;
  let tenantId: string;
  let project: (opts?: { batchSize?: number }) => Promise<void>;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_NAME);
    app = createGeneratorApp({
      generatorService: createGeneratorService(
        { tenantService: createTenantService({ db, logger }) },
        { db, logger },
      ),
      logger,
    });
    tenantId = (await seedTestDb(db).createTenant()).id;

    // Projection runner (in-test integration of the worker)
    const readStream = createReadStream({ db, logger });
    const registry = createProjectionRegistry(generatorsProjection());
    const runner = createProjectionRunner({
      db,
      readStream,
      registry,
    });
    project = async ({ batchSize = 500 } = {}) => {
      const streams = await db
        .selectFrom("streams")
        .select(["stream_id"])
        .where("is_archived", "=", false)
        .where("partition", "=", tenantId)
        .where("stream_type", "=", "generator")
        .execute();
      for (const s of streams) {
        const streamId = s.stream_id as string;
        const subscriptionId = `generators-read-model:${streamId}`;
        await runner.projectEvents(subscriptionId, streamId, {
          partition: tenantId,
          batchSize,
        });
      }
    };
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("should create a generator", async () => {
    const generatorData = generateGeneratorData();
    expect(tenantId).toBeDefined();
    expect(generatorData).toBeDefined();
    const response = await app.request(`/api/tenants/${tenantId}/generators`, {
      method: "POST",
      body: JSON.stringify(generatorData),
    });
    expect(response.status).toBe(201);
  });

  describe("should update a generator", () => {
    let generatorId: string;
    beforeEach(async () => {
      const generatorData = generateGeneratorData();
      const response = await app.request(
        `/api/tenants/${tenantId}/generators`,
        {
          method: "POST",
          body: JSON.stringify(generatorData),
        },
      );
      const json = await response.json();
      generatorId = json.generatorId;
      await project();
    });

    it("should update a generator", async () => {
      expect(generatorId).toBeDefined();
      expect(z.uuid().safeParse(generatorId).success).toBe(true);

      const response = await app.request(
        `/api/tenants/${tenantId}/generators/${generatorId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            isDeleted: false,
            name: "Updated Generator",
          }),
        },
      );
      expect(response.status).toBe(201);
    });

    it("should delete a generator", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/generators/${generatorId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            isDeleted: true,
          }),
        },
      );
      expect(response.status).toBe(201);
    });
  });

  describe("should get a generator by id", () => {
    let generatorId: string;
    beforeAll(async () => {
      const generatorData = generateGeneratorData();
      const response = await app.request(
        `/api/tenants/${tenantId}/generators`,
        {
          method: "POST",
          body: JSON.stringify(generatorData),
        },
      );
      const json = await response.json();
      generatorId = json.generatorId;
      await project();
    });

    it("should get a generator by id", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/generators/${generatorId}`,
        {
          method: "GET",
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.generator_id).toEqual(generatorId);
    });
  });

  describe("should get a deleted generator by id", () => {
    let generatorId: string;
    beforeAll(async () => {
      await (async function createGenerator() {
        const generatorData = generateGeneratorData();
        const response = await app.request(
          `/api/tenants/${tenantId}/generators`,
          {
            method: "POST",
            body: JSON.stringify(generatorData),
          },
        );
        const json = await response.json();
        generatorId = json.generatorId;
      })();
      await (async function updateGenerator() {
        await app.request(
          `/api/tenants/${tenantId}/generators/${generatorId}`,
          {
            method: "PUT",
            body: JSON.stringify({ name: "It will be deleted" }),
          },
        );
      })();
      await project();
      await (async function deleteGenerator() {
        await app.request(
          `/api/tenants/${tenantId}/generators/${generatorId}`,
          {
            method: "PUT",
            body: JSON.stringify({ isDeleted: true }),
          },
        );
      })();
      await project();
    });

    it("should get a generator by id", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/generators/${generatorId}`,
        {
          method: "GET",
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.generator_id).toEqual(generatorId);
      expect(body.is_deleted).toBe(true);
    });
  });

  describe("should list generators for tenant", () => {
    let generatorId: string;
    beforeAll(async () => {
      const generatorData = generateGeneratorData();
      const response = await app.request(
        `/api/tenants/${tenantId}/generators`,
        {
          method: "POST",
          body: JSON.stringify(generatorData),
        },
      );
      const json = await response.json();
      generatorId = json.generatorId;
      await project();
    });

    it("should return at least one generator for tenant", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/generators`,
        {
          method: "GET",
        },
      );
      expect(response.status).toBe(200);
      // Type Declaration should come from the interface, not the implementation.
      const list = (await response.json()) as Awaited<
        ReturnType<GeneratorService["getAll"]>
      >;
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((g) => g && g.generator_id === generatorId)).toBe(true);
    });
  });
});

function generateGeneratorData() {
  return {
    name: faker.company.name(),
    address: faker.location.streetAddress(),
    notes: faker.lorem.sentence(),
    generatorType: faker.helpers.arrayElement([
      "commercial",
      "residential",
      "industrial",
      "agricultural",
      "other",
    ]),
  };
}
