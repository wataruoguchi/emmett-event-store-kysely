import { faker } from "@faker-js/faker";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../../dev-tools/database/create-test-db.js";
import { seedTestDb } from "../../../dev-tools/database/seed-test-db.js";
import type { DB } from "../../shared/infra/db.js";
import { createTenantService } from "../../tenant/tenant.index.js";
import {
  createGeneratorApp,
  createGeneratorService,
} from "../generator.index.js";

describe("Generator Integration", () => {
  const TEST_DB_NAME = "generator_e2e_test";
  let app: Hono;
  let db: DB;
  let tenantId: string;

  beforeAll(async () => {
    db = await createTestDb(TEST_DB_NAME);
    app = createGeneratorApp({
      generatorService: createGeneratorService(
        { tenantService: createTenantService({ db }) },
        { db },
      ),
    });
    tenantId = (await seedTestDb(db).createTenant()).id;
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
      generatorId = (await response.json()).id;
    });

    it("should get a generator by id", async () => {
      const response = await app.request(
        `/api/tenants/${tenantId}/generators/${generatorId}`,
        {
          method: "GET",
        },
      );
      expect(response.status).toBe(200);
      expect((await response.json()).id).toEqual(generatorId);
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
